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
 * Helper: creates a user, workspace, and board, returning all IDs and cookies.
 */
async function setupBoard(appInstance: FastifyInstance) {
  const testUser = await createTestUser(appInstance);
  const boardRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: '/api/v1/boards',
    payload: { workspaceId: testUser.workspace.id, name: 'Test Board' },
  });
  const board = boardRes.json().board;
  return { ...testUser, board };
}

/**
 * Helper: creates a list in a board.
 */
async function createList(appInstance: FastifyInstance, cookies: string, boardId: string, name: string) {
  const res = await injectWithAuth(appInstance, cookies, {
    method: 'POST',
    url: `/api/v1/boards/${boardId}/lists`,
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json().list;
}

/**
 * Helper: creates a card in a list.
 */
async function createCard(appInstance: FastifyInstance, cookies: string, listId: string, name: string) {
  const res = await injectWithAuth(appInstance, cookies, {
    method: 'POST',
    url: `/api/v1/lists/${listId}/cards`,
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json().card;
}

// ── Lists ──────────────────────────────────────────────────────────────────────

describe('GET /api/v1/boards/:boardId/lists', () => {
  it('returns lists with cards and labelIds', async () => {
    const { cookies, board } = await setupBoard(app);

    // Create two lists
    const list1 = await createList(app, cookies, board.id, 'To Do');
    const list2 = await createList(app, cookies, board.id, 'Done');

    // Create a card in list1
    const card = await createCard(app, cookies, list1.id, 'Task 1');

    // Add a label to the card (use the board's default labels)
    const boardRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}`,
    });
    const labelId = boardRes.json().labels[0].id;

    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/labels/${labelId}`,
    });

    // Fetch lists
    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}/lists`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.lists).toHaveLength(2);

    // Lists should be ordered by position
    expect(body.lists[0].name).toBe('To Do');
    expect(body.lists[1].name).toBe('Done');

    // First list should have one card with labelIds
    expect(body.lists[0].cards).toHaveLength(1);
    expect(body.lists[0].cards[0].name).toBe('Task 1');
    expect(body.lists[0].cards[0].labelIds).toContain(labelId);

    // Second list should have no cards
    expect(body.lists[1].cards).toHaveLength(0);
  });
});

describe('POST /api/v1/boards/:boardId/lists', () => {
  it('creates list with auto-position', async () => {
    const { cookies, board } = await setupBoard(app);

    const list1 = await createList(app, cookies, board.id, 'List 1');
    const list2 = await createList(app, cookies, board.id, 'List 2');

    expect(list1.position).toBeDefined();
    expect(list2.position).toBeGreaterThan(list1.position);
    expect(list1.boardId).toBe(board.id);
  });
});

describe('PATCH /api/v1/lists/:listId', () => {
  it('updates list name', async () => {
    const { cookies, board } = await setupBoard(app);
    const list = await createList(app, cookies, board.id, 'Old Name');

    const res = await injectWithAuth(app, cookies, {
      method: 'PATCH',
      url: `/api/v1/lists/${list.id}`,
      payload: { name: 'New Name' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().list.name).toBe('New Name');
  });
});

describe('DELETE /api/v1/lists/:listId', () => {
  it('deletes list and its cards are cascade-deleted', async () => {
    const { cookies, board } = await setupBoard(app);
    const list = await createList(app, cookies, board.id, 'Doomed List');
    await createCard(app, cookies, list.id, 'Doomed Card');

    const res = await injectWithAuth(app, cookies, {
      method: 'DELETE',
      url: `/api/v1/lists/${list.id}`,
    });
    expect(res.statusCode).toBe(204);

    // Verify list and cards are gone
    const listsRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}/lists`,
    });
    expect(listsRes.json().lists).toHaveLength(0);
  });
});

// ── Cards ──────────────────────────────────────────────────────────────────────

describe('POST /api/v1/lists/:listId/cards', () => {
  it('creates a card with auto-position', async () => {
    const { cookies, board } = await setupBoard(app);
    const list = await createList(app, cookies, board.id, 'To Do');

    const card1 = await createCard(app, cookies, list.id, 'Card 1');
    const card2 = await createCard(app, cookies, list.id, 'Card 2');

    expect(card1.listId).toBe(list.id);
    expect(card1.boardId).toBe(board.id);
    expect(card2.position).toBeGreaterThan(card1.position);
  });
});

