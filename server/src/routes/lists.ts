import type { FastifyInstance } from 'fastify';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { createListSchema, updateListSchema, moveAllCardsSchema } from '@mello/shared';
import { db } from '../db/index.js';
import { lists } from '../db/schema/lists.js';
import { cards } from '../db/schema/cards.js';
import { cardLabels } from '../db/schema/labels.js';
import { requireAuth, requireBoardRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { NotFoundError } from '../utils/errors.js';
import { getNextPosition } from '../utils/position.js';
import { broadcast } from '../utils/broadcast.js';
import { WS_EVENTS } from '@mello/shared';

export async function listRoutes(app: FastifyInstance) {
  // Get lists with cards for a board
  app.get('/boards/:boardId/lists', {
    preHandler: [requireAuth, requireBoardRole('admin', 'normal', 'observer')],
  }, async (request) => {
    const { boardId } = request.params as { boardId: string };

    const boardLists = await db
      .select()
      .from(lists)
      .where(eq(lists.boardId, boardId))
      .orderBy(asc(lists.position));

    const boardCards = await db
      .select()
      .from(cards)
      .where(eq(cards.boardId, boardId))
      .orderBy(asc(cards.position));

    // Fetch card-label associations for all cards on this board
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

    // Group cards by list
    const cardsByList = new Map<string, (typeof boardCards[number] & { labelIds: string[] })[]>();
    for (const card of boardCards) {
      const listCards = cardsByList.get(card.listId) ?? [];
      listCards.push({ ...card, labelIds: labelsByCard.get(card.id) ?? [] });
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
}
