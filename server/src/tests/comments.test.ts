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
 */
async function setupCard(appInstance: FastifyInstance) {
  const testUser = await createTestUser(appInstance);
  const boardRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: '/api/v1/boards',
    payload: { workspaceId: testUser.workspace.id, name: 'Test Board' },
  });
  const board = boardRes.json().board;

  const listRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/lists`,
    payload: { name: 'To Do' },
  });
  const list = listRes.json().list;

  const cardRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${list.id}/cards`,
    payload: { name: 'Test Card' },
  });
  const card = cardRes.json().card;

  return { ...testUser, board, list, card };
}

// ── Comments ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/cards/:cardId/comments', () => {
  it('creates a comment with user info', async () => {
    const { cookies, card, user } = await setupCard(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Hello, world!' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.comment).toBeDefined();
    expect(body.comment.body).toBe('Hello, world!');
    expect(body.comment.cardId).toBe(card.id);
    expect(body.comment.user).toBeDefined();
    expect(body.comment.user.id).toBe(user.id);
    expect(body.comment.user.username).toBe(user.username);
  });
});

describe('GET /api/v1/cards/:cardId/comments', () => {
  it('returns comments with user info, ordered desc by createdAt', async () => {
    const { cookies, card } = await setupCard(app);

    // Create two comments
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'First comment' },
    });
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Second comment' },
    });

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}/comments`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.comments).toHaveLength(2);

    // Should be desc order — second comment first
    expect(body.comments[0].body).toBe('Second comment');
    expect(body.comments[1].body).toBe('First comment');

    // Each comment should have user info
    expect(body.comments[0].user).toBeDefined();
    expect(body.comments[0].user.username).toBeDefined();
    expect(body.comments[0].user.displayName).toBeDefined();
  });
});

describe('PATCH /api/v1/comments/:commentId', () => {
  it('edits comment body and sets editedAt', async () => {
    const { cookies, card } = await setupCard(app);

    const createRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Original body' },
    });
    const commentId = createRes.json().comment.id;

    const res = await injectWithAuth(app, cookies, {
      method: 'PATCH',
      url: `/api/v1/comments/${commentId}`,
      payload: { body: 'Edited body' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().comment.body).toBe('Edited body');
    expect(res.json().comment.editedAt).not.toBeNull();
  });

  it('rejects edit by non-author', async () => {
    const { cookies, card, board } = await setupCard(app);

    // Create a comment as the first user
    const createRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'My comment' },
    });
    const commentId = createRes.json().comment.id;

    // Create a second user and add them to the board
    const otherUser = await createTestUser(app);
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/boards/${board.id}/members`,
      payload: { userId: otherUser.user.id, role: 'normal' },
    });

    // Second user tries to edit the comment
    const res = await injectWithAuth(app, otherUser.cookies, {
      method: 'PATCH',
      url: `/api/v1/comments/${commentId}`,
      payload: { body: 'Hacked body' },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe('DELETE /api/v1/comments/:commentId', () => {
  it('deletes own comment', async () => {
    const { cookies, card } = await setupCard(app);

    const createRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'To delete' },
    });
    const commentId = createRes.json().comment.id;

    const delRes = await injectWithAuth(app, cookies, {
      method: 'DELETE',
      url: `/api/v1/comments/${commentId}`,
    });
    expect(delRes.statusCode).toBe(204);

    // Verify comment is gone
    const listRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}/comments`,
    });
    expect(listRes.json().comments).toHaveLength(0);
  });

  it('rejects delete by non-author', async () => {
    const { cookies, card, board } = await setupCard(app);

    // Create a comment as the first user
    const createRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'My comment' },
    });
    const commentId = createRes.json().comment.id;

    // Create a second user and add them to the board
    const otherUser = await createTestUser(app);
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/boards/${board.id}/members`,
      payload: { userId: otherUser.user.id, role: 'normal' },
    });

    // Second user tries to delete the comment
    const res = await injectWithAuth(app, otherUser.cookies, {
      method: 'DELETE',
      url: `/api/v1/comments/${commentId}`,
    });

    expect(res.statusCode).toBe(403);
  });
});
