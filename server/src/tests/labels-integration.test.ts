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
 * Returns everything needed for label tests.
 */
async function setupBoardWithCard(appInstance: FastifyInstance) {
  const testUser = await createTestUser(appInstance);

  const boardRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: '/api/v1/boards',
    payload: { workspaceId: testUser.workspace.id, name: 'Label Test Board' },
  });
  const board = boardRes.json().board;

  // Get board labels
  const boardDetail = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'GET',
    url: `/api/v1/boards/${board.id}`,
  });
  const labels = boardDetail.json().labels;

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

  return { ...testUser, board, list, card, labels };
}

// ── Label Integration Tests ──────────────────────────────────────────────────

describe('Label toggle integration', () => {
  it('apply a label to a card, then GET card detail shows the label', async () => {
    const { cookies, card, labels } = await setupBoardWithCard(app);
    const labelId = labels[0].id;

    // Apply label
    const applyRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/labels/${labelId}`,
    });
    expect(applyRes.statusCode).toBe(201);

    // GET card detail and verify label is present
    const detailRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });
    expect(detailRes.statusCode).toBe(200);
    const body = detailRes.json();
    expect(body.card.labels).toHaveLength(1);
    expect(body.card.labels[0].id).toBe(labelId);
  });

  it('remove a label from a card, then GET card detail shows no labels', async () => {
    const { cookies, card, labels } = await setupBoardWithCard(app);
    const labelId = labels[0].id;

    // Apply then remove
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/labels/${labelId}`,
    });

    const removeRes = await injectWithAuth(app, cookies, {
      method: 'DELETE',
      url: `/api/v1/cards/${card.id}/labels/${labelId}`,
    });
    expect(removeRes.statusCode).toBe(204);

    // GET card detail and verify label is gone
    const detailRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.json().card.labels).toHaveLength(0);
  });

  it('apply multiple labels to one card, GET card detail shows all labels', async () => {
    const { cookies, card, labels } = await setupBoardWithCard(app);
    const label1 = labels[0];
    const label2 = labels[1];
    const label3 = labels[2];

    // Apply three labels
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/labels/${label1.id}`,
    });
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/labels/${label2.id}`,
    });
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/labels/${label3.id}`,
    });

    // GET card detail and verify all three labels are present
    const detailRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });
    expect(detailRes.statusCode).toBe(200);
    const body = detailRes.json();
    expect(body.card.labels).toHaveLength(3);

    const labelIds = body.card.labels.map((l: any) => l.id);
    expect(labelIds).toContain(label1.id);
    expect(labelIds).toContain(label2.id);
    expect(labelIds).toContain(label3.id);
  });

  it('GET /boards/:boardId/lists includes labelIds on cards after label assignment', async () => {
    const { cookies, board, list, card, labels } = await setupBoardWithCard(app);
    const label1 = labels[0];
    const label2 = labels[1];

    // Apply two labels
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/labels/${label1.id}`,
    });
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/labels/${label2.id}`,
    });

    // GET board lists
    const listsRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}/lists`,
    });
    expect(listsRes.statusCode).toBe(200);
    const body = listsRes.json();
    const listData = body.lists.find((l: any) => l.id === list.id);
    expect(listData).toBeDefined();
    expect(listData.cards).toHaveLength(1);
    expect(listData.cards[0].labelIds).toContain(label1.id);
    expect(listData.cards[0].labelIds).toContain(label2.id);
  });
});
