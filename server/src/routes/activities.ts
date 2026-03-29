import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { activities } from '../db/schema/activities.js';
import { users } from '../db/schema/users.js';
import { requireAuth } from '../middleware/auth.js';

export async function activityRoutes(app: FastifyInstance) {
  // List activities for a card
  app.get('/cards/:cardId/activities', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { cardId } = request.params as { cardId: string };
    const { limit = '50', offset = '0' } = request.query as { limit?: string; offset?: string };

    const rows = await db
      .select({
        id: activities.id,
        cardId: activities.cardId,
        boardId: activities.boardId,
        type: activities.type,
        data: activities.data,
        createdAt: activities.createdAt,
        user: {
          id: users.id,
          displayName: users.displayName,
          username: users.username,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(activities)
      .innerJoin(users, eq(activities.userId, users.id))
      .where(eq(activities.cardId, cardId))
      .orderBy(desc(activities.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    return { activities: rows };
  });
}
