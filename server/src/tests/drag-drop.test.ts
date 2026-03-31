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

// ── Card move position persistence ────────────────────────────────────────────

describe('Card move position persistence', () => {
  it('updates card position within the same list and persists it', async () => {
    const { cookies, board } = await setupBoard(app);
    const list = await createList(app, cookies, board.id, 'To Do');

    const card1 = await createCard(app, cookies, list.id, 'Card 1');
    const card2 = await createCard(app, cookies, list.id, 'Card 2');
    const card3 = await createCard(app, cookies, list.id, 'Card 3');

    // Move card3 to position before card1 (small position value)
    const newPosition = card1.position / 2;
    const moveRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card3.id}/move`,
      payload: { listId: list.id, position: newPosition },
    });

    expect(moveRes.statusCode).toBe(200);
    expect(moveRes.json().card.position).toBe(newPosition);
    expect(moveRes.json().card.listId).toBe(list.id);

    // Fetch the board's lists+cards and verify the card has the new position
    const listsRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}/lists`,
    });

    expect(listsRes.statusCode).toBe(200);
    const listsData = listsRes.json().lists;
    const todoList = listsData.find((l: any) => l.id === list.id);
    expect(todoList.cards).toHaveLength(3);

    // Cards should be ordered by position; card3 should now be first
    const sortedCards = [...todoList.cards].sort((a: any, b: any) => a.position - b.position);
    expect(sortedCards[0].id).toBe(card3.id);
    expect(sortedCards[0].position).toBe(newPosition);
    expect(sortedCards[1].id).toBe(card1.id);
    expect(sortedCards[2].id).toBe(card2.id);
  });

  it('moves a card to a different list and persists listId and position', async () => {
    const { cookies, board } = await setupBoard(app);
    const list1 = await createList(app, cookies, board.id, 'Source');
    const list2 = await createList(app, cookies, board.id, 'Target');

    const card1 = await createCard(app, cookies, list1.id, 'Card A');
    const card2 = await createCard(app, cookies, list1.id, 'Card B');
    const card3 = await createCard(app, cookies, list1.id, 'Card C');

    // Move card2 to list2 with a specific position
    const targetPosition = 32768;
    const moveRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card2.id}/move`,
      payload: { listId: list2.id, position: targetPosition },
    });

    expect(moveRes.statusCode).toBe(200);
    expect(moveRes.json().card.listId).toBe(list2.id);
    expect(moveRes.json().card.position).toBe(targetPosition);

    // Fetch lists and verify persistence
    const listsRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}/lists`,
    });

    const listsData = listsRes.json().lists;
    const sourceList = listsData.find((l: any) => l.id === list1.id);
    const targetList = listsData.find((l: any) => l.id === list2.id);

    // Source should have 2 cards, target should have 1
    expect(sourceList.cards).toHaveLength(2);
    expect(targetList.cards).toHaveLength(1);

    // card2 should be in target list with the correct position
    expect(targetList.cards[0].id).toBe(card2.id);
    expect(targetList.cards[0].position).toBe(targetPosition);

    // card2 should NOT be in source list
    const sourceCardIds = sourceList.cards.map((c: any) => c.id);
    expect(sourceCardIds).not.toContain(card2.id);
  });
});

// ── Board position update persistence ─────────────────────────────────────────

