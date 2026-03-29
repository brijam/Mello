import type { FastifyInstance } from 'fastify';
import { eq, desc, and } from 'drizzle-orm';
import { createCommentSchema, updateCommentSchema } from '@mello/shared';
import { db } from '../db/index.js';
import { comments } from '../db/schema/comments.js';
import { cards } from '../db/schema/cards.js';
import { boards, boardMembers } from '../db/schema/boards.js';
import { users } from '../db/schema/users.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { createNotification, parseMentions } from '../utils/notifications.js';
import { logActivity } from '../utils/activity.js';

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

    try {
      const [cardForActivity] = await db.select().from(cards).where(eq(cards.id, cardId));
      if (cardForActivity) {
        await logActivity({
          cardId,
          boardId: cardForActivity.boardId,
          userId: request.userId!,
          type: 'comment_added',
          data: { commentBody: body.substring(0, 100) },
        });
      }
    } catch { /* fire-and-forget */ }

    // Process @mentions for notifications
    const mentionedUsernames = parseMentions(body);
    if (mentionedUsernames.length > 0) {
      // Look up the card to get board info
      const [card] = await db.select().from(cards).where(eq(cards.id, cardId));
      if (card) {
        const [board] = await db.select().from(boards).where(eq(boards.id, card.boardId));
        for (const username of mentionedUsernames) {
          // Look up the mentioned user
          const [mentionedUser] = await db.select().from(users).where(eq(users.username, username));
          if (!mentionedUser) continue;
          // Verify they're on the board
          const [membership] = await db.select().from(boardMembers).where(
            and(
              eq(boardMembers.boardId, card.boardId),
              eq(boardMembers.userId, mentionedUser.id),
            ),
          );
          if (!membership) continue;
          // Create notification
          await createNotification(mentionedUser.id, 'mention', {
            cardId: card.id,
            cardName: card.name,
            boardId: card.boardId,
            boardName: board?.name,
            actorId: request.userId!,
            actorDisplayName: user?.displayName,
            commentId: comment.id,
            commentSnippet: body.slice(0, 100),
          });
        }
      }
    }

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
