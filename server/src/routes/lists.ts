import type { FastifyInstance } from 'fastify';
import { eq, and, asc, inArray, sql } from 'drizzle-orm';
import { createListSchema, updateListSchema, moveAllCardsSchema } from '@mello/shared';
import { db } from '../db/index.js';
import { lists } from '../db/schema/lists.js';
import { cards } from '../db/schema/cards.js';
import { labels, cardLabels } from '../db/schema/labels.js';
import { cardAssignments } from '../db/schema/card-assignments.js';
import { boards, boardMembers } from '../db/schema/boards.js';
import { checklists, checklistItems } from '../db/schema/checklists.js';
import { attachments } from '../db/schema/attachments.js';
import { comments } from '../db/schema/comments.js';
import { requireAuth, requireBoardRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { getNextPosition } from '../utils/position.js';
import { broadcast } from '../utils/broadcast.js';
import { WS_EVENTS } from '@mello/shared';

export async function listRoutes(app: FastifyInstance) {
  // Get lists with cards for a board
  app.get('/boards/:boardId/lists', {
    preHandler: [requireAuth, requireBoardRole('admin', 'normal', 'observer')],
  }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string };
    const query = request.query as { labels?: string; members?: string };

    // UUID validation regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Parse and validate label filter
    let labelFilter: string[] | null = null;
    if (query.labels !== undefined && query.labels !== '') {
      const raw = query.labels.split(',');
      for (const id of raw) {
        if (!uuidRegex.test(id)) {
          return reply.status(400).send({ error: 'Invalid UUID in labels parameter' });
        }
      }
      labelFilter = [...new Set(raw)];
    }

    // Parse and validate member filter
    let memberFilter: string[] | null = null;
    if (query.members !== undefined && query.members !== '') {
      const raw = query.members.split(',');
      for (const id of raw) {
        if (!uuidRegex.test(id)) {
          return reply.status(400).send({ error: 'Invalid UUID in members parameter' });
        }
      }
      memberFilter = [...new Set(raw)];
    }

    const boardLists = await db
      .select()
      .from(lists)
      .where(eq(lists.boardId, boardId))
      .orderBy(asc(lists.position));

    let boardCards = await db
      .select()
      .from(cards)
      .where(eq(cards.boardId, boardId))
      .orderBy(asc(cards.position));

    // Apply label filter: only cards that have ALL specified labels
    if (labelFilter !== null && labelFilter.length > 0) {
      const cardIds = boardCards.map((c) => c.id);
      if (cardIds.length > 0) {
        const matchingRows = await db
          .select({ cardId: cardLabels.cardId })
          .from(cardLabels)
          .where(and(
            inArray(cardLabels.cardId, cardIds),
            inArray(cardLabels.labelId, labelFilter),
          ))
          .groupBy(cardLabels.cardId)
          .having(sql`count(distinct ${cardLabels.labelId}) = ${labelFilter.length}`);

        const matchingCardIds = new Set(matchingRows.map((r) => r.cardId));
        boardCards = boardCards.filter((c) => matchingCardIds.has(c.id));
      }
    }

    // Apply member filter: cards assigned to at least ONE specified member
    if (memberFilter !== null && memberFilter.length > 0) {
      const cardIds = boardCards.map((c) => c.id);
      if (cardIds.length > 0) {
        const matchingRows = await db
          .select({ cardId: cardAssignments.cardId })
          .from(cardAssignments)
          .where(and(
            inArray(cardAssignments.cardId, cardIds),
            inArray(cardAssignments.userId, memberFilter),
          ))
          .groupBy(cardAssignments.cardId);

        const matchingCardIds = new Set(matchingRows.map((r) => r.cardId));
        boardCards = boardCards.filter((c) => matchingCardIds.has(c.id));
      }
    }

    // Fetch card-label associations for remaining cards
    const cardIds = boardCards.map((c) => c.id);
    let cardLabelRows: { cardId: string; labelId: string }[] = [];
    if (cardIds.length > 0) {
      cardLabelRows = await db
        .select({ cardId: cardLabels.cardId, labelId: cardLabels.labelId })
        .from(cardLabels)
        .where(inArray(cardLabels.cardId, cardIds));
    }

    // Build a map of cardId -> labelId[]
    const labelsByCard = new Map<string, string[]>();
    for (const row of cardLabelRows) {
      const arr = labelsByCard.get(row.cardId) ?? [];
      arr.push(row.labelId);
      labelsByCard.set(row.cardId, arr);
    }

    // Fetch card-member associations for remaining cards
    let cardAssignmentRows: { cardId: string; userId: string }[] = [];
    if (cardIds.length > 0) {
      cardAssignmentRows = await db
        .select({ cardId: cardAssignments.cardId, userId: cardAssignments.userId })
        .from(cardAssignments)
        .where(inArray(cardAssignments.cardId, cardIds));
    }

    // Build a map of cardId -> memberIds[]
    const membersByCard = new Map<string, string[]>();
    for (const row of cardAssignmentRows) {
      const arr = membersByCard.get(row.cardId) ?? [];
      arr.push(row.userId);
      membersByCard.set(row.cardId, arr);
    }

    // Fetch checklist item counts per card
    let checklistCounts: { cardId: string; total: number; checked: number }[] = [];
    if (cardIds.length > 0) {
      const rows = await db
        .select({
          cardId: checklists.cardId,
          total: sql<number>`count(${checklistItems.id})::int`,
          checked: sql<number>`count(case when ${checklistItems.checked} = true then 1 end)::int`,
        })
        .from(checklists)
        .innerJoin(checklistItems, eq(checklistItems.checklistId, checklists.id))
        .where(inArray(checklists.cardId, cardIds))
        .groupBy(checklists.cardId);
      checklistCounts = rows;
    }
    const checklistByCard = new Map<string, { total: number; checked: number }>();
    for (const row of checklistCounts) {
      checklistByCard.set(row.cardId, { total: row.total, checked: row.checked });
    }

    // Fetch attachment counts per card
    let attachmentCounts: { cardId: string; count: number }[] = [];
    if (cardIds.length > 0) {
      attachmentCounts = await db
        .select({
          cardId: attachments.cardId,
          count: sql<number>`count(*)::int`,
        })
        .from(attachments)
        .where(inArray(attachments.cardId, cardIds))
        .groupBy(attachments.cardId);
    }
    const attachmentsByCard = new Map<string, number>();
    for (const row of attachmentCounts) {
      attachmentsByCard.set(row.cardId, row.count);
    }

    // Fetch comment counts per card
    let commentCounts: { cardId: string; count: number }[] = [];
    if (cardIds.length > 0) {
      commentCounts = await db
        .select({
          cardId: comments.cardId,
          count: sql<number>`count(*)::int`,
        })
        .from(comments)
        .where(inArray(comments.cardId, cardIds))
        .groupBy(comments.cardId);
    }
    const commentsByCard = new Map<string, number>();
    for (const row of commentCounts) {
      commentsByCard.set(row.cardId, row.count);
    }

    // Group cards by list
    const cardsByList = new Map<string, (typeof boardCards[number] & { labelIds: string[]; memberIds: string[]; checklistItems: { total: number; checked: number } | null; attachmentCount: number; commentCount: number })[]>();
    for (const card of boardCards) {
      const listCards = cardsByList.get(card.listId) ?? [];
      listCards.push({
        ...card,
        labelIds: labelsByCard.get(card.id) ?? [],
        memberIds: membersByCard.get(card.id) ?? [],
        checklistItems: checklistByCard.get(card.id) ?? null,
        attachmentCount: attachmentsByCard.get(card.id) ?? 0,
        commentCount: commentsByCard.get(card.id) ?? 0,
      });
      cardsByList.set(card.listId, listCards);
    }

    return {
      lists: boardLists.map((list) => ({
        ...list,
        cards: cardsByList.get(list.id) ?? [],
      })),
    };
  });

  // Create list
  app.post('/boards/:boardId/lists', {
    preHandler: [requireAuth, requireBoardRole('admin', 'normal'), validateBody(createListSchema)],
  }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string };
    const { name, position } = request.body as { name: string; position?: number };

    let pos = position;
    if (pos === undefined) {
      const existing = await db.select({ position: lists.position })
        .from(lists)
        .where(eq(lists.boardId, boardId))
        .orderBy(asc(lists.position));
      pos = getNextPosition(existing.at(-1)?.position);
    }

    const [list] = await db.insert(lists).values({
      boardId,
      name,
      position: pos,
    }).returning();

    broadcast(app.io, boardId, WS_EVENTS.LIST_CREATED, { list: { ...list, cards: [] } });
    return reply.status(201).send({ list });
  });

  // Update list
  app.patch('/lists/:listId', {
    preHandler: [requireAuth, validateBody(updateListSchema)],
  }, async (request) => {
    const { listId } = request.params as { listId: string };
    const body = request.body as { name?: string; position?: number };

    const [list] = await db
      .update(lists)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(lists.id, listId))
      .returning();

    if (!list) throw new NotFoundError('List');
    broadcast(app.io, list.boardId, WS_EVENTS.LIST_UPDATED, { list });
    return { list };
  });

  // Delete list
  app.delete('/lists/:listId', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { listId } = request.params as { listId: string };
    const [list] = await db.select().from(lists).where(eq(lists.id, listId));
    await db.delete(lists).where(eq(lists.id, listId));
    if (list) {
      broadcast(app.io, list.boardId, WS_EVENTS.LIST_DELETED, { listId });
    }
    return reply.status(204).send();
  });

  // Move list to another board
  app.post('/lists/:listId/move', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { listId } = request.params as { listId: string };
    const { targetBoardId, position } = request.body as { targetBoardId: string; position?: number };

    const [list] = await db.select().from(lists).where(eq(lists.id, listId));
    if (!list) throw new NotFoundError('List');

    const oldBoardId = list.boardId;

    // Verify target board exists
    const [targetBoard] = await db.select().from(boards).where(eq(boards.id, targetBoardId));
    if (!targetBoard) throw new NotFoundError('Target board');

    // Calculate position in target board
    const targetLists = await db.select({ position: lists.position })
      .from(lists)
      .where(eq(lists.boardId, targetBoardId))
      .orderBy(asc(lists.position));

    let newPosition: number;
    if (position !== undefined && position > 0 && position <= targetLists.length) {
      const idx = position - 1;
      if (idx === 0) {
        newPosition = targetLists.length > 0 ? targetLists[0].position / 2 : 65536;
      } else {
        newPosition = (targetLists[idx - 1].position + targetLists[idx].position) / 2;
      }
    } else {
      newPosition = getNextPosition(targetLists.at(-1)?.position);
    }

    // Move the list and all its cards to the target board
    await db.update(lists).set({
      boardId: targetBoardId,
      position: newPosition,
      updatedAt: new Date(),
    }).where(eq(lists.id, listId));

    // Update all cards in this list to point to the new board
    await db.update(cards).set({
      boardId: targetBoardId,
      updatedAt: new Date(),
    }).where(eq(cards.listId, listId));

    // Broadcast events
    broadcast(app.io, oldBoardId, WS_EVENTS.LIST_DELETED, { listId });

    return { moved: true };
  });

  // Move all cards in a list to another list
  app.post('/lists/:listId/move-all-cards', {
    preHandler: [requireAuth, validateBody(moveAllCardsSchema)],
  }, async (request) => {
    const { listId } = request.params as { listId: string };
    const { targetListId } = request.body as { targetListId: string };

    const [targetList] = await db.select().from(lists).where(eq(lists.id, targetListId));
    if (!targetList) throw new NotFoundError('Target list');

    // Get the highest position in target list
    const targetCards = await db
      .select({ position: cards.position })
      .from(cards)
      .where(eq(cards.listId, targetListId))
      .orderBy(asc(cards.position));

    let nextPos = getNextPosition(targetCards.at(-1)?.position);

    // Get cards to move
    const cardsToMove = await db
      .select()
      .from(cards)
      .where(eq(cards.listId, listId))
      .orderBy(asc(cards.position));

    for (const card of cardsToMove) {
      await db.update(cards).set({
        listId: targetListId,
        boardId: targetList.boardId,
        position: nextPos,
        updatedAt: new Date(),
      }).where(eq(cards.id, card.id));
      nextPos += 65536;
    }

    return { moved: cardsToMove.length };
  });

  // Copy list to another board
  app.post('/lists/:listId/copy', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { listId } = request.params as { listId: string };
    const { targetBoardId } = request.body as { targetBoardId: string };

    // Find source list
    const [sourceList] = await db.select().from(lists).where(eq(lists.id, listId));
    if (!sourceList) throw new NotFoundError('List');

    const sourceBoardId = sourceList.boardId;

    // Cannot copy to same board
    if (sourceBoardId === targetBoardId) {
      throw new ValidationError('Cannot copy list to the same board');
    }

    // Check user membership on source board (admin or normal)
    const [sourceMember] = await db.select().from(boardMembers).where(
      and(eq(boardMembers.boardId, sourceBoardId), eq(boardMembers.userId, request.userId!)),
    );
    if (!sourceMember || !['admin', 'normal'].includes(sourceMember.role)) {
      throw new ForbiddenError();
    }

    // Verify target board exists
    const [targetBoardRow] = await db.select().from(boards).where(eq(boards.id, targetBoardId));
    if (!targetBoardRow) throw new NotFoundError('Target board');

    // Check user membership on target board (admin or normal)
    const [targetMember] = await db.select().from(boardMembers).where(
      and(eq(boardMembers.boardId, targetBoardId), eq(boardMembers.userId, request.userId!)),
    );
    if (!targetMember || !['admin', 'normal'].includes(targetMember.role)) {
      throw new ForbiddenError();
    }

    // Get next position for the new list on target board
    const existingLists = await db.select({ position: lists.position })
      .from(lists)
      .where(eq(lists.boardId, targetBoardId))
      .orderBy(asc(lists.position));
    const listPosition = getNextPosition(existingLists.at(-1)?.position);

    // Create the new list
    const [newList] = await db.insert(lists).values({
      boardId: targetBoardId,
      name: sourceList.name,
      position: listPosition,
    }).returning();

    // Copy cards
    const sourceCards = await db.select().from(cards)
      .where(eq(cards.listId, listId))
      .orderBy(asc(cards.position));

    // Get labels on source and target boards for matching
    const sourceLabels = await db.select().from(labels).where(eq(labels.boardId, sourceBoardId));
    const targetLabels = await db.select().from(labels).where(eq(labels.boardId, targetBoardId));

    // Build a map: sourceLabel key (color+name) -> targetLabel id
    const labelMap = new Map<string, string>();
    for (const tl of targetLabels) {
      const key = `${tl.color}:${tl.name ?? ''}`;
      labelMap.set(key, tl.id);
    }

    for (const sourceCard of sourceCards) {
      const [newCard] = await db.insert(cards).values({
        listId: newList.id,
        boardId: targetBoardId,
        name: sourceCard.name,
        description: sourceCard.description,
        position: sourceCard.position,
      }).returning();

      // Get card's labels from source
      const cardLabelRows = await db.select().from(cardLabels)
        .where(eq(cardLabels.cardId, sourceCard.id));

      for (const cl of cardLabelRows) {
        // Find the source label to get color+name
        const srcLabel = sourceLabels.find((l) => l.id === cl.labelId);
        if (!srcLabel) continue;

        const key = `${srcLabel.color}:${srcLabel.name ?? ''}`;
        const targetLabelId = labelMap.get(key);
        if (targetLabelId) {
          await db.insert(cardLabels).values({
            cardId: newCard.id,
            labelId: targetLabelId,
          }).onConflictDoNothing();
        }
      }
    }

    return reply.status(201).send({
      list: newList,
      cardsCopied: sourceCards.length,
    });
  });
}
