import type { FastifyInstance } from 'fastify';
import { eq, and, asc } from 'drizzle-orm';
import { createBoardSchema, updateBoardSchema, createFromTemplateSchema } from '@mello/shared';
import { db } from '../db/index.js';
import { boards, boardMembers } from '../db/schema/boards.js';
import { workspaceMembers } from '../db/schema/workspaces.js';
import { labels } from '../db/schema/labels.js';
import { lists } from '../db/schema/lists.js';
import { cards } from '../db/schema/cards.js';
import { users } from '../db/schema/users.js';
import { requireAuth, requireBoardRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { getNextPosition } from '../utils/position.js';
import { LABEL_COLORS, WS_EVENTS } from '@mello/shared';
import { broadcast } from '../utils/broadcast.js';
import { createNotification } from '../utils/notifications.js';
import { config } from '../config.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

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

  // Create board from template — MUST be registered BEFORE /boards/:boardId
  app.post('/boards/from-template/:templateId', {
    preHandler: [requireAuth, validateBody(createFromTemplateSchema)],
  }, async (request, reply) => {
    const { templateId } = request.params as { templateId: string };
    const body = request.body as { workspaceId: string; name: string };

    // Find the template board
    const [templateBoard] = await db.select().from(boards).where(eq(boards.id, templateId));
    if (!templateBoard || !templateBoard.isTemplate) {
      throw new NotFoundError('Template');
    }

    // Check workspace membership
    const [wsMember] = await db
      .select()
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, body.workspaceId),
        eq(workspaceMembers.userId, request.userId!),
      ));
    if (!wsMember) throw new ForbiddenError();

    // Get position for new board
    const existingBoards = await db
      .select({ position: boards.position })
      .from(boards)
      .where(eq(boards.workspaceId, body.workspaceId))
      .orderBy(boards.position);

    const position = getNextPosition(existingBoards.at(-1)?.position);

    // Create new board copying background settings from template
    const [newBoard] = await db.insert(boards).values({
      workspaceId: body.workspaceId,
      name: body.name,
      description: templateBoard.description,
      backgroundType: templateBoard.backgroundType,
      backgroundValue: templateBoard.backgroundValue,
      isTemplate: false,
      position,
    }).returning();

    // Add creator as board admin
    await db.insert(boardMembers).values({
      boardId: newBoard.id,
      userId: request.userId!,
      role: 'admin',
    });

    // Copy lists from template (without cards)
    const templateLists = await db.select().from(lists)
      .where(eq(lists.boardId, templateId))
      .orderBy(asc(lists.position));

    for (const tList of templateLists) {
      await db.insert(lists).values({
        boardId: newBoard.id,
        name: tList.name,
        position: tList.position,
      });
    }

    // Copy labels from template
    const templateLabels = await db.select().from(labels)
      .where(eq(labels.boardId, templateId))
      .orderBy(labels.position);

    for (const tLabel of templateLabels) {
      await db.insert(labels).values({
        boardId: newBoard.id,
        name: tLabel.name,
        color: tLabel.color,
        position: tLabel.position,
      });
    }

    return reply.status(201).send({ board: newBoard });
  });

  // Get board with lists, cards, labels
  app.get('/boards/:boardId', {
    preHandler: [requireAuth, requireBoardRole('admin', 'normal', 'observer')],
  }, async (request) => {
    const { boardId } = request.params as { boardId: string };

    const [board] = await db.select().from(boards).where(eq(boards.id, boardId));
    if (!board) throw new NotFoundError('Board');

    const boardLabels = await db.select().from(labels).where(eq(labels.boardId, boardId)).orderBy(labels.position);

    const boardLists = await db.select().from(lists).where(eq(lists.boardId, boardId)).orderBy(asc(lists.position));

    const boardCards = await db.select().from(cards).where(eq(cards.boardId, boardId)).orderBy(asc(cards.position));

    // Fetch board members
    const memberRows = await db
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

    const members = memberRows.map((r) => ({
      user: { id: r.userId, username: r.username, displayName: r.displayName, avatarUrl: r.avatarUrl },
      role: r.role,
      joinedAt: r.joinedAt,
    }));

    return { board, labels: boardLabels, lists: boardLists, cards: boardCards, members };
  });

  // Update board
  app.patch('/boards/:boardId', {
    preHandler: [requireAuth, requireBoardRole('admin'), validateBody(updateBoardSchema)],
  }, async (request) => {
    const { boardId } = request.params as { boardId: string };
    const body = request.body as {
      name?: string;
      description?: string | null;
      backgroundType?: 'color' | 'image';
      backgroundValue?: string;
      isTemplate?: boolean;
      position?: number;
    };

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.backgroundType !== undefined) updateData.backgroundType = body.backgroundType;
    if (body.backgroundValue !== undefined) updateData.backgroundValue = body.backgroundValue;
    if (body.isTemplate !== undefined) updateData.isTemplate = body.isTemplate;
    if (body.position !== undefined) updateData.position = body.position;

    const [board] = await db
      .update(boards)
      .set(updateData)
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
    const body = request.body as { userId: string; role?: 'admin' | 'normal' | 'observer' };
    const role = body.role ?? 'normal';

    await db.insert(boardMembers).values({ boardId, userId: body.userId, role }).onConflictDoUpdate({
      target: [boardMembers.boardId, boardMembers.userId],
      set: { role },
    });

    // Create notification if adding someone else
    if (body.userId !== request.userId!) {
      const [board] = await db.select().from(boards).where(eq(boards.id, boardId));
      const [actor] = await db.select().from(users).where(eq(users.id, request.userId!));
      if (board && actor) {
        await createNotification(body.userId, 'board_added', {
          boardId: board.id,
          boardName: board.name,
          actorId: actor.id,
          actorDisplayName: actor.displayName,
        });
      }
    }

    broadcast(app.io, boardId, WS_EVENTS.MEMBER_ADDED, { boardId, userId: body.userId, role });
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

  // Upload board background image
  app.post('/boards/:boardId/background', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string };

    const [board] = await db.select().from(boards).where(eq(boards.id, boardId));
    if (!board) throw new NotFoundError('Board');

    // Check board membership - must be admin
    const [member] = await db.select().from(boardMembers).where(
      and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, request.userId!)),
    );
    if (!member || member.role !== 'admin') throw new ForbiddenError();

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: { code: 'NO_FILE', message: 'No file uploaded' } });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      return reply.status(400).send({ error: { code: 'INVALID_TYPE', message: 'Only image files are allowed' } });
    }

    const sanitized = file.filename.replace(/[\\/]/g, '').replace(/\s+/g, '_');
    const dir = path.join(config.STORAGE_PATH, 'backgrounds');
    await fs.mkdir(dir, { recursive: true });

    // Remove old background files for this board
    try {
      const existingFiles = await fs.readdir(dir);
      for (const f of existingFiles) {
        if (f.startsWith(`${boardId}-`)) {
          await fs.unlink(path.join(dir, f)).catch(() => {});
        }
      }
    } catch {
      // Directory may not exist yet
    }

    const storageName = `${boardId}-${sanitized}`;
    const storagePath = path.join(dir, storageName);

    const buffer = await file.toBuffer();
    await fs.writeFile(storagePath, buffer);

    // Store the mime type alongside for serving
    await fs.writeFile(storagePath + '.meta', file.mimetype);

    const backgroundValue = `/api/v1/boards/${boardId}/background/image`;

    const [updatedBoard] = await db
      .update(boards)
      .set({ backgroundType: 'image' as const, backgroundValue, updatedAt: new Date() })
      .where(eq(boards.id, boardId))
      .returning();

    return reply.status(200).send({ board: updatedBoard });
  });

  // Serve board background image
  app.get('/boards/:boardId/background/image', {
    preHandler: [requireAuth, requireBoardRole('admin', 'normal', 'observer')],
  }, async (request, reply) => {
    const { boardId } = request.params as { boardId: string };

    const dir = path.join(config.STORAGE_PATH, 'backgrounds');

    // Find the background file for this board
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      throw new NotFoundError('Background image');
    }

    const bgFile = files.find((f) => f.startsWith(`${boardId}-`) && !f.endsWith('.meta'));
    if (!bgFile) {
      throw new NotFoundError('Background image');
    }

    const filePath = path.join(dir, bgFile);
    const fileBuffer = await fs.readFile(filePath);

    // Read mime type from meta file
    let mimeType = 'image/png';
    try {
      mimeType = (await fs.readFile(filePath + '.meta', 'utf-8')).trim();
    } catch {
      // default
    }

    return reply.type(mimeType).send(fileBuffer);
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
