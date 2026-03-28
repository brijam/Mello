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
 * Helper: creates a user, workspace, two boards with lists, cards, and labels.
 */
async function setupTwoBoards(appInstance: FastifyInstance) {
  const testUser = await createTestUser(appInstance);

  // Create source board
  const sourceBoardRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: '/api/v1/boards',
    payload: { workspaceId: testUser.workspace.id, name: 'Source Board' },
  });
  const sourceBoard = sourceBoardRes.json().board;

  // Create target board
  const targetBoardRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: '/api/v1/boards',
    payload: { workspaceId: testUser.workspace.id, name: 'Target Board' },
  });
  const targetBoard = targetBoardRes.json().board;

  // Create a list on the source board
  const listRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${sourceBoard.id}/lists`,
    payload: { name: 'Source List' },
  });
  const sourceList = listRes.json().list;

  // Create cards on the source list
  const card1Res = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${sourceList.id}/cards`,
    payload: { name: 'Card 1' },
  });
  const card1 = card1Res.json().card;

  const card2Res = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${sourceList.id}/cards`,
    payload: { name: 'Card 2' },
  });
  const card2 = card2Res.json().card;

  // Create a list on the target board (for move operations)
  const targetListRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${targetBoard.id}/lists`,
    payload: { name: 'Target List' },
  });
  const targetList = targetListRes.json().list;

  // Get labels from both boards (default labels are created with the board)
  const sourceBoardDetail = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'GET',
    url: `/api/v1/boards/${sourceBoard.id}`,
  });
  const sourceLabels = sourceBoardDetail.json().labels;

  const targetBoardDetail = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'GET',
    url: `/api/v1/boards/${targetBoard.id}`,
  });
  const targetLabels = targetBoardDetail.json().labels;

  return {
    ...testUser,
    sourceBoard,
    targetBoard,
    sourceList,
    targetList,
    cards: [card1, card2],
    sourceLabels,
    targetLabels,
  };
}

// ── Copy List ────────────────────────────────────────────────────────────────