describe('Board position update persistence', () => {
  it('updates board position via PATCH and persists it', async () => {
    const { cookies, workspace } = await createTestUser(app);

    // Create 3 boards
    const boardRes1 = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: workspace.id, name: 'Board A' },
    });
    const board1 = boardRes1.json().board;

    const boardRes2 = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: workspace.id, name: 'Board B' },
    });
    const board2 = boardRes2.json().board;

    const boardRes3 = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: workspace.id, name: 'Board C' },
    });
    const board3 = boardRes3.json().board;

    // Move Board C to the front by giving it the smallest position
    const newPosition = (board1.position ?? 1) / 2;
    const patchRes = await injectWithAuth(app, cookies, {
      method: 'PATCH',
      url: `/api/v1/boards/${board3.id}`,
      payload: { position: newPosition },
    });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().board.position).toBe(newPosition);

    // GET workspace boards and verify the position persisted
    const listRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/boards`,
    });

    expect(listRes.statusCode).toBe(200);
    const boards = listRes.json().boards;
    expect(boards).toHaveLength(3);

    // Find board C in the response and verify its position
    const boardC = boards.find((b: any) => b.id === board3.id);
    expect(boardC).toBeDefined();
    expect(boardC.position).toBe(newPosition);

    // When sorted by position, Board C should now be first
    const sortedBoards = [...boards].sort((a: any, b: any) => a.position - b.position);
    expect(sortedBoards[0].id).toBe(board3.id);
    expect(sortedBoards[0].name).toBe('Board C');
  });
});

// ── Card cross-list move persistence ──────────────────────────────────────────

describe('Card cross-list move persistence', () => {
  it('moves a card from list 1 to list 2 and verifies both lists', async () => {
    const { cookies, board } = await setupBoard(app);
    const list1 = await createList(app, cookies, board.id, 'Backlog');
    const list2 = await createList(app, cookies, board.id, 'In Progress');

    // Create cards in both lists
    const cardA = await createCard(app, cookies, list1.id, 'Task A');
    const cardB = await createCard(app, cookies, list1.id, 'Task B');
    const cardC = await createCard(app, cookies, list2.id, 'Task C');

    // Move cardA from list1 to list2 with a position after cardC
    const movePosition = cardC.position + 65536;
    const moveRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${cardA.id}/move`,
      payload: { listId: list2.id, position: movePosition },
    });

    expect(moveRes.statusCode).toBe(200);
    expect(moveRes.json().card.listId).toBe(list2.id);
    expect(moveRes.json().card.position).toBe(movePosition);

    // Fetch all lists and verify
    const listsRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}/lists`,
    });

    expect(listsRes.statusCode).toBe(200);
    const listsData = listsRes.json().lists;
    const backlog = listsData.find((l: any) => l.id === list1.id);
    const inProgress = listsData.find((l: any) => l.id === list2.id);

    // List 1 should only have cardB now
    expect(backlog.cards).toHaveLength(1);
    expect(backlog.cards[0].id).toBe(cardB.id);

    // List 1 should NOT contain cardA
    const backlogCardIds = backlog.cards.map((c: any) => c.id);
    expect(backlogCardIds).not.toContain(cardA.id);

    // List 2 should have cardC and cardA (2 cards total)
    expect(inProgress.cards).toHaveLength(2);
    const inProgressCardIds = inProgress.cards.map((c: any) => c.id);
    expect(inProgressCardIds).toContain(cardA.id);
    expect(inProgressCardIds).toContain(cardC.id);

    // Verify cardA has the correct position in list2
    const movedCard = inProgress.cards.find((c: any) => c.id === cardA.id);
    expect(movedCard.position).toBe(movePosition);

    // cardA should come after cardC when sorted by position
    const sortedCards = [...inProgress.cards].sort((a: any, b: any) => a.position - b.position);
    expect(sortedCards[0].id).toBe(cardC.id);
    expect(sortedCards[1].id).toBe(cardA.id);
  });

  it('moves a card between lists and verifies via card detail endpoint', async () => {
    const { cookies, board } = await setupBoard(app);
    const list1 = await createList(app, cookies, board.id, 'Todo');
    const list2 = await createList(app, cookies, board.id, 'Done');

    const card = await createCard(app, cookies, list1.id, 'Finish Feature');

    // Move card to list2
    const moveRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/move`,
      payload: { listId: list2.id, position: 65536 },
    });

    expect(moveRes.statusCode).toBe(200);

    // Verify via GET card detail
    const cardRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });

    expect(cardRes.statusCode).toBe(200);
    const cardDetail = cardRes.json().card;
    expect(cardDetail.listId).toBe(list2.id);
    expect(cardDetail.position).toBe(65536);
  });
});
