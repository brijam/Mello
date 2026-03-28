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

// ── Helpers ─────────────────────────────────────────────────────────────────

async function setupBoardWithLabeledCards(appInstance: FastifyInstance) {
  const testUser = await createTestUser(appInstance);

  // Create board
  const boardRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: '/api/v1/boards',
    payload: { workspaceId: testUser.workspace.id, name: 'Filter Board' },
  });
  const board = boardRes.json().board;

  // Get board labels (boards come with default labels)
  const boardDetail = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'GET',
    url: `/api/v1/boards/${board.id}`,
  });
  const labels = boardDetail.json().labels;
  const label1 = labels[0];
  const label2 = labels[1];

  // Create two lists
  const list1Res = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/lists`,
    payload: { name: 'To Do' },
  });
  const list1 = list1Res.json().list;

  const list2Res = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/lists`,
    payload: { name: 'Done' },
  });
  const list2 = list2Res.json().list;

  // Create cards in list1
  const cardARes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${list1.id}/cards`,
    payload: { name: 'Card A' },
  });
  const cardA = cardARes.json().card;

  const cardBRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${list1.id}/cards`,
    payload: { name: 'Card B' },
  });
  const cardB = cardBRes.json().card;

  // Create card in list2
  const cardCRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${list2.id}/cards`,
    payload: { name: 'Card C' },
  });
  const cardC = cardCRes.json().card;

  // Assign labels:
  // Card A: label1 + label2
  await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/cards/${cardA.id}/labels/${label1.id}`,
  });
  await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/cards/${cardA.id}/labels/${label2.id}`,
  });

  // Card B: label1 only
  await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/cards/${cardB.id}/labels/${label1.id}`,
  });

  // Card C: no labels

  // Create a second user and add them to the board for member filtering
  const user2 = await createTestUser(appInstance);
  // Add user2 to the workspace first, then the board
  await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/workspaces/${testUser.workspace.id}/members`,
    payload: { userId: user2.user.id },
  });
  await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/members`,
    payload: { userId: user2.user.id },
  });

  // Assign members:
  // Card A: testUser
  await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/cards/${cardA.id}/members/${testUser.user.id}`,
  });

  // Card B: user2
  await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/cards/${cardB.id}/members/${user2.user.id}`,
  });

  // Card C: both testUser and user2
  await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/cards/${cardC.id}/members/${testUser.user.id}`,
  });
  await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/cards/${cardC.id}/members/${user2.user.id}`,
  });

  return {
    ...testUser,
    user2,
    board,
    list1,
    list2,
    cardA,
    cardB,
    cardC,
    label1,
    label2,
    labels,
  };
}

function getAllCards(lists: any[]): any[] {
  return lists.flatMap((l: any) => l.cards);
}