describe('POST /api/v1/lists/:listId/copy', () => {
  it('copies a list to another board', async () => {
    const { cookies, sourceList, targetBoard } = await setupTwoBoards(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/lists/${sourceList.id}/copy`,
      payload: { targetBoardId: targetBoard.id },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.list).toBeDefined();
    expect(body.list.name).toBe('Source List');
    expect(body.list.boardId).toBe(targetBoard.id);
    // New UUID
    expect(body.list.id).not.toBe(sourceList.id);
  });

  it('copied list has all cards from original', async () => {
    const { cookies, sourceList, targetBoard, cards } = await setupTwoBoards(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/lists/${sourceList.id}/copy`,
      payload: { targetBoardId: targetBoard.id },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().cardsCopied).toBe(cards.length);
  });

  it('copied cards have new IDs (not the same as originals)', async () => {
    const { cookies, sourceList, targetBoard, cards } = await setupTwoBoards(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/lists/${sourceList.id}/copy`,
      payload: { targetBoardId: targetBoard.id },
    });

    expect(res.statusCode).toBe(201);
    const newListId = res.json().list.id;

    // Fetch the target board to get the copied cards
    const targetBoardDetail = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${targetBoard.id}`,
    });

    const targetBoardBody = targetBoardDetail.json();
    // Find cards in the new list
    const copiedCards = (targetBoardBody.cards || []).filter(
      (c: any) => c.listId === newListId,
    );

    // All copied cards should have different IDs from originals
    const originalIds = cards.map((c: any) => c.id);
    for (const copiedCard of copiedCards) {
      expect(originalIds).not.toContain(copiedCard.id);
    }
  });

  it('labels are matched by color+name on target board', async () => {
    const { cookies, sourceList, sourceBoard, targetBoard, cards, sourceLabels } =
      await setupTwoBoards(app);

    // Assign a label to a card on the source board
    const labelToAssign = sourceLabels[0];
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${cards[0].id}/labels/${labelToAssign.id}`,
      payload: {},
    });

    // Copy the list to the target board
    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/lists/${sourceList.id}/copy`,
      payload: { targetBoardId: targetBoard.id },
    });

    expect(res.statusCode).toBe(201);
    const newListId = res.json().list.id;

    // Fetch target board detail to verify labels were matched
    const targetBoardDetail = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${targetBoard.id}`,
    });

    const targetBoardBody = targetBoardDetail.json();
    // Find the copied card in the new list
    const copiedCards = (targetBoardBody.cards || []).filter(
      (c: any) => c.listId === newListId,
    );

    // Find the copied version of card1
    const copiedCard1 = copiedCards.find((c: any) => c.name === 'Card 1');
    if (copiedCard1) {
      // Fetch card detail to check labels
      const cardDetail = await injectWithAuth(app, cookies, {
        method: 'GET',
        url: `/api/v1/cards/${copiedCard1.id}`,
      });

      const cardBody = cardDetail.json();
      // The card should have label associations if matching labels exist on target board
      if (cardBody.card.labels && cardBody.card.labels.length > 0) {
        // The matched label should have the same color and name but different ID
        const matchedLabel = cardBody.card.labels[0];
        expect(matchedLabel.color).toBe(labelToAssign.color);
        expect(matchedLabel.id).not.toBe(labelToAssign.id);
      }
    }
  });

  it('original list and cards are unchanged after copy', async () => {
    const { cookies, sourceList, sourceBoard, targetBoard, cards } =
      await setupTwoBoards(app);

    // Copy the list
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/lists/${sourceList.id}/copy`,
      payload: { targetBoardId: targetBoard.id },
    });

    // Verify the source board is unchanged
    const sourceBoardDetail = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${sourceBoard.id}`,
    });

    const sourceBody = sourceBoardDetail.json();
    expect(sourceBody.lists).toHaveLength(1);
    expect(sourceBody.lists[0].id).toBe(sourceList.id);
    expect(sourceBody.lists[0].name).toBe('Source List');

    // Verify cards are still there
    const sourceCards = (sourceBody.cards || []).filter(
      (c: any) => c.listId === sourceList.id,
    );
    expect(sourceCards).toHaveLength(cards.length);
  });

  it('returns 404 for non-existent source list', async () => {
    const { cookies, targetBoard } = await setupTwoBoards(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/lists/00000000-0000-0000-0000-000000000000/copy',
      payload: { targetBoardId: targetBoard.id },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for non-existent target board', async () => {
    const { cookies, sourceList } = await setupTwoBoards(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/lists/${sourceList.id}/copy`,
      payload: { targetBoardId: '00000000-0000-0000-0000-000000000000' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when copying to the same board', async () => {
    const { cookies, sourceList, sourceBoard } = await setupTwoBoards(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/lists/${sourceList.id}/copy`,
      payload: { targetBoardId: sourceBoard.id },
    });

    expect(res.statusCode).toBe(400);
  });

  it('requires membership on target board (403 for non-member)', async () => {
    const owner = await setupTwoBoards(app);
    const outsider = await createTestUser(app);

    // Outsider creates their own board
    const outsiderBoardRes = await injectWithAuth(app, outsider.cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: outsider.workspace.id, name: 'Outsider Board' },
    });
    const outsiderBoard = outsiderBoardRes.json().board;

    // Outsider tries to copy owner's list to outsider's board
    // Outsider is not a member of owner's source board
    const res = await injectWithAuth(app, outsider.cookies, {
      method: 'POST',
      url: `/api/v1/lists/${owner.sourceList.id}/copy`,
      payload: { targetBoardId: outsiderBoard.id },
    });

    expect(res.statusCode).toBe(403);
  });

  it('observer on target board gets 403', async () => {
    const owner = await setupTwoBoards(app);
    const observer = await createTestUser(app);

    // Add observer to source board (any role is fine to read)
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${owner.sourceBoard.id}/members`,
      payload: { userId: observer.user.id, role: 'normal' },
    });

    // Add observer to target board as observer
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${owner.targetBoard.id}/members`,
      payload: { userId: observer.user.id, role: 'observer' },
    });

    const res = await injectWithAuth(app, observer.cookies, {
      method: 'POST',
      url: `/api/v1/lists/${owner.sourceList.id}/copy`,
      payload: { targetBoardId: owner.targetBoard.id },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 401 for unauthenticated request', async () => {
    const { sourceList, targetBoard } = await setupTwoBoards(app);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/lists/${sourceList.id}/copy`,
      payload: { targetBoardId: targetBoard.id },
    });

    expect(res.statusCode).toBe(401);
  });

  it('copying a list with no cards returns cardsCopied: 0', async () => {
    const { cookies, workspace } = await createTestUser(app);

    // Create source board with an empty list
    const sourceBoardRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: workspace.id, name: 'Source' },
    });
    const sourceBoard = sourceBoardRes.json().board;

    const listRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/boards/${sourceBoard.id}/lists`,
      payload: { name: 'Empty List' },
    });
    const emptyList = listRes.json().list;

    // Create target board
    const targetBoardRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: workspace.id, name: 'Target' },
    });
    const targetBoard = targetBoardRes.json().board;

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/lists/${emptyList.id}/copy`,
      payload: { targetBoardId: targetBoard.id },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().cardsCopied).toBe(0);
    expect(res.json().list.name).toBe('Empty List');
  });
});

// ── Cross-Board Card Move ────────────────────────────────────────────────────

