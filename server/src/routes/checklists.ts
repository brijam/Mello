import type { FastifyInstance } from 'fastify';
import { eq, asc } from 'drizzle-orm';
import {
  createChecklistSchema,
  updateChecklistSchema,
  createChecklistItemSchema,
  updateChecklistItemSchema,
} from '@mello/shared';
import { db } from '../db/index.js';
import { checklists, checklistItems } from '../db/schema/checklists.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { NotFoundError } from '../utils/errors.js';
import { getNextPosition } from '../utils/position.js';
import { logActivity } from '../utils/activity.js';
import { cards } from '../db/schema/cards.js';

export async function checklistRoutes(app: FastifyInstance) {
  // Create checklist
  app.post('/cards/:cardId/checklists', {
    preHandler: [requireAuth, validateBody(createChecklistSchema)],
  }, async (request, reply) => {
    const { cardId } = request.params as { cardId: string };
    const { name, position } = request.body as { name: string; position?: number };

    let pos = position;
    if (pos === undefined) {
      const existing = await db.select({ position: checklists.position })
        .from(checklists)
        .where(eq(checklists.cardId, cardId))
        .orderBy(asc(checklists.position));
      pos = getNextPosition(existing.at(-1)?.position);
    }

    const [checklist] = await db.insert(checklists).values({
      cardId,
      name,
      position: pos,
    }).returning();

    try {
      const [card] = await db.select().from(cards).where(eq(cards.id, cardId));
      if (card) {
        await logActivity({
          cardId,
          boardId: card.boardId,
          userId: request.userId!,
          type: 'checklist_added',
          data: { checklistName: name },
        });
      }
    } catch { /* fire-and-forget */ }

    return reply.status(201).send({ checklist: { ...checklist, items: [] } });
  });

  // Update checklist
  app.patch('/checklists/:checklistId', {
    preHandler: [requireAuth, validateBody(updateChecklistSchema)],
  }, async (request) => {
    const { checklistId } = request.params as { checklistId: string };
    const { name } = request.body as { name: string };

    const [checklist] = await db
      .update(checklists)
      .set({ name })
      .where(eq(checklists.id, checklistId))
      .returning();

    if (!checklist) throw new NotFoundError('Checklist');
    return { checklist };
  });

  // Delete checklist
  app.delete('/checklists/:checklistId', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { checklistId } = request.params as { checklistId: string };
    const [deleted] = await db.delete(checklists).where(eq(checklists.id, checklistId)).returning();
    if (!deleted) throw new NotFoundError('Checklist');

    try {
      const [card] = await db.select().from(cards).where(eq(cards.id, deleted.cardId));
      if (card) {
        await logActivity({
          cardId: deleted.cardId,
          boardId: card.boardId,
          userId: request.userId!,
          type: 'checklist_removed',
          data: { checklistName: deleted.name },
        });
      }
    } catch { /* fire-and-forget */ }

    return reply.status(204).send();
  });

  // Create checklist item
  app.post('/checklists/:checklistId/items', {
    preHandler: [requireAuth, validateBody(createChecklistItemSchema)],
  }, async (request, reply) => {
    const { checklistId } = request.params as { checklistId: string };
    const { name, position } = request.body as { name: string; position?: number };

    // Verify checklist exists
    const [cl] = await db.select().from(checklists).where(eq(checklists.id, checklistId));
    if (!cl) throw new NotFoundError('Checklist');

    let pos = position;
    if (pos === undefined) {
      const existing = await db.select({ position: checklistItems.position })
        .from(checklistItems)
        .where(eq(checklistItems.checklistId, checklistId))
        .orderBy(asc(checklistItems.position));
      pos = getNextPosition(existing.at(-1)?.position);
    }

    const [item] = await db.insert(checklistItems).values({
      checklistId,
      name,
      position: pos,
    }).returning();

    return reply.status(201).send({ item });
  });

  // Update checklist item
  app.patch('/checklist-items/:itemId', {
    preHandler: [requireAuth, validateBody(updateChecklistItemSchema)],
  }, async (request) => {
    const { itemId } = request.params as { itemId: string };
    const body = request.body as Record<string, unknown>;

    const [item] = await db
      .update(checklistItems)
      .set(body)
      .where(eq(checklistItems.id, itemId))
      .returning();

    if (!item) throw new NotFoundError('Checklist item');

    if (typeof body.checked === 'boolean') {
      try {
        const [cl] = await db.select().from(checklists).where(eq(checklists.id, item.checklistId));
        if (cl) {
          const [card] = await db.select().from(cards).where(eq(cards.id, cl.cardId));
          if (card) {
            await logActivity({
              cardId: cl.cardId,
              boardId: card.boardId,
              userId: request.userId!,
              type: body.checked ? 'checklist_item_checked' : 'checklist_item_unchecked',
              data: { checklistName: cl.name, itemName: item.name },
            });
          }
        }
      } catch { /* fire-and-forget */ }
    }

    return { item };
  });

  // Delete checklist item
  app.delete('/checklist-items/:itemId', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const [deleted] = await db.delete(checklistItems).where(eq(checklistItems.id, itemId)).returning();
    if (!deleted) throw new NotFoundError('Checklist item');
    return reply.status(204).send();
  });
}