function getCardIds(lists: any[]): string[] {
  return getAllCards(lists).map((c: any) => c.id);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/v1/boards/:boardId/lists (with filters)', () => {
  it('no filter params returns all cards (backward compatible)', async () => {
    const setup = await setupBoardWithLabeledCards(app);

    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const allCards = getAllCards(body.lists);
    expect(allCards).toHaveLength(3);
  });

  it('labels=id1 returns only cards with that label', async () => {
    const setup = await setupBoardWithLabeledCards(app);

    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists?labels=${setup.label1.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const cardIds = getCardIds(body.lists);

    // Card A and Card B have label1
    expect(cardIds).toContain(setup.cardA.id);
    expect(cardIds).toContain(setup.cardB.id);
    // Card C does not have label1
    expect(cardIds).not.toContain(setup.cardC.id);
  });

  it('labels=id1,id2 returns only cards with BOTH labels (AND)', async () => {
    const setup = await setupBoardWithLabeledCards(app);

    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists?labels=${setup.label1.id},${setup.label2.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const cardIds = getCardIds(body.lists);

    // Only Card A has both labels
    expect(cardIds).toContain(setup.cardA.id);
    expect(cardIds).not.toContain(setup.cardB.id);
    expect(cardIds).not.toContain(setup.cardC.id);
  });

  it('members=id1 returns only cards assigned to that member', async () => {
    const setup = await setupBoardWithLabeledCards(app);

    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists?members=${setup.user.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const cardIds = getCardIds(body.lists);

    // Card A and Card C are assigned to testUser
    expect(cardIds).toContain(setup.cardA.id);
    expect(cardIds).toContain(setup.cardC.id);
    // Card B is not assigned to testUser
    expect(cardIds).not.toContain(setup.cardB.id);
  });

  it('members=id1,id2 returns cards assigned to EITHER member (OR)', async () => {
    const setup = await setupBoardWithLabeledCards(app);

    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists?members=${setup.user.id},${setup.user2.user.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const cardIds = getCardIds(body.lists);

    // All three cards have at least one of the two users
    expect(cardIds).toContain(setup.cardA.id);
    expect(cardIds).toContain(setup.cardB.id);
    expect(cardIds).toContain(setup.cardC.id);
  });

  it('labels=id1&members=id1 returns cards matching both conditions (AND)', async () => {
    const setup = await setupBoardWithLabeledCards(app);

    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists?labels=${setup.label1.id}&members=${setup.user.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const cardIds = getCardIds(body.lists);

    // Card A has label1 AND is assigned to testUser
    expect(cardIds).toContain(setup.cardA.id);
    // Card B has label1 but is NOT assigned to testUser
    expect(cardIds).not.toContain(setup.cardB.id);
    // Card C is assigned to testUser but does NOT have label1
    expect(cardIds).not.toContain(setup.cardC.id);
  });

  it('lists with no matching cards still returned with empty cards array', async () => {
    const setup = await setupBoardWithLabeledCards(app);

    // Filter by label2 — only Card A has it, which is in list1. List2 should be empty.
    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists?labels=${setup.label2.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.lists).toHaveLength(2);

    const list1Data = body.lists.find((l: any) => l.id === setup.list1.id);
    const list2Data = body.lists.find((l: any) => l.id === setup.list2.id);

    expect(list1Data).toBeDefined();
    expect(list1Data.cards).toHaveLength(1);
    expect(list1Data.cards[0].id).toBe(setup.cardA.id);

    expect(list2Data).toBeDefined();
    expect(list2Data.cards).toHaveLength(0);
  });

  it('non-existent label UUID returns empty cards for all lists', async () => {
    const setup = await setupBoardWithLabeledCards(app);
    const fakeUuid = '00000000-0000-4000-a000-000000000000';

    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists?labels=${fakeUuid}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.lists).toHaveLength(2);
    for (const list of body.lists) {
      expect(list.cards).toHaveLength(0);
    }
  });

  it('non-existent member UUID returns empty cards for all lists', async () => {
    const setup = await setupBoardWithLabeledCards(app);
    const fakeUuid = '00000000-0000-4000-a000-000000000000';

    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists?members=${fakeUuid}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.lists).toHaveLength(2);
    for (const list of body.lists) {
      expect(list.cards).toHaveLength(0);
    }
  });

  it('invalid UUID in labels returns 400', async () => {
    const setup = await setupBoardWithLabeledCards(app);

    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists?labels=not-a-uuid`,
    });

    expect(res.statusCode).toBe(400);
  });

  it('invalid UUID in members returns 400', async () => {
    const setup = await setupBoardWithLabeledCards(app);

    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists?members=not-a-uuid`,
    });

    expect(res.statusCode).toBe(400);
  });

  it('empty labels param treated as no filter', async () => {
    const setup = await setupBoardWithLabeledCards(app);

    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists?labels=`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const allCards = getAllCards(body.lists);
    expect(allCards).toHaveLength(3);
  });

  it('empty members param treated as no filter', async () => {
    const setup = await setupBoardWithLabeledCards(app);

    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists?members=`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const allCards = getAllCards(body.lists);
    expect(allCards).toHaveLength(3);
  });

  it('duplicate UUIDs are handled gracefully', async () => {
    const setup = await setupBoardWithLabeledCards(app);

    // Duplicate label1 in the param
    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists?labels=${setup.label1.id},${setup.label1.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const cardIds = getCardIds(body.lists);

    // Should behave the same as a single label1 — Card A and Card B
    expect(cardIds).toContain(setup.cardA.id);
    expect(cardIds).toContain(setup.cardB.id);
    expect(cardIds).not.toContain(setup.cardC.id);
  });
});

// ── Bug 4: Board detail should return members for filter bar ─────────────────

describe('GET /api/v1/boards/:boardId returns members (Bug 4)', () => {
  it('returns members array alongside board and labels', async () => {
    const setup = await setupBoardWithLabeledCards(app);

    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Board and labels are already returned
    expect(body.board).toBeDefined();
    expect(body.labels).toBeDefined();

    // Members should also be returned so the filter bar can display them
    expect(body.members).toBeDefined();
    expect(body.members).toBeInstanceOf(Array);
    expect(body.members.length).toBeGreaterThanOrEqual(1);

    // Verify member structure includes at least id and displayName
    const ownerMember = body.members.find(
      (m: any) => m.user?.id === setup.user.id || m.id === setup.user.id,
    );
    expect(ownerMember).toBeDefined();
  });

  it('filter by member works end-to-end: assign member to card, filter, verify card appears', async () => {
    const setup = await setupBoardWithLabeledCards(app);

    // Card A is already assigned to setup.user via setupBoardWithLabeledCards
    // Filter for cards assigned to setup.user
    const res = await injectWithAuth(app, setup.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${setup.board.id}/lists?members=${setup.user.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const cardIds = getCardIds(body.lists);

    // Card A and Card C are assigned to testUser in the setup helper
    expect(cardIds).toContain(setup.cardA.id);
    expect(cardIds).toContain(setup.cardC.id);
    // Card B is assigned to user2, not testUser
    expect(cardIds).not.toContain(setup.cardB.id);
  });
});
