import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { createBoardSchema, updateBoardSchema } from '@mello/shared';
import { db } from '../db/index.js';
import { boards, boardMembers } from '../db/schema/boards.js';
import { workspaceMembers } from '../db/schema/workspaces.js';
import { labels } from '../db/schema/labels.js';
import { users } from '../db/schema/users.js';
import { requireAuth, requireBoardRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { getNextPosition } from '../utils/position.js';
import { LABEL_COLORS, WS_EVENTS } from '@mello/shared';
import { broadcast } from '../utils/broadcast.js';

export async function boardRoutes(app: FastifyInstance) {
  // Create board
  app.post('/boards', { preHandler: [requireAuth, validateBody(createBoardSchema)] }, async (request, reply) => {
    const body = request.body as {
      workspaceId: string; name: string; description?: string;
      backgroundType?: 'color' | 'image'; backgroundValue?: string;
    };

    // Check workspace membership
    const [wsMember] = await db
      .select()
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, body.workspaceId),
        eq(workspaceMembers.userId, request.userId!),
      ));
    if (!wsMember) throw new ForbiddenError();

    // Get last board position in workspace
    const existingBoards = await db
      .select({ position: boards.position })
      .from(boards)
      .where(eq(boards.workspaceId, body.workspaceId))
      .orderBy(boards.position);

    const position = getNextPosition(existingBoards.at(-1)?.position);

    const [board] = await db.insert(boards).values({
      workspaceId: body.workspaceId,
      name: body.name,
      description: body.description ?? null,
      backgroundType: body.backgroundType ?? 'color',
      backgroundValue: body.backgroundValue ?? '#0079bf',
      position,
    }).returning();

    // Add creator as board admin
    await db.insert(boardMembers).values({
      boardId: board.id,
      userId: request.userId!,
      role: 'admin',
    });

    // Create default labels
    const defaultLabels = LABEL_COLORS.slice(0, 6).map((color, i) => ({
      boardId: board.id,
      color,
      position: (i + 1) * 65536,
    }));
    await db.insert(labels).values(defaultLabels);

    return reply.status(201).send({ board });
  });

  // Get board with lists
  app.get('/boards/:boardId', {
    preHandler: [requireAuth, requireBoardRole('admin', 'normal', 'observer')],
  }, async (request) => {
    const { boardId } = request.params as { boardId: string };

    const [board] = await db.select().from(boards).where(eq(boards.id, boardId));
    if (!board) throw new NotFoundError('Board');

    const boardLabels = await db.select().from(labels).where(eq(labels.boardId, boardId)).orderBy(labels.position);

    return { board, labels: boardLabels };
  });

  // Update board
  app.patch('/boards/:boardId', {
    preHandler: [requireAuth, requireBoardRole('admin'), validateBody(updateBoardSchema)],
  }, async (request) => {
    const { boardId } = request.params as { boardId: string };
    const body = request.body as Record<string, unknown>;

    const [board] = await db
      .update(boards)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(boards.id, boardId))
      .returning();

    return { board };
  });

  // Delete board
  app.delete('/boards/:boardId', {
    preHandler: [requireAuth, requireBoardRole('admin')],
  }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string };
    await db.delete(boards).where(eq(boards.id, boardId));
    return reply.status(204).send();
  });

  // Get board members
  app.get('/boards/:boardId/members', {
    preHandler: [requireAuth, requireBoardRole('admin', 'normal', 'observer')],
  }, async (request) => {
    const { boardId } = request.params as { boardId: string };

    const rows = await db
      .select({
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: boardMembers.role,
        joinedAt: boardMembers.joinedAt,
      })
      .from(boardMembers)
      .innerJoin(users, eq(boardMembers.userId, users.id))
      .where(eq(boardMembers.boardId, boardId));

    return {
      members: rows.map((r) => ({
        user: { id: r.userId, username: r.username, displayName: r.displayName, avatarUrl: r.avatarUrl },
        role: r.role,
        joinedAt: r.joinedAt,
      })),
    };
  });

  // Add board member
  app.post('/boards/:boardId/members', {
    preHandler: [requireAuth, requireBoardRole('admin')],
  }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string };
    const { userId, role } = request.body as { userId: string; role: 'admin' | 'normal' | 'observer' };

    await db.insert(boardMembers).values({ boardId, userId, role }).onConflictDoUpdate({
      target: [boardMembers.boardId, boardMembers.userId],
      set: { role },
    });

    broadcast(app.io, boardId, WS_EVENTS.MEMBER_ADDED, { boardId, userId, role });
    return reply.status(201).send({ ok: true });
  });

  // Remove board member
  app.delete('/boards/:boardId/members/:userId', {
    preHandler: [requireAuth, requireBoardRole('admin')],
  }, async (request, reply) => {
    const { boardId, userId } = request.params as { boardId: string; userId: string };
    await db.delete(boardMembers).where(
      and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)),
    );
    broadcast(app.io, boardId, WS_EVENTS.MEMBER_REMOVED, { boardId, userId });
    return reply.status(204).send();
  });

  // Board labels CRUD
  app.post('/boards/:boardId/labels', {
    preHandler: [requireAuth, requireBoardRole('admin', 'normal')],
  }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string };
    const { name, color } = request.body as { name?: string; color: string };

    const existing = await db.select({ position: labels.position })
      .from(labels)
      .where(eq(labels.boardId, boardId))
      .orderBy(labels.position);

    const position = getNextPosition(existing.at(-1)?.position);

    const [label] = await db.insert(labels).values({
      boardId,
      name: name ?? null,
      color,
      position,
    }).returning();

    broadcast(app.io, boardId, WS_EVENTS.LABEL_CREATED, { label });
    return reply.status(201).send({ label });
  });

  app.patch('/labels/:labelId', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { labelId } = request.params as { labelId: string };
    const body = request.body as { name?: string | null; color?: string };

    const [label] = await db
      .update(labels)
      .set(body)
      .where(eq(labels.id, labelId))
      .returning();

    if (label) {
      broadcast(app.io, label.boardId, WS_EVENTS.LABEL_UPDATED, { label });
    }
    return { label };
  });

  app.delete('/labels/:labelId', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { labelId } = request.params as { labelId: string };
    const [label] = await db.select().from(labels).where(eq(labels.id, labelId));
    await db.delete(labels).where(eq(labels.id, labelId));
    if (label) {
      broadcast(app.io, label.boardId, WS_EVENTS.LABEL_DELETED, { labelId });
    }
    return reply.status(204).send();
  });
}