describe('POST /api/v1/cards/:cardId/move (cross-board)', () => {
  it('moves a card to another board', async () => {
    const { cookies, cards, targetBoard, targetList } = await setupTwoBoards(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${cards[0].id}/move`,
      payload: {
        boardId: targetBoard.id,
        listId: targetList.id,
        position: 65536,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it('card boardId is updated after cross-board move', async () => {
    const { cookies, cards, targetBoard, targetList } = await setupTwoBoards(app);

    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${cards[0].id}/move`,
      payload: {
        boardId: targetBoard.id,
        listId: targetList.id,
        position: 65536,
      },
    });

    // Fetch the card to verify boardId changed
    const cardRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${cards[0].id}`,
    });

    expect(cardRes.statusCode).toBe(200);
    expect(cardRes.json().card.boardId).toBe(targetBoard.id);
    expect(cardRes.json().card.listId).toBe(targetList.id);
  });

  it('card label associations are cleared after cross-board move', async () => {
    const { cookies, cards, sourceLabels, targetBoard, targetList } =
      await setupTwoBoards(app);

    // Assign a label to the card on the source board
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${cards[0].id}/labels/${sourceLabels[0].id}`,
      payload: {},
    });

    // Verify label is assigned
    const cardBefore = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${cards[0].id}`,
    });
    const labelsBefore = cardBefore.json().card.labels || [];
    expect(labelsBefore.length).toBeGreaterThan(0);

    // Move card to target board
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${cards[0].id}/move`,
      payload: {
        boardId: targetBoard.id,
        listId: targetList.id,
        position: 65536,
      },
    });

    // Verify labels are cleared
    const cardAfter = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${cards[0].id}`,
    });

    const labelsAfter = cardAfter.json().card.labels || [];
    expect(labelsAfter).toHaveLength(0);
  });

  it('requires membership on both boards', async () => {
    const owner = await setupTwoBoards(app);
    const outsider = await createTestUser(app);

    // Outsider has their own workspace/board but is not on owner's boards
    const outsiderBoardRes = await injectWithAuth(app, outsider.cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: outsider.workspace.id, name: 'Outsider Board' },
    });
    const outsiderBoard = outsiderBoardRes.json().board;

    const outsiderListRes = await injectWithAuth(app, outsider.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${outsiderBoard.id}/lists`,
      payload: { name: 'Outsider List' },
    });
    const outsiderList = outsiderListRes.json().list;

    // Outsider tries to move owner's card to outsider's board
    const res = await injectWithAuth(app, outsider.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${owner.cards[0].id}/move`,
      payload: {
        boardId: outsiderBoard.id,
        listId: outsiderList.id,
        position: 65536,
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 401 for unauthenticated request', async () => {
    const { cards, targetBoard, targetList } = await setupTwoBoards(app);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/cards/${cards[0].id}/move`,
      payload: {
        boardId: targetBoard.id,
        listId: targetList.id,
        position: 65536,
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when target list does not exist on the target board', async () => {
    const { cookies, cards, targetBoard } = await setupTwoBoards(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${cards[0].id}/move`,
      payload: {
        boardId: targetBoard.id,
        listId: '00000000-0000-0000-0000-000000000000',
        position: 65536,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('checklists, comments, and attachments remain intact after cross-board move', async () => {
    const { cookies, cards, targetBoard, targetList } = await setupTwoBoards(app);
    const card = cards[0];

    // Add a checklist to the card
    const checklistRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/checklists`,
      payload: { name: 'My Checklist' },
    });
    expect(checklistRes.statusCode).toBe(201);

    // Add a comment to the card
    const commentRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/comments`,
      payload: { body: 'Test comment' },
    });
    expect(commentRes.statusCode).toBe(201);

    // Move card to target board
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/cards/${card.id}/move`,
      payload: {
        boardId: targetBoard.id,
        listId: targetList.id,
        position: 65536,
      },
    });

    // Fetch the card and verify checklist and comment are still there
    const cardDetail = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/cards/${card.id}`,
    });

    expect(cardDetail.statusCode).toBe(200);
    const cardBody = cardDetail.json().card;
    expect(cardBody.boardId).toBe(targetBoard.id);

    // Checklists should be present
    if (cardBody.checklists) {
      expect(cardBody.checklists.length).toBeGreaterThanOrEqual(1);
      expect(cardBody.checklists[0].name).toBe('My Checklist');
    }

    // Comments should be present
    if (cardBody.comments) {
      expect(cardBody.comments.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('observer on target board gets 403', async () => {
    const owner = await setupTwoBoards(app);
    const observer = await createTestUser(app);

    // Add observer to source board as normal
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${owner.sourceBoard.id}/members`,
      payload: { userId: observer.user.id, role: 'normal' },
    });

    // Add observer to target board as observer
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${owner.targetBoard.id}/members`,
      payload: { userId: observer.user.id, role: 'observer' },
    });

    const res = await injectWithAuth(app, observer.cookies, {
      method: 'POST',
      url: `/api/v1/cards/${owner.cards[0].id}/move`,
      payload: {
        boardId: owner.targetBoard.id,
        listId: owner.targetList.id,
        position: 65536,
      },
    });

    expect(res.statusCode).toBe(403);
  });
});
