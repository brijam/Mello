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
 * Helper: creates a user, workspace, board, list, and card.
 * Also creates a second user and adds them as a board member.
 */
async function setupTwoUsersWithBoard(appInstance: FastifyInstance) {
  const actor = await createTestUser(appInstance, {
    username: 'actor',
    email: 'actor@example.com',
    displayName: 'Actor User',
  });
  const recipient = await createTestUser(appInstance, {
    username: 'recipient',
    email: 'recipient@example.com',
    displayName: 'Recipient User',
  });

  // Create a board as the actor
  const boardRes = await injectWithAuth(appInstance, actor.cookies, {
    method: 'POST',
    url: '/api/v1/boards',
    payload: { workspaceId: actor.workspace.id, name: 'Test Board' },
  });
  const board = boardRes.json().board;

  // Add recipient as a board member (this creates a board_added notification)
  await injectWithAuth(appInstance, actor.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/members`,
    payload: { userId: recipient.user.id, role: 'normal' },
  });

  // Clear any setup-generated notifications so tests start clean
  await injectWithAuth(appInstance, recipient.cookies, {
    method: 'POST',
    url: '/api/v1/notifications/mark-all-read',
  });
  // Actually delete them by truncating — mark-read isn't enough for count tests
  // Use a direct DB call instead
  const { db } = await import('../db/index.js');
  const { sql } = await import('drizzle-orm');
  await db.execute(sql`DELETE FROM notifications WHERE user_id = ${recipient.user.id}`);

  // Create a list and card
  const listRes = await injectWithAuth(appInstance, actor.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/lists`,
    payload: { name: 'To Do' },
  });
  const list = listRes.json().list;

  const cardRes = await injectWithAuth(appInstance, actor.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${list.id}/cards`,
    payload: { name: 'Test Card' },
  });
  const card = cardRes.json().card;

  return { actor, recipient, board, list, card };
}

// ── Notification CRUD ─────────────────────────────────────────────────────────

describe('GET /api/v1/notifications', () => {
  it('returns empty array for new user', async () => {
    const { recipient } = await setupTwoUsersWithBoard(app);

    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toEqual([]);
    expect(body.unreadCount).toBe(0);
  });

  it('returns notifications in reverse chronological order', async () => {
    const { actor, recipient, card } = await setupTwoUsersWithBoard(app);

    // Create two notifications by posting two comments with @mention
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @recipient first mention' },
    });
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @recipient second mention' },
    });

    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toHaveLength(2);
    // Reverse chronological: second mention should appear first
    expect(body.notifications[0].data.commentSnippet).toContain('second');
    expect(body.notifications[1].data.commentSnippet).toContain('first');
  });

  it('returns only unread notifications when unread=true', async () => {
    const { actor, recipient, card } = await setupTwoUsersWithBoard(app);

    // Create two notifications
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @recipient first' },
    });
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @recipient second' },
    });

    // Get all notifications to find the first one's ID
    const allRes = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });
    const allNotifications = allRes.json().notifications;
    expect(allNotifications).toHaveLength(2);

    // Mark the first notification (most recent) as read
    await injectWithAuth(app, recipient.cookies, {
      method: 'POST',
      url: '/api/v1/notifications/mark-read',
      payload: { ids: [allNotifications[0].id] },
    });

    // Now filter for unread only
    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications?unread=true',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].read).toBe(false);
  });

  it('response includes unreadCount', async () => {
    const { actor, recipient, card } = await setupTwoUsersWithBoard(app);

    // Create 3 notifications
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @recipient one' },
    });
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @recipient two' },
    });
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @recipient three' },
    });

    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.unreadCount).toBe(3);
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/notifications/mark-read', () => {
  it('marks specified notifications as read', async () => {
    const { actor, recipient, card } = await setupTwoUsersWithBoard(app);

    // Create a notification
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @recipient check this' },
    });

    // Get the notification
    const listRes = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });
    const notifId = listRes.json().notifications[0].id;

    // Mark as read
    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'POST',
      url: '/api/v1/notifications/mark-read',
      payload: { ids: [notifId] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().updated).toBe(1);

    // Verify it's now read
    const afterRes = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });
    const notif = afterRes.json().notifications.find((n: any) => n.id === notifId);
    expect(notif.read).toBe(true);
  });

  it('ignores IDs belonging to other users (no error)', async () => {
    const { actor, recipient, card } = await setupTwoUsersWithBoard(app);

    // Create a notification for recipient
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @recipient check this' },
    });

    // Get recipient's notification ID
    const listRes = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });
    const notifId = listRes.json().notifications[0].id;

    // Actor tries to mark recipient's notification as read
    const res = await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: '/api/v1/notifications/mark-read',
      payload: { ids: [notifId] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().updated).toBe(0); // Should not update any

    // Verify it's still unread for the recipient
    const afterRes = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });
    expect(afterRes.json().notifications[0].read).toBe(false);
  });

  it('returns 400 with empty ids array', async () => {
    const { recipient } = await setupTwoUsersWithBoard(app);

    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'POST',
      url: '/api/v1/notifications/mark-read',
      payload: { ids: [] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/mark-read',
      payload: { ids: ['00000000-0000-0000-0000-000000000000'] },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/notifications/mark-all-read', () => {
  it('marks all notifications as read', async () => {
    const { actor, recipient, card } = await setupTwoUsersWithBoard(app);

    // Create multiple notifications
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @recipient one' },
    });
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @recipient two' },
    });

    // Mark all as read
    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'POST',
      url: '/api/v1/notifications/mark-all-read',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().updated).toBe(2);

    // Verify all are read
    const afterRes = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications?unread=true',
    });
    expect(afterRes.json().notifications).toHaveLength(0);
    expect(afterRes.json().unreadCount).toBe(0);
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/mark-all-read',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ── Notification Auto-Creation Triggers ───────────────────────────────────────

describe('Notification trigger: @mention in comment', () => {
  it('creates notification for mentioned user', async () => {
    const { actor, recipient, card } = await setupTwoUsersWithBoard(app);

    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @recipient please review' },
    });

    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].type).toBe('mention');
  });

  it('creates no notification for non-existent username', async () => {
    const { actor, recipient, card } = await setupTwoUsersWithBoard(app);

    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @nonexistentuser check this' },
    });

    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().notifications).toHaveLength(0);
  });

  it('creates notification for self-mention (comment author mentions themselves)', async () => {
    const { actor, card } = await setupTwoUsersWithBoard(app);

    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Reminding myself @actor to do this' },
    });

    const res = await injectWithAuth(app, actor.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().notifications).toHaveLength(1);
    expect(res.json().notifications[0].type).toBe('mention');
  });

  it('creates no notification for user not on the board', async () => {
    const { actor, card } = await setupTwoUsersWithBoard(app);

    // Create a third user who is NOT a board member
    const outsider = await createTestUser(app, {
      username: 'outsider',
      email: 'outsider@example.com',
      displayName: 'Outsider User',
    });

    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @outsider check this' },
    });

    const res = await injectWithAuth(app, outsider.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().notifications).toHaveLength(0);
  });

  it('creates multiple notifications for multiple @mentions', async () => {
    const { actor, recipient, card, board } = await setupTwoUsersWithBoard(app);

    // Create a third user and add to board
    const thirdUser = await createTestUser(app, {
      username: 'thirduser',
      email: 'third@example.com',
      displayName: 'Third User',
    });
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${board.id}/members`,
      payload: { userId: thirdUser.user.id, role: 'normal' },
    });

    // Clear the board_added notification for thirdUser
    const { db: dbInstance } = await import('../db/index.js');
    const { sql: sqlTag } = await import('drizzle-orm');
    await dbInstance.execute(sqlTag`DELETE FROM notifications WHERE user_id = ${thirdUser.user.id}`);

    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @recipient and @thirduser check this' },
    });

    // Check recipient's notifications
    const recipientRes = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });
    expect(recipientRes.json().notifications).toHaveLength(1);
    expect(recipientRes.json().notifications[0].type).toBe('mention');

    // Check thirduser's notifications
    const thirdRes = await injectWithAuth(app, thirdUser.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });
    expect(thirdRes.json().notifications).toHaveLength(1);
    expect(thirdRes.json().notifications[0].type).toBe('mention');
  });
});

