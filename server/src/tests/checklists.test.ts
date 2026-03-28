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

// ── Checklists ────────────────────────────────────────────────────────────────

describe('POST /api/v1/cards/:cardId/checklists', () => {
  it('creates a checklist with name and auto-position', async () => {
    const { cookies, card } = await setupCard(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/checklists`,
      payload: { name: 'My Checklist' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.checklist).toBeDefined();
    expect(body.checklist.name).toBe('My Checklist');
    expect(body.checklist.cardId).toBe(card.id);
    expect(body.checklist.position).toBeDefined();
    expect(body.checklist.items).toEqual([]);
  });

  it('auto-positions second checklist after first', async () => {
    const { cookies, card } = await setupCard(app);

    const res1 = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/checklists`,
      payload: { name: 'Checklist 1' },
    });
    const res2 = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/checklists`,
      payload: { name: 'Checklist 2' },
    });

    expect(res2.json().checklist.position).toBeGreaterThan(res1.json().checklist.position);
  });
});

describe('PATCH /api/v1/checklists/:checklistId', () => {
  it('updates checklist name', async () => {
    const { cookies, card } = await setupCard(app);

    const createRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/checklists`,
      payload: { name: 'Old Name' },
    });
    const checklistId = createRes.json().checklist.id;

    const res = await injectWithAuth(app, cookies, {
      method: 'PATCH',
      url: `/api/v1/checklists/${checklistId}`,
      payload: { name: 'New Name' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().checklist.name).toBe('New Name');
  });
});

describe('DELETE /api/v1/checklists/:checklistId', () => {
  it('deletes checklist and its items', async () => {
    const { cookies, card } = await setupCard(app);

    // Create checklist with an item
    const createRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/checklists`,
      payload: { name: 'Doomed Checklist' },
    });
    const checklistId = createRes.json().checklist.id;

    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/checklists/${checklistId}/items`,
      payload: { name: 'Doomed Item' },
    });

    const delRes = await injectWithAuth(app, cookies, {
      method: 'DELETE',
      url: `/api/v1/checklists/${checklistId}`,
    });
    expect(delRes.statusCode).toBe(204);

    // Verify checklist is gone from card detail
    const cardRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });
    expect(cardRes.json().card.checklists).toHaveLength(0);
  });
});

// ── Checklist Items ───────────────────────────────────────────────────────────

describe('POST /api/v1/checklists/:checklistId/items', () => {
  it('creates an item with name and auto-position', async () => {
    const { cookies, card } = await setupCard(app);

    const clRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/checklists`,
      payload: { name: 'Checklist' },
    });
    const checklistId = clRes.json().checklist.id;

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/checklists/${checklistId}/items`,
      payload: { name: 'Item 1' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.item).toBeDefined();
    expect(body.item.name).toBe('Item 1');
    expect(body.item.checklistId).toBe(checklistId);
    expect(body.item.checked).toBe(false);
    expect(body.item.position).toBeDefined();
  });

  it('auto-positions second item after first', async () => {
    const { cookies, card } = await setupCard(app);

    const clRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/checklists`,
      payload: { name: 'Checklist' },
    });
    const checklistId = clRes.json().checklist.id;

    const res1 = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/checklists/${checklistId}/items`,
      payload: { name: 'Item 1' },
    });
    const res2 = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/checklists/${checklistId}/items`,
      payload: { name: 'Item 2' },
    });

    expect(res2.json().item.position).toBeGreaterThan(res1.json().item.position);
  });
});

describe('PATCH /api/v1/checklist-items/:itemId', () => {
  it('toggles checked state', async () => {
    const { cookies, card } = await setupCard(app);

    const clRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/checklists`,
      payload: { name: 'Checklist' },
    });
    const checklistId = clRes.json().checklist.id;

    const itemRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/checklists/${checklistId}/items`,
      payload: { name: 'Toggle Me' },
    });
    const itemId = itemRes.json().item.id;

    // Toggle to checked
    const res = await injectWithAuth(app, cookies, {
      method: 'PATCH',
      url: `/api/v1/checklist-items/${itemId}`,
      payload: { checked: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().item.checked).toBe(true);
  });

  it('updates item name', async () => {
    const { cookies, card } = await setupCard(app);

    const clRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/checklists`,
      payload: { name: 'Checklist' },
    });
    const checklistId = clRes.json().checklist.id;

    const itemRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/checklists/${checklistId}/items`,
      payload: { name: 'Old Name' },
    });
    const itemId = itemRes.json().item.id;

    const res = await injectWithAuth(app, cookies, {
      method: 'PATCH',
      url: `/api/v1/checklist-items/${itemId}`,
      payload: { name: 'New Name' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().item.name).toBe('New Name');
  });
});

describe('DELETE /api/v1/checklist-items/:itemId', () => {
  it('deletes an item', async () => {
    const { cookies, card } = await setupCard(app);

    const clRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/checklists`,
      payload: { name: 'Checklist' },
    });
    const checklistId = clRes.json().checklist.id;

    const itemRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/checklists/${checklistId}/items`,
      payload: { name: 'To Delete' },
    });
    const itemId = itemRes.json().item.id;

    const delRes = await injectWithAuth(app, cookies, {
      method: 'DELETE',
      url: `/api/v1/checklist-items/${itemId}`,
    });
    expect(delRes.statusCode).toBe(204);

    // Verify item is gone via card detail
    const cardRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });
    const checklist = cardRes.json().card.checklists.find(
      (cl: { id: string }) => cl.id === checklistId,
    );
    expect(checklist.items).toHaveLength(0);
  });
});

// ── Card detail includes checklists ───────────────────────────────────────────

describe('GET /api/v1/cards/:cardId (checklists)', () => {
  it('returns checklists with items in card detail', async () => {
    const { cookies, card } = await setupCard(app);

    // Create a checklist with two items
    const clRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/checklists`,
      payload: { name: 'My Checklist' },
    });
    const checklistId = clRes.json().checklist.id;

    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/checklists/${checklistId}/items`,
      payload: { name: 'Item A' },
    });
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/checklists/${checklistId}/items`,
      payload: { name: 'Item B' },
    });

    // Fetch card detail
    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.card.checklists).toHaveLength(1);
    expect(body.card.checklists[0].name).toBe('My Checklist');
    expect(body.card.checklists[0].items).toHaveLength(2);
    expect(body.card.checklists[0].items[0].name).toBe('Item A');
    expect(body.card.checklists[0].items[1].name).toBe('Item B');
  });
});
