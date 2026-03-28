import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, createTestUser, injectWithAuth, cleanDatabase } from './setup.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await cleanDatabase();
  await app.close();
});

beforeEach(async () => {
  await cleanDatabase();
});

/**
 * Helper: creates two users, a board, and a card.
 * User2 is added as a board member so they can be assigned to cards.
 */
async function setupTwoUsersWithBoard(appInstance: FastifyInstance) {
  const owner = await createTestUser(appInstance);
  const member = await createTestUser(appInstance);

  // Create board
  const boardRes = await injectWithAuth(appInstance, owner.cookies, {
    method: 'POST',
    url: '/api/v1/boards',
    payload: { workspaceId: owner.workspace.id, name: 'Members Test Board' },
  });
  const board = boardRes.json().board;

  // Add member to board
  await injectWithAuth(appInstance, owner.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/members`,
    payload: { userId: member.user.id, role: 'normal' },
  });

  // Create list and card
  const listRes = await injectWithAuth(appInstance, owner.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/lists`,
    payload: { name: 'To Do' },
  });
  const list = listRes.json().list;

  const cardRes = await injectWithAuth(appInstance, owner.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${list.id}/cards`,
    payload: { name: 'Test Card' },
  });
  const card = cardRes.json().card;

  return { owner, member, board, list, card };
}

// ── Card Member Integration Tests ────────────────────────────────────────────

describe('Card member assignment integration', () => {
  it('assign a member to a card, GET card detail shows the member', async () => {
    const { owner, member, card } = await setupTwoUsersWithBoard(app);

    // Assign member
    const assignRes = await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/members/${member.user.id}`,
    });
    expect(assignRes.statusCode).toBe(201);

    // GET card detail and verify member is present
    const detailRes = await injectWithAuth(app, owner.cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });
    expect(detailRes.statusCode).toBe(200);
    const body = detailRes.json();
    expect(body.card.members).toHaveLength(1);
    expect(body.card.members[0].id).toBe(member.user.id);
  });

  it('remove a member from a card, GET card detail shows no members', async () => {
    const { owner, member, card } = await setupTwoUsersWithBoard(app);

    // Assign then remove
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/members/${member.user.id}`,
    });

    const removeRes = await injectWithAuth(app, owner.cookies, {
      method: 'DELETE',
      url: `/api/v1/cards/${card.id}/members/${member.user.id}`,
    });
    expect(removeRes.statusCode).toBe(204);

    // GET card detail and verify member is gone
    const detailRes = await injectWithAuth(app, owner.cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.json().card.members).toHaveLength(0);
  });

  it('assign multiple members to one card', async () => {
    const { owner, member, card } = await setupTwoUsersWithBoard(app);

    // Assign both owner and member
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/members/${owner.user.id}`,
    });
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/members/${member.user.id}`,
    });

    // GET card detail and verify both members
    const detailRes = await injectWithAuth(app, owner.cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });
    expect(detailRes.statusCode).toBe(200);
    const body = detailRes.json();
    expect(body.card.members).toHaveLength(2);
    const memberIds = body.card.members.map((m: any) => m.id);
    expect(memberIds).toContain(owner.user.id);
    expect(memberIds).toContain(member.user.id);
  });

  it('assigning someone else to a card creates a notification', async () => {
    const { owner, member, card } = await setupTwoUsersWithBoard(app);

    // Clear any existing notifications for member
    const { db } = await import('../db/index.js');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`DELETE FROM notifications WHERE user_id = ${member.user.id}`);

    // Assign member to card (owner assigns member)
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/members/${member.user.id}`,
    });

    // Check member's notifications
    const notifRes = await injectWithAuth(app, member.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });
    expect(notifRes.statusCode).toBe(200);
    const body = notifRes.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].type).toBe('card_assigned');
    expect(body.notifications[0].data.cardId).toBe(card.id);
    expect(body.notifications[0].data.actorId).toBe(owner.user.id);
  });

  it('cannot assign a non-board-member to a card', async () => {
    const { owner, card } = await setupTwoUsersWithBoard(app);

    // Create a user who is NOT a board member
    const outsider = await createTestUser(app);

    // Try to assign outsider to card — should fail
    const assignRes = await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/members/${outsider.user.id}`,
    });

    // The API should reject this — non-board-members should not be assignable
    expect(assignRes.statusCode).toBe(403);
  });
});