describe('Notification trigger: card assignment', () => {
  it('creates notification for assigned user', async () => {
    const { actor, recipient, card } = await setupTwoUsersWithBoard(app);

    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/members/${recipient.user.id}`,
    });

    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].type).toBe('card_assigned');
  });

  it('creates no notification for self-assignment', async () => {
    const { actor, card } = await setupTwoUsersWithBoard(app);

    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/members/${actor.user.id}`,
    });

    const res = await injectWithAuth(app, actor.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().notifications).toHaveLength(0);
  });
});

describe('Notification trigger: board member added', () => {
  it('creates notification for added user', async () => {
    const owner = await createTestUser(app, {
      username: 'owner',
      email: 'owner@example.com',
      displayName: 'Owner User',
    });
    const newMember = await createTestUser(app, {
      username: 'newmember',
      email: 'newmember@example.com',
      displayName: 'New Member',
    });

    // Create a board
    const boardRes = await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: owner.workspace.id, name: 'Test Board' },
    });
    const board = boardRes.json().board;

    // Add the new member
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${board.id}/members`,
      payload: { userId: newMember.user.id, role: 'normal' },
    });

    const res = await injectWithAuth(app, newMember.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].type).toBe('board_added');
  });

  it('creates no notification when adding self to board', async () => {
    const owner = await createTestUser(app, {
      username: 'selfadder',
      email: 'selfadder@example.com',
      displayName: 'Self Adder',
    });

    // The owner is already a member of the board when they create it.
    // Creating a board implicitly adds the creator as admin,
    // so no board_added notification should be created for the creator.
    const boardRes = await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: owner.workspace.id, name: 'My Board' },
    });
    expect(boardRes.statusCode).toBe(201);

    const res = await injectWithAuth(app, owner.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().notifications).toHaveLength(0);
  });
});

// ── Notification Data Shape ───────────────────────────────────────────────────

describe('Notification data shape', () => {
  it('mention notification has correct data fields', async () => {
    const { actor, recipient, card, board } = await setupTwoUsersWithBoard(app);

    const commentRes = await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hey @recipient please review this task' },
    });
    const comment = commentRes.json().comment;

    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    const notif = res.json().notifications[0];
    expect(notif.id).toBeDefined();
    expect(notif.type).toBe('mention');
    expect(notif.read).toBe(false);
    expect(notif.createdAt).toBeDefined();

    // Data fields
    expect(notif.data.cardId).toBe(card.id);
    expect(notif.data.cardName).toBe('Test Card');
    expect(notif.data.boardId).toBe(board.id);
    expect(notif.data.boardName).toBe('Test Board');
    expect(notif.data.actorId).toBe(actor.user.id);
    expect(notif.data.actorDisplayName).toBe('Actor User');
    expect(notif.data.commentId).toBe(comment.id);
    expect(notif.data.commentSnippet).toBeDefined();
    expect(typeof notif.data.commentSnippet).toBe('string');
  });

  it('card_assigned notification has correct data fields', async () => {
    const { actor, recipient, card, board } = await setupTwoUsersWithBoard(app);

    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/members/${recipient.user.id}`,
    });

    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    const notif = res.json().notifications[0];
    expect(notif.id).toBeDefined();
    expect(notif.type).toBe('card_assigned');
    expect(notif.read).toBe(false);
    expect(notif.createdAt).toBeDefined();

    expect(notif.data.cardId).toBe(card.id);
    expect(notif.data.cardName).toBe('Test Card');
    expect(notif.data.boardId).toBe(board.id);
    expect(notif.data.boardName).toBe('Test Board');
    expect(notif.data.actorId).toBe(actor.user.id);
    expect(notif.data.actorDisplayName).toBe('Actor User');
    // card_assigned should NOT have commentId or commentSnippet
    expect(notif.data.commentId).toBeUndefined();
    expect(notif.data.commentSnippet).toBeUndefined();
  });

  it('board_added notification has correct data fields', async () => {
    const owner = await createTestUser(app, {
      username: 'boardowner',
      email: 'boardowner@example.com',
      displayName: 'Board Owner',
    });
    const newMember = await createTestUser(app, {
      username: 'boardmember',
      email: 'boardmember@example.com',
      displayName: 'Board Member',
    });

    const boardRes = await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: owner.workspace.id, name: 'Shared Board' },
    });
    const board = boardRes.json().board;

    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${board.id}/members`,
      payload: { userId: newMember.user.id, role: 'normal' },
    });

    const res = await injectWithAuth(app, newMember.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    const notif = res.json().notifications[0];
    expect(notif.id).toBeDefined();
    expect(notif.type).toBe('board_added');
    expect(notif.read).toBe(false);
    expect(notif.createdAt).toBeDefined();

    expect(notif.data.boardId).toBe(board.id);
    expect(notif.data.boardName).toBe('Shared Board');
    expect(notif.data.actorId).toBe(owner.user.id);
    expect(notif.data.actorDisplayName).toBe('Board Owner');
    // board_added should NOT have card-related fields
    expect(notif.data.cardId).toBeUndefined();
    expect(notif.data.cardName).toBeUndefined();
  });

  it('commentSnippet is first 100 chars of comment body', async () => {
    const { actor, recipient, card } = await setupTwoUsersWithBoard(app);

    const longBody = 'Hey @recipient ' + 'a'.repeat(200);
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: longBody },
    });

    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    const notif = res.json().notifications[0];
    expect(notif.data.commentSnippet).toBe(longBody.slice(0, 100));
    expect(notif.data.commentSnippet).toHaveLength(100);
  });
});

// ── Pagination ────────────────────────────────────────────────────────────────

describe('Notification pagination', () => {
  it('returns nextCursor when there are more notifications', async () => {
    const { actor, recipient, card } = await setupTwoUsersWithBoard(app);

    // Create many notifications (more than default limit of 20)
    for (let i = 0; i < 25; i++) {
      await injectWithAuth(app, actor.cookies, {
        method: 'POST',
        url: `/api/v1/cards/${card.id}/comments`,
        payload: { body: `Hey @recipient message ${i}` },
      });
    }

    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toHaveLength(20); // default limit
    expect(body.nextCursor).not.toBeNull();
    expect(body.nextCursor).toBeDefined();
  });

  it('passing cursor returns next page', async () => {
    const { actor, recipient, card } = await setupTwoUsersWithBoard(app);

    // Create 25 notifications
    for (let i = 0; i < 25; i++) {
      await injectWithAuth(app, actor.cookies, {
        method: 'POST',
        url: `/api/v1/cards/${card.id}/comments`,
        payload: { body: `Hey @recipient message ${i}` },
      });
    }

    // Get first page
    const firstRes = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });
    const firstBody = firstRes.json();
    expect(firstBody.nextCursor).toBeDefined();

    // Get second page
    const secondRes = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: `/api/v1/notifications?cursor=${firstBody.nextCursor}`,
    });

    expect(secondRes.statusCode).toBe(200);
    const secondBody = secondRes.json();
    expect(secondBody.notifications).toHaveLength(5); // 25 - 20 = 5
    expect(secondBody.nextCursor).toBeNull();

    // Ensure no duplicates between pages
    const firstIds = firstBody.notifications.map((n: any) => n.id);
    const secondIds = secondBody.notifications.map((n: any) => n.id);
    const overlap = firstIds.filter((id: string) => secondIds.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('custom limit works', async () => {
    const { actor, recipient, card } = await setupTwoUsersWithBoard(app);

    // Create 5 notifications
    for (let i = 0; i < 5; i++) {
      await injectWithAuth(app, actor.cookies, {
        method: 'POST',
        url: `/api/v1/cards/${card.id}/comments`,
        payload: { body: `Hey @recipient msg ${i}` },
      });
    }

    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications?limit=2',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toHaveLength(2);
    expect(body.nextCursor).not.toBeNull();
    // unreadCount should reflect total, not just this page
    expect(body.unreadCount).toBe(5);
  });
});

// ── Bug 6: Notification data completeness and triggers ───────────────────────

describe('Notification trigger completeness (Bug 6)', () => {
  it('card_assigned notification includes all required data fields', async () => {
    const { actor, recipient, card, board } = await setupTwoUsersWithBoard(app);

    // Assign recipient to card
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/members/${recipient.user.id}`,
    });

    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toHaveLength(1);
    const notif = body.notifications[0];
    expect(notif.type).toBe('card_assigned');

    // Verify ALL required data fields are present
    expect(notif.data.cardId).toBe(card.id);
    expect(notif.data.cardName).toBe('Test Card');
    expect(notif.data.boardId).toBe(board.id);
    expect(notif.data.boardName).toBe('Test Board');
    expect(notif.data.actorId).toBe(actor.user.id);
    expect(notif.data.actorDisplayName).toBe('Actor User');
  });

  it('board_added notification includes all required data fields', async () => {
    const owner = await createTestUser(app, {
      username: 'notifowner',
      email: 'notifowner@example.com',
      displayName: 'Notif Owner',
    });
    const newMember = await createTestUser(app, {
      username: 'notifmember',
      email: 'notifmember@example.com',
      displayName: 'Notif Member',
    });

    const boardRes = await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: owner.workspace.id, name: 'Notif Board' },
    });
    const board = boardRes.json().board;

    // Add new member to board
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${board.id}/members`,
      payload: { userId: newMember.user.id, role: 'normal' },
    });

    const res = await injectWithAuth(app, newMember.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toHaveLength(1);
    const notif = body.notifications[0];
    expect(notif.type).toBe('board_added');

    // Verify ALL required data fields
    expect(notif.data.boardId).toBe(board.id);
    expect(notif.data.boardName).toBe('Notif Board');
    expect(notif.data.actorId).toBe(owner.user.id);
    expect(notif.data.actorDisplayName).toBe('Notif Owner');
  });

  it('GET /boards/:boardId should include members for notification actor display', async () => {
    const { actor, recipient, board } = await setupTwoUsersWithBoard(app);

    const res = await injectWithAuth(app, actor.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // The board detail should include members so the client can resolve
    // notification actor names and avatars
    expect(body.members).toBeDefined();
    expect(body.members).toBeInstanceOf(Array);
    expect(body.members.length).toBeGreaterThanOrEqual(2);

    const actorMember = body.members.find(
      (m: any) => m.user?.id === actor.user.id || m.id === actor.user.id,
    );
    const recipientMember = body.members.find(
      (m: any) => m.user?.id === recipient.user.id || m.id === recipient.user.id,
    );
    expect(actorMember).toBeDefined();
    expect(recipientMember).toBeDefined();
  });

  it('notification data includes all fields: cardId, cardName, boardId, boardName, actorId, actorDisplayName', async () => {
    const { actor, recipient, card, board } = await setupTwoUsersWithBoard(app);

    // Trigger a card_assigned notification
    await injectWithAuth(app, actor.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/members/${recipient.user.id}`,
    });

    const res = await injectWithAuth(app, recipient.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    const notif = res.json().notifications[0];

    // Exhaustive field check
    expect(notif.data).toHaveProperty('cardId');
    expect(notif.data).toHaveProperty('cardName');
    expect(notif.data).toHaveProperty('boardId');
    expect(notif.data).toHaveProperty('boardName');
    expect(notif.data).toHaveProperty('actorId');
    expect(notif.data).toHaveProperty('actorDisplayName');

    // Values should be correct, not null or undefined
    expect(notif.data.cardId).toBe(card.id);
    expect(notif.data.cardName).toBe('Test Card');
    expect(notif.data.boardId).toBe(board.id);
    expect(notif.data.boardName).toBe('Test Board');
    expect(notif.data.actorId).toBe(actor.user.id);
    expect(notif.data.actorDisplayName).toBe('Actor User');
  });
});

