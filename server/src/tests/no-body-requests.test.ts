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
 * Helper: creates a user, workspace, board, list, card, and fetches board labels.
 * Also creates a second user added as a board member (for member assignment tests).
 */
async function setupBoardWithCardAndMember(appInstance: FastifyInstance) {
  const owner = await createTestUser(appInstance);
  const member = await createTestUser(appInstance);

  const boardRes = await injectWithAuth(appInstance, owner.cookies, {
    method: 'POST',
    url: '/api/v1/boards',
    payload: { workspaceId: owner.workspace.id, name: 'No-Body Test Board' },
  });
  const board = boardRes.json().board;

  // Get board labels (created automatically with the board)
  const boardDetail = await injectWithAuth(appInstance, owner.cookies, {
    method: 'GET',
    url: `/api/v1/boards/${board.id}`,
  });
  const labels = boardDetail.json().labels;

  // Add member to board
  await injectWithAuth(appInstance, owner.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/members`,
    payload: { userId: member.user.id, role: 'normal' },
  });

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

  return { owner, member, board, list, card, labels };
}

// ── Tests proving the API works when called WITHOUT Content-Type on no-body requests ──

describe('No-body requests without Content-Type header', () => {
  it('POST /cards/:cardId/labels/:labelId with NO body and NO content-type returns 201', async () => {
    const { owner, card, labels } = await setupBoardWithCardAndMember(app);
    const labelId = labels[0].id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/cards/${card.id}/labels/${labelId}`,
      headers: {
        cookie: owner.cookies,
      },
    });

    expect(res.statusCode).toBe(201);
  });

  it('DELETE /cards/:cardId/labels/:labelId with NO body and NO content-type returns 204', async () => {
    const { owner, card, labels } = await setupBoardWithCardAndMember(app);
    const labelId = labels[0].id;

    // First apply the label so we can remove it
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/labels/${labelId}`,
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/cards/${card.id}/labels/${labelId}`,
      headers: {
        cookie: owner.cookies,
      },
    });

    expect(res.statusCode).toBe(204);
  });

  it('POST /cards/:cardId/members/:userId with NO body and NO content-type returns 201', async () => {
    const { owner, member, card } = await setupBoardWithCardAndMember(app);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/cards/${card.id}/members/${member.user.id}`,
      headers: {
        cookie: owner.cookies,
      },
    });

    expect(res.statusCode).toBe(201);
  });

  it('DELETE /cards/:cardId/members/:userId with NO body and NO content-type returns 204', async () => {
    const { owner, member, card } = await setupBoardWithCardAndMember(app);

    // First assign the member so we can remove them
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/members/${member.user.id}`,
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/cards/${card.id}/members/${member.user.id}`,
      headers: {
        cookie: owner.cookies,
      },
    });

    expect(res.statusCode).toBe(204);
  });

  it('DELETE /cards/:cardId with NO body and NO content-type returns 204', async () => {
    const { owner, card } = await setupBoardWithCardAndMember(app);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/cards/${card.id}`,
      headers: {
        cookie: owner.cookies,
      },
    });

    expect(res.statusCode).toBe(204);
  });

  it('POST /auth/logout with NO body and NO content-type returns 200', async () => {
    const { owner } = await setupBoardWithCardAndMember(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: owner.cookies,
      },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ── Tests documenting the current bug: Content-Type: application/json with empty body ──

describe('Fixed: Content-Type application/json with empty body now works', () => {
  // These tests verify the fix: the server now gracefully handles
  // Content-Type: application/json with an empty body (via custom content type parser).

  it('POST /cards/:cardId/labels/:labelId with Content-Type: application/json and EMPTY body returns 201', async () => {
    const { owner, card, labels } = await setupBoardWithCardAndMember(app);
    const labelId = labels[0].id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/cards/${card.id}/labels/${labelId}`,
      headers: {
        cookie: owner.cookies,
        'content-type': 'application/json',
      },
    });

    expect(res.statusCode).toBe(201);
  });

  it('DELETE /cards/:cardId with Content-Type: application/json and EMPTY body returns 204', async () => {
    const { owner, card } = await setupBoardWithCardAndMember(app);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/cards/${card.id}`,
      headers: {
        cookie: owner.cookies,
        'content-type': 'application/json',
      },
    });

    expect(res.statusCode).toBe(204);
  });
});