describe('GET /api/v1/cards/:cardId', () => {
  it('returns card detail with labels, members, checklists', async () => {
    const { cookies, board, user } = await setupBoard(app);
    const list = await createList(app, cookies, board.id, 'To Do');
    const card = await createCard(app, cookies, list.id, 'Detailed Card');

    // Assign a label
    const boardRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}`,
    });
    const labelId = boardRes.json().labels[0].id;
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/labels/${labelId}`,
    });

    // Assign a member
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/members/${user.id}`,
    });

    // Get card detail
    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.card.id).toBe(card.id);
    expect(body.card.name).toBe('Detailed Card');

    // Labels
    expect(body.card.labels).toHaveLength(1);
    expect(body.card.labels[0].id).toBe(labelId);

    // Members
    expect(body.card.members).toHaveLength(1);
    expect(body.card.members[0].id).toBe(user.id);

    // Checklists (empty for now)
    expect(body.card.checklists).toBeInstanceOf(Array);

    // Comment count
    expect(body.card.commentCount).toBe(0);
  });
});

describe('PATCH /api/v1/cards/:cardId', () => {
  it('updates card name and description', async () => {
    const { cookies, board } = await setupBoard(app);
    const list = await createList(app, cookies, board.id, 'To Do');
    const card = await createCard(app, cookies, list.id, 'Old Card');

    const res = await injectWithAuth(app, cookies, {
      method: 'PATCH',
      url: `/api/v1/cards/${card.id}`,
      payload: { name: 'Updated Card', description: 'A description' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.card.name).toBe('Updated Card');
    expect(body.card.description).toBe('A description');
  });
});

describe('DELETE /api/v1/cards/:cardId', () => {
  it('deletes card', async () => {
    const { cookies, board } = await setupBoard(app);
    const list = await createList(app, cookies, board.id, 'To Do');
    const card = await createCard(app, cookies, list.id, 'To Delete');

    const res = await injectWithAuth(app, cookies, {
      method: 'DELETE',
      url: `/api/v1/cards/${card.id}`,
    });
    expect(res.statusCode).toBe(204);

    // Verify card is gone
    const getRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});

describe('POST /api/v1/cards/:cardId/move', () => {
  it('moves card between lists', async () => {
    const { cookies, board } = await setupBoard(app);
    const list1 = await createList(app, cookies, board.id, 'Source');
    const list2 = await createList(app, cookies, board.id, 'Target');
    const card = await createCard(app, cookies, list1.id, 'Moving Card');

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/move`,
      payload: { listId: list2.id, position: 65536 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.card.listId).toBe(list2.id);
    expect(body.card.position).toBe(65536);
  });
});

// ── Card Labels ────────────────────────────────────────────────────────────────

describe('POST /api/v1/cards/:cardId/labels/:labelId', () => {
  it('adds label to card', async () => {
    const { cookies, board } = await setupBoard(app);
    const list = await createList(app, cookies, board.id, 'To Do');
    const card = await createCard(app, cookies, list.id, 'Labeled Card');

    const boardRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}`,
    });
    const labelId = boardRes.json().labels[0].id;

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/labels/${labelId}`,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().ok).toBe(true);

    // Verify via card detail
    const cardRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });
    expect(cardRes.json().card.labels).toHaveLength(1);
    expect(cardRes.json().card.labels[0].id).toBe(labelId);
  });
});

describe('DELETE /api/v1/cards/:cardId/labels/:labelId', () => {
  it('removes label from card', async () => {
    const { cookies, board } = await setupBoard(app);
    const list = await createList(app, cookies, board.id, 'To Do');
    const card = await createCard(app, cookies, list.id, 'Labeled Card');

    const boardRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}`,
    });
    const labelId = boardRes.json().labels[0].id;

    // Add then remove
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/labels/${labelId}`,
    });

    const res = await injectWithAuth(app, cookies, {
      method: 'DELETE',
      url: `/api/v1/cards/${card.id}/labels/${labelId}`,
    });
    expect(res.statusCode).toBe(204);

    // Verify label removed
    const cardRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });
    expect(cardRes.json().card.labels).toHaveLength(0);
  });
});

// ── Move All Cards ─────────────────────────────────────────────────────────────

describe('POST /api/v1/lists/:listId/move-all-cards', () => {
  it('moves all cards from one list to another', async () => {
    const { cookies, board } = await setupBoard(app);
    const source = await createList(app, cookies, board.id, 'Source');
    const target = await createList(app, cookies, board.id, 'Target');

    // Create 3 cards in source
    await createCard(app, cookies, source.id, 'Card A');
    await createCard(app, cookies, source.id, 'Card B');
    await createCard(app, cookies, source.id, 'Card C');

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/lists/${source.id}/move-all-cards`,
      payload: { targetListId: target.id },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().moved).toBe(3);

    // Verify cards are now in target list
    const listsRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}/lists`,
    });
    const listsData = listsRes.json().lists;
    const sourceList = listsData.find((l: { id: string }) => l.id === source.id);
    const targetList = listsData.find((l: { id: string }) => l.id === target.id);

    expect(sourceList.cards).toHaveLength(0);
    expect(targetList.cards).toHaveLength(3);
  });
});