// ── Bug 6: Self-mention should NOT create a notification ────────────────────

describe('Self-mention in comment (Bug 4)', () => {
  // Bug 4: Self-mentions SHOULD now create a notification so users can use
  // @mentions as personal reminders on cards.

  it('self-mention (@ownusername in own comment) creates a notification', async () => {
    const selfMentioner = await createTestUser(app, {
      username: 'selfmentioner',
      email: 'selfmentioner@example.com',
      displayName: 'Self Mentioner',
    });

    // Create a board, list, and card
    const boardRes = await injectWithAuth(app, selfMentioner.cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: selfMentioner.workspace.id, name: 'Self Mention Board' },
    });
    const board = boardRes.json().board;

    const listRes = await injectWithAuth(app, selfMentioner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${board.id}/lists`,
      payload: { name: 'List' },
    });
    const list = listRes.json().list;

    const cardRes = await injectWithAuth(app, selfMentioner.cookies, {
      method: 'POST',
      url: `/api/v1/lists/${list.id}/cards`,
      payload: { name: 'Self Mention Card' },
    });
    const card = cardRes.json().card;

    // Clear any notifications that may have been created during setup
    const { db: dbInstance } = await import('../db/index.js');
    const { sql: sqlTag } = await import('drizzle-orm');
    await dbInstance.execute(
      sqlTag`DELETE FROM notifications WHERE user_id = ${selfMentioner.user.id}`,
    );

    // Post a comment that @mentions the user's own username
    await injectWithAuth(app, selfMentioner.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Note to @selfmentioner: remember to follow up on this' },
    });

    // Verify a notification WAS created for the self-mention
    const res = await injectWithAuth(app, selfMentioner.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.unreadCount).toBe(1);
  });

  it('self-mention notification has correct type and data', async () => {
    const selfMentioner = await createTestUser(app, {
      username: 'selfmentioner2',
      email: 'selfmentioner2@example.com',
      displayName: 'Self Mentioner 2',
    });

    // Create a board, list, and card
    const boardRes = await injectWithAuth(app, selfMentioner.cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: selfMentioner.workspace.id, name: 'Self Mention Board 2' },
    });
    const board = boardRes.json().board;

    const listRes = await injectWithAuth(app, selfMentioner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${board.id}/lists`,
      payload: { name: 'List' },
    });
    const list = listRes.json().list;

    const cardRes = await injectWithAuth(app, selfMentioner.cookies, {
      method: 'POST',
      url: `/api/v1/lists/${list.id}/cards`,
      payload: { name: 'Self Mention Card 2' },
    });
    const card = cardRes.json().card;

    // Clear any notifications that may have been created during setup
    const { db: dbInstance } = await import('../db/index.js');
    const { sql: sqlTag } = await import('drizzle-orm');
    await dbInstance.execute(
      sqlTag`DELETE FROM notifications WHERE user_id = ${selfMentioner.user.id}`,
    );

    // Post a comment that @mentions the user's own username
    await injectWithAuth(app, selfMentioner.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Reminder @selfmentioner2 to check this' },
    });

    // Verify notification type and data
    const res = await injectWithAuth(app, selfMentioner.cookies, {
      method: 'GET',
      url: '/api/v1/notifications',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.notifications).toHaveLength(1);

    const notif = body.notifications[0];
    expect(notif.type).toBe('mention');
    expect(notif.data.cardId).toBe(card.id);
    expect(notif.data.boardId).toBe(board.id);
    expect(notif.data.actorId).toBe(selfMentioner.user.id);
  });
});
