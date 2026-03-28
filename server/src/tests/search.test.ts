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

async function setupBoardWithCards(appInstance: FastifyInstance) {
  const testUser = await createTestUser(appInstance);

  const boardRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: '/api/v1/boards',
    payload: { workspaceId: testUser.workspace.id, name: 'Project Alpha' },
  });
  const board = boardRes.json().board;

  const listRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/lists`,
    payload: { name: 'To Do' },
  });
  const list = listRes.json().list;

  // Card with "design" in the name
  const card1Res = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${list.id}/cards`,
    payload: { name: 'Design the landing page' },
  });
  const cardByName = card1Res.json().card;

  // Card with "design" in the description
  const card2Res = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${list.id}/cards`,
    payload: { name: 'Implement homepage' },
  });
  const cardByDesc = card2Res.json().card;
  await injectWithAuth(appInstance, testUser.cookies, {
    method: 'PATCH',
    url: `/api/v1/cards/${cardByDesc.id}`,
    payload: { description: 'Follow the design mockup carefully' },
  });

  // Card with "design" only in a comment
  const card3Res = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${list.id}/cards`,
    payload: { name: 'Review feedback' },
  });
  const cardByComment = card3Res.json().card;
  await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/cards/${cardByComment.id}/comments`,
    payload: { body: 'The design looks great, approved!' },
  });

  // Card with no match
  const card4Res = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${list.id}/cards`,
    payload: { name: 'Fix broken tests' },
  });
  const cardNoMatch = card4Res.json().card;

  // Get board labels for filter tests
  const boardDetail = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'GET',
    url: `/api/v1/boards/${board.id}`,
  });
  const labels = boardDetail.json().labels;

  return {
    ...testUser,
    board,
    list,
    cardByName,
    cardByDesc,
    cardByComment,
    cardNoMatch,
    labels,
  };
}

async function createSecondWorkspaceAndBoard(appInstance: FastifyInstance) {
  const user2 = await createTestUser(appInstance);

  const boardRes = await injectWithAuth(appInstance, user2.cookies, {
    method: 'POST',
    url: '/api/v1/boards',
    payload: { workspaceId: user2.workspace.id, name: 'Secret Board' },
  });
  const board = boardRes.json().board;

  const listRes = await injectWithAuth(appInstance, user2.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/lists`,
    payload: { name: 'Hidden List' },
  });
  const list = listRes.json().list;

  const cardRes = await injectWithAuth(appInstance, user2.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${list.id}/cards`,
    payload: { name: 'Secret design document' },
  });
  const card = cardRes.json().card;

  return { ...user2, board, list, card };
}

// ── Happy Path ──────────────────────────────────────────────────────────────

