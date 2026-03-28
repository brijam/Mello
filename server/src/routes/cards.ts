import type { FastifyInstance } from 'fastify';
import { eq, and, asc } from 'drizzle-orm';
import { createCardSchema, updateCardSchema, moveCardSchema } from '@mello/shared';
import { db } from '../db/index.js';
import { cards } from '../db/schema/cards.js';
import { lists } from '../db/schema/lists.js';
import { labels, cardLabels } from '../db/schema/labels.js';
import { cardAssignments } from '../db/schema/card-assignments.js';
import { checklists, checklistItems } from '../db/schema/checklists.js';
import { attachments } from '../db/schema/attachments.js';
import { comments } from '../db/schema/comments.js';
import { users } from '../db/schema/users.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { getNextPosition } from '../utils/position.js';
import { broadcast } from '../utils/broadcast.js';
import { WS_EVENTS } from '@mello/shared';
import { boards } from '../db/schema/boards.js';
import { createNotification } from '../utils/notifications.js';

export async function cardRoutes(app: FastifyInstance) {
  // Create card
  app.post('/lists/:listId/cards', {
    preHandler: [requireAuth, validateBody(createCardSchema)],
  }, async (request, reply) => {
    const { listId } = request.params as { listId: string };
    const { name, description, position } = request.body as {
      name: string; description?: string; position?: number;
    };

    // Get the list to know the board
    const [list] = await db.select().from(lists).where(eq(lists.id, listId));
    if (!list) throw new NotFoundError('List');

    let pos = position;
    if (pos === undefined) {
      const existing = await db.select({ position: cards.position })
        .from(cards)
        .where(eq(cards.listId, listId))
        .orderBy(asc(cards.position));
      pos = getNextPosition(existing.at(-1)?.position);
    }

    const [card] = await db.insert(cards).values({
      listId,
      boardId: list.boardId,
      name,
      description: description ?? null,
      position: pos,
    }).returning();

    broadcast(app.io, list.boardId, WS_EVENTS.CARD_CREATED, { card: { ...card, labelIds: [] } });
    return reply.status(201).send({ card });
  });

  // Get card detail
  app.get('/cards/:cardId', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { cardId } = request.params as { cardId: string };

    const [card] = await db.select().from(cards).where(eq(cards.id, cardId));
    if (!card) throw new NotFoundError('Card');

    // Fetch related data in parallel
    const [cardLabelsRows, memberRows, checklistRows, attachmentRows, commentCount] = await Promise.all([
      db.select({
        id: labels.id,
        boardId: labels.boardId,
        name: labels.name,
        color: labels.color,
        position: labels.position,
      })
        .from(cardLabels)
        .innerJoin(labels, eq(cardLabels.labelId, labels.id))
        .where(eq(cardLabels.cardId, cardId)),

      db.select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
        .from(cardAssignments)
        .innerJoin(users, eq(cardAssignments.userId, users.id))
        .where(eq(cardAssignments.cardId, cardId)),

      db.select().from(checklists).where(eq(checklists.cardId, cardId)).orderBy(asc(checklists.position)),

      db.select().from(attachments).where(eq(attachments.cardId, cardId)).orderBy(attachments.createdAt),

      db.select({ id: comments.id }).from(comments).where(eq(comments.cardId, cardId)),
    ]);

    // Fetch checklist items for each checklist
    const checklistsWithItems = await Promise.all(
      checklistRows.map(async (cl) => {
        const items = await db.select()
          .from(checklistItems)
          .where(eq(checklistItems.checklistId, cl.id))
          .orderBy(asc(checklistItems.position));
        return { ...cl, items };
      }),
    );

    return {
      card: {
        ...card,
        labels: cardLabelsRows,
        members: memberRows,
        checklists: checklistsWithItems,
        attachments: attachmentRows,
        commentCount: commentCount.length,
      },
    };
  });

  // Update card
  app.patch('/cards/:cardId', {
    preHandler: [requireAuth, validateBody(updateCardSchema)],
  }, async (request) => {
    const { cardId } = request.params as { cardId: string };
    const body = request.body as Record<string, unknown>;

    const [card] = await db
      .update(cards)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(cards.id, cardId))
      .returning();

    if (!card) throw new NotFoundError('Card');
    broadcast(app.io, card.boardId, WS_EVENTS.CARD_UPDATED, { card });
    return { card };
  });

  // Delete card
  app.delete('/cards/:cardId', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { cardId } = request.params as { cardId: string };
    const [card] = await db.select().from(cards).where(eq(cards.id, cardId));
    await db.delete(cards).where(eq(cards.id, cardId));
    if (card) {
      broadcast(app.io, card.boardId, WS_EVENTS.CARD_DELETED, { cardId, listId: card.listId });
    }
    return reply.status(204).send();
  });

  // Move card
  app.post('/cards/:cardId/move', {
    preHandler: [requireAuth, validateBody(moveCardSchema)],
  }, async (request) => {
    const { cardId } = request.params as { cardId: string };
    const { listId, position, boardId } = request.body as {
      listId: string; position: number; boardId?: string;
    };

    // Fetch the card to know its current board
    const [existingCard] = await db.select().from(cards).where(eq(cards.id, cardId));
    if (!existingCard) throw new NotFoundError('Card');

    const isCrossBoard = boardId && boardId !== existingCard.boardId;

    if (isCrossBoard) {
      // Check membership on source board (admin or normal)
      const { boardMembers } = await import('../db/schema/boards.js');
      const [sourceMember] = await db.select().from(boardMembers).where(
        and(eq(boardMembers.boardId, existingCard.boardId), eq(boardMembers.userId, request.userId!)),
      );
      if (!sourceMember || !['admin', 'normal'].includes(sourceMember.role)) {
        throw new ForbiddenError();
      }

      // Check membership on target board (admin or normal)
      const [targetMember] = await db.select().from(boardMembers).where(
        and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, request.userId!)),
      );
      if (!targetMember || !['admin', 'normal'].includes(targetMember.role)) {
        throw new ForbiddenError();
      }

      // Verify the target list exists on the target board
      const [targetList] = await db.select().from(lists).where(
        and(eq(lists.id, listId), eq(lists.boardId, boardId)),
      );
      if (!targetList) throw new NotFoundError('Target list');
    }

    const updateData: Record<string, unknown> = {
      listId,
      position,
      updatedAt: new Date(),
    };

    if (boardId) {
      updateData.boardId = boardId;
    }

    const [card] = await db
      .update(cards)
      .set(updateData)
      .where(eq(cards.id, cardId))
      .returning();

    if (!card) throw new NotFoundError('Card');

    // If cross-board move, clear label associations
    if (isCrossBoard) {
      await db.delete(cardLabels).where(eq(cardLabels.cardId, cardId));
    }

    broadcast(app.io, card.boardId, WS_EVENTS.CARD_MOVED, { card });
    return { card };
  });

  // Card label management
  app.post('/cards/:cardId/labels/:labelId', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { cardId, labelId } = request.params as { cardId: string; labelId: string };
    await db.insert(cardLabels).values({ cardId, labelId }).onConflictDoNothing();
    const [card] = await db.select().from(cards).where(eq(cards.id, cardId));
    if (card) {
      broadcast(app.io, card.boardId, WS_EVENTS.CARD_UPDATED, { card, labelId, labelAction: 'added' });
    }
    return reply.status(201).send({ ok: true });
  });

  app.delete('/cards/:cardId/labels/:labelId', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { cardId, labelId } = request.params as { cardId: string; labelId: string };
    const [card] = await db.select().from(cards).where(eq(cards.id, cardId));
    await db.delete(cardLabels).where(
      and(eq(cardLabels.cardId, cardId), eq(cardLabels.labelId, labelId)),
    );
    if (card) {
      broadcast(app.io, card.boardId, WS_EVENTS.CARD_UPDATED, { card, labelId, labelAction: 'removed' });
    }
    return reply.status(204).send();
  });

  // Card member management
  app.post('/cards/:cardId/members/:userId', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { cardId, userId } = request.params as { cardId: string; userId: string };
    await db.insert(cardAssignments).values({ cardId, userId }).onConflictDoNothing();

    // Create notification if assigning someone else
    if (userId !== request.userId!) {
      const [card] = await db.select().from(cards).where(eq(cards.id, cardId));
      if (card) {
        const [board] = await db.select().from(boards).where(eq(boards.id, card.boardId));
        const [actor] = await db.select().from(users).where(eq(users.id, request.userId!));
        if (board && actor) {
          await createNotification(userId, 'card_assigned', {
            cardId: card.id,
            cardName: card.name,
            boardId: board.id,
            boardName: board.name,
            actorId: actor.id,
            actorDisplayName: actor.displayName,
          });
        }
      }
    }

    return reply.status(201).send({ ok: true });
  });

  app.delete('/cards/:cardId/members/:userId', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { cardId, userId } = request.params as { cardId: string; userId: string };
    await db.delete(cardAssignments).where(
      and(eq(cardAssignments.cardId, cardId), eq(cardAssignments.userId, userId)),
    );
    return reply.status(204).send();
  });
}
