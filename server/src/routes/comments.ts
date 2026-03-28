import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { createCommentSchema, updateCommentSchema } from '@mello/shared';
import { db } from '../db/index.js';
import { comments } from '../db/schema/comments.js';
import { users } from '../db/schema/users.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

export async function commentRoutes(app: FastifyInstance) {
  // List comments for a card
  app.get('/cards/:cardId/comments', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { cardId } = request.params as { cardId: string };

    const rows = await db
      .select({
        id: comments.id,
        cardId: comments.cardId,
        body: comments.body,
        editedAt: comments.editedAt,
        createdAt: comments.createdAt,
        user: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.cardId, cardId))
      .orderBy(desc(comments.createdAt));

    return { comments: rows };
  });

  // Create comment
  app.post('/cards/:cardId/comments', {
    preHandler: [requireAuth, validateBody(createCommentSchema)],
  }, async (request, reply) => {
    const { cardId } = request.params as { cardId: string };
    const { body } = request.body as { body: string };

    const [comment] = await db.insert(comments).values({
      cardId,
      userId: request.userId!,
      body,
    }).returning();

    // Return with user info
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, request.userId!));

    return reply.status(201).send({
      comment: {
        ...comment,
        user,
      },
    });
  });

  // Update comment
  app.patch('/comments/:commentId', {
    preHandler: [requireAuth, validateBody(updateCommentSchema)],
  }, async (request) => {
    const { commentId } = request.params as { commentId: string };
    const { body } = request.body as { body: string };

    // Check ownership
    const [existing] = await db.select().from(comments).where(eq(comments.id, commentId));
    if (!existing) throw new NotFoundError('Comment');
    if (existing.userId !== request.userId) throw new ForbiddenError('You can only edit your own comments');

    const [comment] = await db
      .update(comments)
      .set({ body, editedAt: new Date() })
      .where(eq(comments.id, commentId))
      .returning();

    return { comment };
  });

  // Delete comment
  app.delete('/comments/:commentId', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { commentId } = request.params as { commentId: string };

    // Check ownership
    const [existing] = await db.select().from(comments).where(eq(comments.id, commentId));
    if (!existing) throw new NotFoundError('Comment');
    if (existing.userId !== request.userId) throw new ForbiddenError('You can only delete your own comments');

    await db.delete(comments).where(eq(comments.id, commentId));
    return reply.status(204).send();
  });
}