describe('GET /api/v1/search', () => {
  describe('Happy path', () => {
    it('returns cards matching by name', async () => {
      const { cookies } = await setupBoardWithCards(app);

      const res = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=design',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results).toBeDefined();
      expect(body.results.length).toBeGreaterThanOrEqual(1);

      const nameMatch = body.results.find(
        (r: any) => r.cardName === 'Design the landing page',
      );
      expect(nameMatch).toBeDefined();
      expect(nameMatch.matchSource).toBe('name');
    });

    it('returns cards matching by description', async () => {
      const { cookies } = await setupBoardWithCards(app);

      const res = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=mockup',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results.length).toBeGreaterThanOrEqual(1);

      const descMatch = body.results.find(
        (r: any) => r.cardName === 'Implement homepage',
      );
      expect(descMatch).toBeDefined();
      expect(descMatch.matchSource).toBe('description');
    });

    it('returns cards matching by comment body', async () => {
      const { cookies } = await setupBoardWithCards(app);

      const res = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=approved',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results.length).toBeGreaterThanOrEqual(1);

      const commentMatch = body.results.find(
        (r: any) => r.cardName === 'Review feedback',
      );
      expect(commentMatch).toBeDefined();
      expect(commentMatch.matchSource).toBe('comment');
    });

    it('results include cardName, listName, boardName, snippet, matchSource', async () => {
      const { cookies } = await setupBoardWithCards(app);

      const res = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=design',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results.length).toBeGreaterThanOrEqual(1);

      const result = body.results[0];
      expect(result).toHaveProperty('cardId');
      expect(result).toHaveProperty('cardName');
      expect(result).toHaveProperty('listId');
      expect(result).toHaveProperty('listName');
      expect(result).toHaveProperty('boardId');
      expect(result).toHaveProperty('boardName');
      expect(result).toHaveProperty('workspaceId');
      expect(result).toHaveProperty('snippet');
      expect(result).toHaveProperty('matchSource');
      expect(result.type).toBe('card');
    });

    it('snippets contain <mark> tags around matching terms', async () => {
      const { cookies } = await setupBoardWithCards(app);

      const res = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=design',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results.length).toBeGreaterThanOrEqual(1);

      const hasMarkTags = body.results.some(
        (r: any) => r.snippet.includes('<mark>') && r.snippet.includes('</mark>'),
      );
      expect(hasMarkTags).toBe(true);
    });

    it('results ordered by relevance (name match ranked higher than description)', async () => {
      const { cookies } = await setupBoardWithCards(app);

      const res = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=design',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Should have at least two results: one name match and one description match
      expect(body.results.length).toBeGreaterThanOrEqual(2);

      // Name match should appear before description match
      const nameIdx = body.results.findIndex((r: any) => r.matchSource === 'name');
      const descIdx = body.results.findIndex((r: any) => r.matchSource === 'description');
      expect(nameIdx).toBeLessThan(descIdx);
    });

    it('matchSource is "name" for card name matches, "description" for description matches, "comment" for comment matches', async () => {
      const { cookies } = await setupBoardWithCards(app);

      // Search for a term in name
      const nameRes = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=landing',
      });
      expect(nameRes.statusCode).toBe(200);
      expect(nameRes.json().results[0].matchSource).toBe('name');

      // Search for a term only in description
      const descRes = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=mockup',
      });
      expect(descRes.statusCode).toBe(200);
      expect(descRes.json().results[0].matchSource).toBe('description');

      // Search for a term only in comments
      const commentRes = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=approved',
      });
      expect(commentRes.statusCode).toBe(200);
      expect(commentRes.json().results[0].matchSource).toBe('comment');
    });
  });

  // ── Filtering ───────────────────────────────────────────────────────────────

  describe('Filtering', () => {
    it('workspaceId param restricts results to that workspace', async () => {
      const setup = await setupBoardWithCards(app);
      // Create a second workspace with a matching card
      const other = await createSecondWorkspaceAndBoard(app);

      // Search with workspaceId restriction — should only return cards from setup's workspace
      const res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: `/api/v1/search?q=design&workspaceId=${setup.workspace.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // All results should be from setup's workspace
      for (const result of body.results) {
        expect(result.workspaceId).toBe(setup.workspace.id);
      }
    });

    it('boardId param restricts results to that board', async () => {
      const setup = await setupBoardWithCards(app);

      // Create a second board in the same workspace
      const board2Res = await injectWithAuth(app, setup.cookies, {
        method: 'POST',
        url: '/api/v1/boards',
        payload: { workspaceId: setup.workspace.id, name: 'Board Two' },
      });
      const board2 = board2Res.json().board;
      const list2Res = await injectWithAuth(app, setup.cookies, {
        method: 'POST',
        url: `/api/v1/boards/${board2.id}/lists`,
        payload: { name: 'Other List' },
      });
      const list2 = list2Res.json().list;
      await injectWithAuth(app, setup.cookies, {
        method: 'POST',
        url: `/api/v1/lists/${list2.id}/cards`,
        payload: { name: 'Another design task' },
      });

      // Search restricted to the first board
      const res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: `/api/v1/search?q=design&boardId=${setup.board.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const result of body.results) {
        expect(result.boardId).toBe(setup.board.id);
      }
    });

    it('labels param returns only cards with ALL specified labels', async () => {
      const setup = await setupBoardWithCards(app);
      const label1 = setup.labels[0];
      const label2 = setup.labels[1];

      // Assign both labels to cardByName
      await injectWithAuth(app, setup.cookies, {
        method: 'POST',
        url: `/api/v1/cards/${setup.cardByName.id}/labels/${label1.id}`,
      });
      await injectWithAuth(app, setup.cookies, {
        method: 'POST',
        url: `/api/v1/cards/${setup.cardByName.id}/labels/${label2.id}`,
      });

      // Assign only label1 to cardByDesc
      await injectWithAuth(app, setup.cookies, {
        method: 'POST',
        url: `/api/v1/cards/${setup.cardByDesc.id}/labels/${label1.id}`,
      });

      // Search with both labels — only cardByName should match
      const res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: `/api/v1/search?q=design&labels=${label1.id},${label2.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results).toHaveLength(1);
      expect(body.results[0].cardId).toBe(setup.cardByName.id);
    });

    it('members param returns only cards assigned to at least ONE specified member', async () => {
      const setup = await setupBoardWithCards(app);

      // Assign user to cardByName only
      await injectWithAuth(app, setup.cookies, {
        method: 'POST',
        url: `/api/v1/cards/${setup.cardByName.id}/members/${setup.user.id}`,
      });

      const res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: `/api/v1/search?q=design&members=${setup.user.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Only cards assigned to user that match "design"
      expect(body.results).toHaveLength(1);
      expect(body.results[0].cardId).toBe(setup.cardByName.id);
    });

    it('combined labels + members filter works (AND)', async () => {
      const setup = await setupBoardWithCards(app);
      const label1 = setup.labels[0];

      // Assign label1 to both cards, but member to only cardByName
      await injectWithAuth(app, setup.cookies, {
        method: 'POST',
        url: `/api/v1/cards/${setup.cardByName.id}/labels/${label1.id}`,
      });
      await injectWithAuth(app, setup.cookies, {
        method: 'POST',
        url: `/api/v1/cards/${setup.cardByDesc.id}/labels/${label1.id}`,
      });
      await injectWithAuth(app, setup.cookies, {
        method: 'POST',
        url: `/api/v1/cards/${setup.cardByName.id}/members/${setup.user.id}`,
      });

      const res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: `/api/v1/search?q=design&labels=${label1.id}&members=${setup.user.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results).toHaveLength(1);
      expect(body.results[0].cardId).toBe(setup.cardByName.id);
    });

    it('combined boardId + labels filter works', async () => {
      const setup = await setupBoardWithCards(app);
      const label1 = setup.labels[0];

      await injectWithAuth(app, setup.cookies, {
        method: 'POST',
        url: `/api/v1/cards/${setup.cardByName.id}/labels/${label1.id}`,
      });

      const res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: `/api/v1/search?q=design&boardId=${setup.board.id}&labels=${label1.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results).toHaveLength(1);
      expect(body.results[0].cardId).toBe(setup.cardByName.id);
      expect(body.results[0].boardId).toBe(setup.board.id);
    });
  });

  // ── Pagination ──────────────────────────────────────────────────────────────

  describe('Pagination', () => {
    it('first request returns nextCursor when more results exist', async () => {
      const setup = await setupBoardWithCards(app);

      // Create enough cards to exceed limit=1
      const res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: '/api/v1/search?q=design&limit=1',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results).toHaveLength(1);
      expect(body.nextCursor).toBeDefined();
      expect(body.nextCursor).not.toBeNull();
    });

    it('passing cursor returns next page', async () => {
      const setup = await setupBoardWithCards(app);

      // First page
      const page1Res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: '/api/v1/search?q=design&limit=1',
      });
      const page1 = page1Res.json();
      expect(page1.nextCursor).toBeDefined();

      // Second page
      const page2Res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: `/api/v1/search?q=design&limit=1&cursor=${page1.nextCursor}`,
      });
      const page2 = page2Res.json();
      expect(page2.results.length).toBeGreaterThanOrEqual(1);

      // Results should be different
      expect(page2.results[0].cardId).not.toBe(page1.results[0].cardId);
    });

    it('last page has nextCursor: null', async () => {
      const setup = await setupBoardWithCards(app);

      // Request with a high limit to get everything in one page
      const res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: '/api/v1/search?q=design&limit=50',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.nextCursor).toBeNull();
    });

    it('custom limit param works', async () => {
      const setup = await setupBoardWithCards(app);

      const res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: '/api/v1/search?q=design&limit=2',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results.length).toBeLessThanOrEqual(2);
    });
  });

  // ── Authorization ───────────────────────────────────────────────────────────

  describe('Authorization', () => {
    it('unauthenticated request returns 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=design',
      });

      expect(res.statusCode).toBe(401);
    });

    it('results never include cards from boards user is not a member of', async () => {
      const setup = await setupBoardWithCards(app);
      const other = await createSecondWorkspaceAndBoard(app);

      // Search as setup's user — should NOT see other's "Secret design document"
      const res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: '/api/v1/search?q=design',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const secretCard = body.results.find(
        (r: any) => r.cardName === 'Secret design document',
      );
      expect(secretCard).toBeUndefined();
    });

    it('workspaceId for non-member workspace returns empty results (not 403)', async () => {
      const setup = await setupBoardWithCards(app);
      const other = await createSecondWorkspaceAndBoard(app);

      // Search as setup's user with other's workspaceId
      const res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: `/api/v1/search?q=design&workspaceId=${other.workspace.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results).toHaveLength(0);
      expect(body.nextCursor).toBeNull();
    });

    it('boardId for non-member board returns empty results (not 403)', async () => {
      const setup = await setupBoardWithCards(app);
      const other = await createSecondWorkspaceAndBoard(app);

      const res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: `/api/v1/search?q=design&boardId=${other.board.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results).toHaveLength(0);
      expect(body.nextCursor).toBeNull();
    });
  });

  // ── Validation / Edge Cases ─────────────────────────────────────────────────

  describe('Validation and edge cases', () => {
    it('empty query returns 400', async () => {
      const { cookies } = await createTestUser(app);

      const res = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=',
      });

      expect(res.statusCode).toBe(400);
    });

    it('missing query param returns 400', async () => {
      const { cookies } = await createTestUser(app);

      const res = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search',
      });

      expect(res.statusCode).toBe(400);
    });

    it('query over 200 chars returns 400', async () => {
      const { cookies } = await createTestUser(app);
      const longQuery = 'a'.repeat(201);

      const res = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: `/api/v1/search?q=${longQuery}`,
      });

      expect(res.statusCode).toBe(400);
    });

    it('invalid UUIDs in labels param returns 400', async () => {
      const { cookies } = await createTestUser(app);

      const res = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=test&labels=not-a-uuid,also-bad',
      });

      expect(res.statusCode).toBe(400);
    });

    it('invalid UUIDs in members param returns 400', async () => {
      const { cookies } = await createTestUser(app);

      const res = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=test&members=not-a-uuid',
      });

      expect(res.statusCode).toBe(400);
    });

    it('invalid cursor returns 400', async () => {
      const { cookies } = await createTestUser(app);

      const res = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=test&cursor=!!!invalid!!!',
      });

      expect(res.statusCode).toBe(400);
    });

    it('no matching results returns empty array with nextCursor: null', async () => {
      const { cookies } = await createTestUser(app);

      const res = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=xyznonexistentterm',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results).toEqual([]);
      expect(body.nextCursor).toBeNull();
    });

    it('query with only stop words returns empty results', async () => {
      const setup = await setupBoardWithCards(app);

      const res = await injectWithAuth(app, setup.cookies, {
        method: 'GET',
        url: '/api/v1/search?q=the+a+an+is',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results).toEqual([]);
      expect(body.nextCursor).toBeNull();
    });
  });

  // ── Additional search source tests (Bug 3) ────────────────────────────────

  describe('Search across additional content types', () => {
    it('search matches card by description content', async () => {
      const { cookies } = await setupBoardWithCards(app);

      // "mockup" only appears in the description of "Implement homepage"
      const res = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: '/api/v1/search?q=mockup',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results.length).toBeGreaterThanOrEqual(1);
      const match = body.results.find(
        (r: any) => r.cardName === 'Implement homepage',
      );
      expect(match).toBeDefined();
      expect(match.matchSource).toBe('description');
    });

    it('search matches card by checklist item name', async () => {
      const testUser = await createTestUser(app);

      const boardRes = await injectWithAuth(app, testUser.cookies, {
        method: 'POST',
        url: '/api/v1/boards',
        payload: { workspaceId: testUser.workspace.id, name: 'Checklist Board' },
      });
      const board = boardRes.json().board;

      const listRes = await injectWithAuth(app, testUser.cookies, {
        method: 'POST',
        url: `/api/v1/boards/${board.id}/lists`,
        payload: { name: 'List' },
      });
      const list = listRes.json().list;

      const cardRes = await injectWithAuth(app, testUser.cookies, {
        method: 'POST',
        url: `/api/v1/lists/${list.id}/cards`,
        payload: { name: 'Sprint tasks' },
      });
      const card = cardRes.json().card;

      // Create a checklist with an item containing unique search term
      const checklistRes = await injectWithAuth(app, testUser.cookies, {
        method: 'POST',
        url: `/api/v1/cards/${card.id}/checklists`,
        payload: { name: 'QA Steps' },
      });
      const checklist = checklistRes.json().checklist;

      await injectWithAuth(app, testUser.cookies, {
        method: 'POST',
        url: `/api/v1/checklists/${checklist.id}/items`,
        payload: { name: 'Verify the xylophone integration works' },
      });

      // Search for a term that only exists in the checklist item
      const searchRes = await injectWithAuth(app, testUser.cookies, {
        method: 'GET',
        url: '/api/v1/search?q=xylophone',
      });

      expect(searchRes.statusCode).toBe(200);
      const body = searchRes.json();
      expect(body.results.length).toBeGreaterThanOrEqual(1);
      const match = body.results.find(
        (r: any) => r.cardName === 'Sprint tasks',
      );
      expect(match).toBeDefined();
      expect(match.matchSource).toBe('checklist');
    });

    it('search matches card by attachment filename', async () => {
      const testUser = await createTestUser(app);

      const boardRes = await injectWithAuth(app, testUser.cookies, {
        method: 'POST',
        url: '/api/v1/boards',
        payload: { workspaceId: testUser.workspace.id, name: 'Attachment Board' },
      });
      const board = boardRes.json().board;

      const listRes = await injectWithAuth(app, testUser.cookies, {
        method: 'POST',
        url: `/api/v1/boards/${board.id}/lists`,
        payload: { name: 'List' },
      });
      const list = listRes.json().list;

      const cardRes = await injectWithAuth(app, testUser.cookies, {
        method: 'POST',
        url: `/api/v1/lists/${list.id}/cards`,
        payload: { name: 'Documentation card' },
      });
      const card = cardRes.json().card;

      // Upload an attachment with a unique filename
      // Use multipart form to upload a file
      const boundary = '----TestBoundary';
      const fileContent = 'test file content';
      const fileName = 'zephyrblueprint-architecture.pdf';
      const multipartBody = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
        'Content-Type: application/pdf',
        '',
        fileContent,
        `--${boundary}--`,
      ].join('\r\n');

      await app.inject({
        method: 'POST',
        url: `/api/v1/cards/${card.id}/attachments`,
        headers: {
          cookie: testUser.cookies,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: multipartBody,
      });

      // Search for a term that only exists in the attachment filename
      const searchRes = await injectWithAuth(app, testUser.cookies, {
        method: 'GET',
        url: '/api/v1/search?q=zephyrblueprint',
      });

      expect(searchRes.statusCode).toBe(200);
      const body = searchRes.json();
      expect(body.results.length).toBeGreaterThanOrEqual(1);
      const match = body.results.find(
        (r: any) => r.cardName === 'Documentation card',
      );
      expect(match).toBeDefined();
      expect(match.matchSource).toBe('attachment');
    });
  });
});
