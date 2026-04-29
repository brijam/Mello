import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import * as argon2 from 'argon2';
import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  adminResetPasswordSchema,
  adminSetBoardRoleSchema,
  adminSetWorkspaceRoleSchema,
  adminSetDefaultWorkspaceSchema,
} from '@mello/shared';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { boards, boardMembers } from '../db/schema/boards.js';
import { workspaces, workspaceMembers } from '../db/schema/workspaces.js';
import { and } from 'drizzle-orm';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { ConflictError, NotFoundError, ForbiddenError } from '../utils/errors.js';

const userColumns = {
  id: users.id,
  email: users.email,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
  isAdmin: users.isAdmin,
  defaultWorkspaceId: users.defaultWorkspaceId,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireAdmin);

  app.get('/users', async () => {
    const list = await db.select(userColumns).from(users).orderBy(desc(users.createdAt));
    return { users: list };
  });

  app.post('/users', { preHandler: [validateBody(adminCreateUserSchema)] }, async (request, reply) => {
    const { email, username, password, displayName, isAdmin } = request.body as {
      email: string; username: string; password: string; displayName: string; isAdmin?: boolean;
    };

    const [existingEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existingEmail) throw new ConflictError('Email already in use');
    const [existingUsername] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (existingUsername) throw new ConflictError('Username already taken');

    const passwordHash = await argon2.hash(password);

    const [user] = await db.insert(users).values({
      email,
      username,
      displayName,
      passwordHash,
      isAdmin: isAdmin ?? false,
    }).returning(userColumns);

    return reply.status(201).send({ user });
  });

  app.patch('/users/:id', { preHandler: [validateBody(adminUpdateUserSchema)] }, async (request) => {
    const { id } = request.params as { id: string };
    const updates = request.body as {
      email?: string; username?: string; displayName?: string; isAdmin?: boolean;
    };

    const [target] = await db.select().from(users).where(eq(users.id, id));
    if (!target) throw new NotFoundError('User');

    if (updates.email && updates.email !== target.email) {
      const [conflict] = await db.select({ id: users.id }).from(users).where(eq(users.email, updates.email));
      if (conflict) throw new ConflictError('Email already in use');
    }
    if (updates.username && updates.username !== target.username) {
      const [conflict] = await db.select({ id: users.id }).from(users).where(eq(users.username, updates.username));
      if (conflict) throw new ConflictError('Username already taken');
    }

    // Prevent removing admin from yourself
    if (updates.isAdmin === false && target.id === request.userId) {
      throw new ForbiddenError('Cannot remove admin from your own account');
    }

    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning(userColumns);

    return { user };
  });

  app.post('/users/:id/reset-password', { preHandler: [validateBody(adminResetPasswordSchema)] }, async (request) => {
    const { id } = request.params as { id: string };
    const { password } = request.body as { password: string };

    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
    if (!target) throw new NotFoundError('User');

    const passwordHash = await argon2.hash(password);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));

    return { ok: true };
  });

  app.get('/users/:id/boards', async (request) => {
    const { id } = request.params as { id: string };
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
    if (!target) throw new NotFoundError('User');

    const rows = await db
      .select({
        boardId: boards.id,
        boardName: boards.name,
        workspaceId: workspaces.id,
        workspaceName: workspaces.name,
        role: boardMembers.role,
      })
      .from(boards)
      .innerJoin(workspaces, eq(workspaces.id, boards.workspaceId))
      .leftJoin(
        boardMembers,
        and(eq(boardMembers.boardId, boards.id), eq(boardMembers.userId, id)),
      )
      .orderBy(workspaces.name, boards.name);

    return { boards: rows };
  });

  app.put(
    '/users/:id/boards/:boardId',
    { preHandler: [validateBody(adminSetBoardRoleSchema)] },
    async (request) => {
      const { id, boardId } = request.params as { id: string; boardId: string };
      const { role } = request.body as { role: 'admin' | 'normal' | 'observer' };

      const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
      if (!target) throw new NotFoundError('User');
      const [board] = await db.select({ id: boards.id }).from(boards).where(eq(boards.id, boardId));
      if (!board) throw new NotFoundError('Board');

      await db
        .insert(boardMembers)
        .values({ boardId, userId: id, role })
        .onConflictDoUpdate({
          target: [boardMembers.boardId, boardMembers.userId],
          set: { role },
        });

      return { ok: true };
    },
  );

  app.delete('/users/:id/boards/:boardId', async (request, reply) => {
    const { id, boardId } = request.params as { id: string; boardId: string };
    await db
      .delete(boardMembers)
      .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, id)));
    return reply.status(204).send();
  });

  app.get('/users/:id/workspaces', async (request) => {
    const { id } = request.params as { id: string };
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
    if (!target) throw new NotFoundError('User');

    const rows = await db
      .select({
        workspaceId: workspaces.id,
        workspaceName: workspaces.name,
        role: workspaceMembers.role,
      })
      .from(workspaces)
      .leftJoin(
        workspaceMembers,
        and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, id)),
      )
      .orderBy(workspaces.name);

    return { workspaces: rows };
  });

  app.put(
    '/users/:id/workspaces/:workspaceId',
    { preHandler: [validateBody(adminSetWorkspaceRoleSchema)] },
    async (request) => {
      const { id, workspaceId } = request.params as { id: string; workspaceId: string };
      const { role } = request.body as { role: 'owner' | 'admin' | 'member' };

      const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
      if (!target) throw new NotFoundError('User');
      const [ws] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId));
      if (!ws) throw new NotFoundError('Workspace');

      await db
        .insert(workspaceMembers)
        .values({ workspaceId, userId: id, role })
        .onConflictDoUpdate({
          target: [workspaceMembers.workspaceId, workspaceMembers.userId],
          set: { role },
        });

      return { ok: true };
    },
  );

  app.put(
    '/users/:id/default-workspace',
    { preHandler: [validateBody(adminSetDefaultWorkspaceSchema)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const { workspaceId } = request.body as { workspaceId: string | null };

      const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
      if (!target) throw new NotFoundError('User');

      if (workspaceId) {
        const [ws] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId));
        if (!ws) throw new NotFoundError('Workspace');
      }

      await db.update(users).set({ defaultWorkspaceId: workspaceId, updatedAt: new Date() }).where(eq(users.id, id));
      return { ok: true };
    },
  );

  app.delete('/users/:id/workspaces/:workspaceId', async (request, reply) => {
    const { id, workspaceId } = request.params as { id: string; workspaceId: string };
    await db
      .delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, id)));
    return reply.status(204).send();
  });

  app.delete('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === request.userId) {
      throw new ForbiddenError('Cannot delete your own account');
    }
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id));
    if (!target) throw new NotFoundError('User');

    try {
      await db.delete(users).where(eq(users.id, id));
    } catch (err: any) {
      if (err?.code === '23503') {
        throw new ConflictError('Cannot delete user with existing comments, attachments, or activity. Reassign or remove them first.');
      }
      throw err;
    }
    return reply.status(204).send();
  });
}
