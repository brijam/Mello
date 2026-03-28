import type { FastifyInstance } from 'fastify';
import { eq, and, desc, lt, inArray, count } from 'drizzle-orm';
import { listNotificationsSchema, markReadSchema } from '@mello/shared';
import { db } from '../db/index.js';
import { notifications } from '../db/schema/notifications.js';
import { requireAuth } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';

export async function notificationRoutes(app: FastifyInstance) {
  // List notifications
  app.get('/notifications', {
    preHandler: [requireAuth],
  }, async (request) => {
    const query = listNotificationsSchema.parse(request.query);
    const userId = request.userId!;
    const limit = query.limit ?? 20;

    // Build conditions
    const conditions = [eq(notifications.userId, userId)];

    if (query.unread === 'true') {
      conditions.push(eq(notifications.read, false));
    }

    if (query.cursor) {
      // Get the cursor notification's createdAt
      const [cursorNotif] = await db
        .select({ createdAt: notifications.createdAt })
        .from(notifications)
        .where(eq(notifications.id, query.cursor));

      if (cursorNotif) {
        conditions.push(lt(notifications.createdAt, cursorNotif.createdAt));
      }
    }

    const rows = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    // Always get total unread count
    const [unreadResult] = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));

    const unreadCount = Number(unreadResult?.count ?? 0);

    return {
      notifications: page.map((n) => ({
        id: n.id,
        type: n.type,
        data: n.data,
        read: n.read,
        createdAt: n.createdAt,
      })),
      unreadCount,
      nextCursor,
    };
  });

  // Mark specific notifications as read
  app.post('/notifications/mark-read', {
    preHandler: [requireAuth],
  }, async (request) => {
    let parsed;
    try {
      parsed = markReadSchema.parse(request.body);
    } catch {
      throw new ValidationError('ids must be a non-empty array of UUIDs');
    }
    const userId = request.userId!;

    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.userId, userId),
          inArray(notifications.id, parsed.ids),
        ),
      )
      .returning({ id: notifications.id });

    return { updated: result.length };
  });

  // Mark all notifications as read
  app.post('/notifications/mark-all-read', {
    preHandler: [requireAuth],
  }, async (request) => {
    const userId = request.userId!;

    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.read, false),
        ),
      )
      .returning({ id: notifications.id });

    return { updated: result.length };
  });
}
