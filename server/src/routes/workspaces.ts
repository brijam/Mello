import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { createWorkspaceSchema, updateWorkspaceSchema } from '@mello/shared';
import { db } from '../db/index.js';
import { workspaces, workspaceMembers } from '../db/schema/workspaces.js';
import { boards } from '../db/schema/boards.js';
import { users } from '../db/schema/users.js';
import { requireAuth, requireWorkspaceRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { NotFoundError } from '../utils/errors.js';

export async function workspaceRoutes(app: FastifyInstance) {
  // List workspaces for current user
  app.get('/', { preHandler: [requireAuth] }, async (request) => {
    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        description: workspaces.description,
        role: workspaceMembers.role,
        createdAt: workspaces.createdAt,
        updatedAt: workspaces.updatedAt,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, request.userId!));

    return { workspaces: rows };
  });

  // Create workspace
  app.post('/', { preHandler: [requireAuth, validateBody(createWorkspaceSchema)] }, async (request, reply) => {
    const { name, description } = request.body as { name: string; description?: string };
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const [workspace] = await db.insert(workspaces).values({
      name,
      slug: `${slug}-${Date.now()}`,
      description: description ?? null,
    }).returning();

    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: request.userId!,
      role: 'owner',
    });

    return reply.status(201).send({ workspace });
  });

  // Get workspace
  app.get('/:workspaceId', {
    preHandler: [requireAuth, requireWorkspaceRole('owner', 'admin', 'member')],
  }, async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!workspace) throw new NotFoundError('Workspace');
    return { workspace };
  });

  // Update workspace
  app.patch('/:workspaceId', {
    preHandler: [requireAuth, requireWorkspaceRole('owner', 'admin'), validateBody(updateWorkspaceSchema)],
  }, async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const body = request.body as { name?: string; description?: string | null };

    const [workspace] = await db
      .update(workspaces)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    return { workspace };
  });

  // Delete workspace
  app.delete('/:workspaceId', {
    preHandler: [requireAuth, requireWorkspaceRole('owner')],
  }, async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    return reply.status(204).send();
  });

  // List workspace members
  app.get('/:workspaceId/members', {
    preHandler: [requireAuth, requireWorkspaceRole('owner', 'admin', 'member')],
  }, async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };

    const rows = await db
      .select({
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, workspaceId));

    return {
      members: rows.map((r) => ({
        user: { id: r.userId, username: r.username, displayName: r.displayName, avatarUrl: r.avatarUrl },
        role: r.role,
        joinedAt: r.joinedAt,
      })),
    };
  });

  // List boards in workspace
  app.get('/:workspaceId/boards', {
    preHandler: [requireAuth, requireWorkspaceRole('owner', 'admin', 'member')],
  }, async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };

    const rows = await db
      .select()
      .from(boards)
      .where(eq(boards.workspaceId, workspaceId))
      .orderBy(boards.position);

    return { boards: rows };
  });
}
