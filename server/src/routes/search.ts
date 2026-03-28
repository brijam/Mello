import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { searchQuerySchema } from '@mello/shared';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';
import { ZodError } from 'zod';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeCursor(cursor: string): { rank: number; cardId: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const sepIdx = decoded.indexOf(':');
    if (sepIdx === -1) return null;
    const rank = parseFloat(decoded.substring(0, sepIdx));
    const cardId = decoded.substring(sepIdx + 1);
    if (isNaN(rank) || !UUID_RE.test(cardId)) return null;
    return { rank, cardId };
  } catch {
    return null;
  }
}

function encodeCursor(rank: number, cardId: string): string {
  return Buffer.from(`${rank}:${cardId}`).toString('base64');
}

export async function searchRoutes(app: FastifyInstance) {
  app.get('/search', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.userId!;

    // Validate query params
    let params;
    try {
      params = searchQuerySchema.parse(request.query);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new ValidationError(err.errors.map((e) => e.message).join(', '));
      }
      throw err;
    }

    const { q, workspaceId, boardId, limit, cursor } = params;
    const labelIds = params.labels ? params.labels.split(',').map(s => s.trim()) : [];
    const memberIds = params.members ? params.members.split(',').map(s => s.trim()) : [];

    // Validate label UUIDs
    if (labelIds.length > 0 && !labelIds.every(id => UUID_RE.test(id))) {
      throw new ValidationError('Invalid label UUID');
    }

    // Validate member UUIDs
    if (memberIds.length > 0 && !memberIds.every(id => UUID_RE.test(id))) {
      throw new ValidationError('Invalid member UUID');
    }

    // Validate cursor
    let cursorData: { rank: number; cardId: string } | null = null;
    if (cursor) {
      cursorData = decodeCursor(cursor);
      if (!cursorData) {
        throw new ValidationError('Invalid cursor');
      }
    }

    // Check if tsquery is empty (stop words only)
    const tsqueryCheck = await db.execute(
      sql`SELECT websearch_to_tsquery('english', ${q})::text AS tsq`
    );
    const tsqText = (tsqueryCheck as any)[0]?.tsq;
    if (!tsqText || tsqText === '') {
      return reply.send({ results: [], nextCursor: null });
    }

    // Build the search query dynamically using sql tagged templates
    const limitPlusOne = limit + 1;

    // Build filter fragments
    const wsFilter = workspaceId ? sql` AND b.workspace_id = ${workspaceId}` : sql``;
    const boardFilter = boardId ? sql` AND b.id = ${boardId}` : sql``;

    // Label filter: card must have ALL specified labels
    let labelFilter = sql``;
    if (labelIds.length > 0) {
      // Build IN list for labels
      let labelInList = sql`${labelIds[0]}`;
      for (let i = 1; i < labelIds.length; i++) {
        labelInList = sql`${labelInList}, ${labelIds[i]}`;
      }
      labelFilter = sql` AND c.id IN (
        SELECT cl.card_id FROM card_labels cl
        WHERE cl.label_id IN (${labelInList})
        GROUP BY cl.card_id
        HAVING COUNT(DISTINCT cl.label_id) = ${labelIds.length}
      )`;
    }

    // Member filter: card must have at least ONE specified member
    let memberFilter = sql``;
    if (memberIds.length > 0) {
      let memberInList = sql`${memberIds[0]}`;
      for (let i = 1; i < memberIds.length; i++) {
        memberInList = sql`${memberInList}, ${memberIds[i]}`;
      }
      memberFilter = sql` AND c.id IN (
        SELECT ca.card_id FROM card_assignments ca
        WHERE ca.user_id IN (${memberInList})
      )`;
    }

    // Cursor filter
    let cursorFilter = sql``;
    if (cursorData) {
      cursorFilter = sql` AND (ts_rank(c.search_vector, websearch_to_tsquery('english', ${q})), c.id) < (${cursorData.rank}::float, ${cursorData.cardId}::uuid)`;
    }

    // Card matches query - search cards by name/description
    const cardMatchesQuery = sql`
      SELECT
        c.id AS card_id,
        c.name AS card_name,
        l.id AS list_id,
        l.name AS list_name,
        b.id AS board_id,
        b.name AS board_name,
        b.workspace_id,
        CASE
          WHEN to_tsvector('english', coalesce(c.name, '')) @@ websearch_to_tsquery('english', ${q})
          THEN 'name'
          ELSE 'description'
        END AS match_source,
        CASE
          WHEN to_tsvector('english', coalesce(c.name, '')) @@ websearch_to_tsquery('english', ${q})
          THEN ts_headline('english', c.name, websearch_to_tsquery('english', ${q}), 'MaxWords=35, MinWords=15, MaxFragments=1, StartSel=<mark>, StopSel=</mark>')
          ELSE ts_headline('english', coalesce(c.description, ''), websearch_to_tsquery('english', ${q}), 'MaxWords=35, MinWords=15, MaxFragments=1, StartSel=<mark>, StopSel=</mark>')
        END AS snippet,
        ts_rank(c.search_vector, websearch_to_tsquery('english', ${q})) AS rank
      FROM cards c
      JOIN lists l ON l.id = c.list_id
      JOIN boards b ON b.id = c.board_id
      JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = ${userId}
      WHERE c.search_vector @@ websearch_to_tsquery('english', ${q})
      ${wsFilter}
      ${boardFilter}
      ${labelFilter}
      ${memberFilter}
    `;

    // Comment matches query - search comments, deduplicate by card
    const commentMatchesQuery = sql`
      SELECT DISTINCT ON (c.id)
        c.id AS card_id,
        c.name AS card_name,
        l.id AS list_id,
        l.name AS list_name,
        b.id AS board_id,
        b.name AS board_name,
        b.workspace_id,
        'comment'::text AS match_source,
        ts_headline('english', cm.body, websearch_to_tsquery('english', ${q}), 'MaxWords=35, MinWords=15, MaxFragments=1, StartSel=<mark>, StopSel=</mark>') AS snippet,
        ts_rank(cm.search_vector, websearch_to_tsquery('english', ${q})) AS rank
      FROM comments cm
      JOIN cards c ON c.id = cm.card_id
      JOIN lists l ON l.id = c.list_id
      JOIN boards b ON b.id = c.board_id
      JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = ${userId}
      WHERE cm.search_vector @@ websearch_to_tsquery('english', ${q})
      ${wsFilter}
      ${boardFilter}
      ${labelFilter}
      ${memberFilter}
      ORDER BY c.id, ts_rank(cm.search_vector, websearch_to_tsquery('english', ${q})) DESC
    `;

    // Combined query with deduplication and pagination
    let cursorCombinedFilter = sql``;
    if (cursorData) {
      // Exclude all cards already seen: rank must be strictly less, OR same rank with lower card_id
      // Use text comparison on rank to avoid float precision issues
      cursorCombinedFilter = sql` WHERE r.card_id <> ${cursorData.cardId}::uuid AND (r.rank < ${sql.raw(String(cursorData.rank))}::double precision OR (r.rank <= ${sql.raw(String(cursorData.rank))}::double precision AND r.card_id < ${cursorData.cardId}::uuid))`;
    }

    const fullQuery = sql`
      WITH card_matches AS (${cardMatchesQuery}),
      comment_matches AS (${commentMatchesQuery}),
      combined AS (
        SELECT * FROM card_matches
        UNION ALL
        SELECT * FROM comment_matches
        WHERE comment_matches.card_id NOT IN (SELECT card_id FROM card_matches)
      )
      SELECT r.*
      FROM combined r
      ${cursorCombinedFilter}
      ORDER BY r.rank DESC, r.card_id DESC
      LIMIT ${limitPlusOne}
    `;

    const results = await db.execute(fullQuery);
    const rows = [...(results as any[])];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const formattedResults = pageRows.map((row: any) => ({
      type: 'card' as const,
      cardId: row.card_id,
      cardName: row.card_name,
      listId: row.list_id,
      listName: row.list_name,
      boardId: row.board_id,
      boardName: row.board_name,
      workspaceId: row.workspace_id,
      snippet: row.snippet,
      matchSource: row.match_source,
    }));

    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor = hasMore
      ? encodeCursor(
          Number(lastRow.rank),
          lastRow.card_id,
        )
      : null;

    return reply.send({ results: formattedResults, nextCursor });
  });
}
