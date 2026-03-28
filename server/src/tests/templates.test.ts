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
 * Helper: creates a board, adds lists and labels, then marks it as a template.
 */
async function setupTemplate(appInstance: FastifyInstance) {
  const testUser = await createTestUser(appInstance);

  // Create a board
  const boardRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: '/api/v1/boards',
    payload: { workspaceId: testUser.workspace.id, name: 'Template Board' },
  });
  const board = boardRes.json().board;

  // Add lists
  const list1Res = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/lists`,
    payload: { name: 'To Do' },
  });
  const list1 = list1Res.json().list;

  const list2Res = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/lists`,
    payload: { name: 'In Progress' },
  });
  const list2 = list2Res.json().list;

  const list3Res = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/boards/${board.id}/lists`,
    payload: { name: 'Done' },
  });
  const list3 = list3Res.json().list;

  // Add a card to one of the lists (to verify cards are NOT copied)
  await injectWithAuth(appInstance, testUser.cookies, {
    method: 'POST',
    url: `/api/v1/lists/${list1.id}/cards`,
    payload: { name: 'Template Card' },
  });

  // Mark board as template
  const patchRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'PATCH',
    url: `/api/v1/boards/${board.id}`,
    payload: { isTemplate: true },
  });
  const templateBoard = patchRes.json().board;

  // Get labels (created by default)
  const boardDetailRes = await injectWithAuth(appInstance, testUser.cookies, {
    method: 'GET',
    url: `/api/v1/boards/${board.id}`,
  });
  const labels = boardDetailRes.json().labels;

  return { ...testUser, board: templateBoard, lists: [list1, list2, list3], labels };
}

// ── Template Management ──────────────────────────────────────────────────────

describe('Template management', () => {
  it('PATCH /boards/:boardId with isTemplate=true marks board as template', async () => {
    const { cookies, workspace } = await createTestUser(app);

    const boardRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: workspace.id, name: 'My Board' },
    });
    const board = boardRes.json().board;
    expect(board.isTemplate).toBe(false);

    const patchRes = await injectWithAuth(app, cookies, {
      method: 'PATCH',
      url: `/api/v1/boards/${board.id}`,
      payload: { isTemplate: true },
    });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().board.isTemplate).toBe(true);
  });

  it('PATCH /boards/:boardId with isTemplate=false unmarks a template', async () => {
    const { cookies, board } = await setupTemplate(app);

    expect(board.isTemplate).toBe(true);

    const patchRes = await injectWithAuth(app, cookies, {
      method: 'PATCH',
      url: `/api/v1/boards/${board.id}`,
      payload: { isTemplate: false },
    });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().board.isTemplate).toBe(false);
  });

  it('GET /workspaces/:workspaceId/boards returns template boards with isTemplate flag', async () => {
    const { cookies, workspace, board } = await setupTemplate(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/boards`,
    });

    expect(res.statusCode).toBe(200);
    const boards = res.json().boards;
    const templateBoard = boards.find((b: any) => b.id === board.id);
    expect(templateBoard).toBeDefined();
    expect(templateBoard.isTemplate).toBe(true);
  });
});

// ── Create from Template ─────────────────────────────────────────────────────

describe('POST /api/v1/boards/from-template/:templateId', () => {
  it('creates a new board from a template', async () => {
    const { cookies, workspace, board } = await setupTemplate(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/boards/from-template/${board.id}`,
      payload: { workspaceId: workspace.id, name: 'New Board From Template' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.board).toBeDefined();
    expect(body.board.name).toBe('New Board From Template');
    expect(body.board.isTemplate).toBe(false);
    expect(body.board.workspaceId).toBe(workspace.id);
  });

  it('new board copies all lists from template with same names and positions', async () => {
    const { cookies, workspace, board, lists } = await setupTemplate(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/boards/from-template/${board.id}`,
      payload: { workspaceId: workspace.id, name: 'Copied Board' },
    });

    expect(res.statusCode).toBe(201);
    const newBoardId = res.json().board.id;

    // Fetch the new board's lists
    const boardDetailRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${newBoardId}`,
    });

    const newLists = boardDetailRes.json().lists;
    expect(newLists).toHaveLength(3);

    // Sort by position to compare
    const sortedNewLists = [...newLists].sort((a: any, b: any) => a.position - b.position);
    const sortedOriginalLists = [...lists].sort((a: any, b: any) => a.position - b.position);

    for (let i = 0; i < sortedOriginalLists.length; i++) {
      expect(sortedNewLists[i].name).toBe(sortedOriginalLists[i].name);
      // IDs should be different (new UUIDs)
      expect(sortedNewLists[i].id).not.toBe(sortedOriginalLists[i].id);
    }
  });

  it('new board copies all labels from template with same names and colors', async () => {
    const { cookies, workspace, board, labels } = await setupTemplate(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/boards/from-template/${board.id}`,
      payload: { workspaceId: workspace.id, name: 'Copied Board' },
    });

    expect(res.statusCode).toBe(201);
    const newBoardId = res.json().board.id;

    // Fetch the new board's labels
    const boardDetailRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${newBoardId}`,
    });

    const newLabels = boardDetailRes.json().labels;
    expect(newLabels).toHaveLength(labels.length);

    // Compare colors (order may differ, so sort by color)
    const sortedNewLabels = [...newLabels].sort((a: any, b: any) => a.color.localeCompare(b.color));
    const sortedOriginalLabels = [...labels].sort((a: any, b: any) => a.color.localeCompare(b.color));

    for (let i = 0; i < sortedOriginalLabels.length; i++) {
      expect(sortedNewLabels[i].color).toBe(sortedOriginalLabels[i].color);
      expect(sortedNewLabels[i].name).toBe(sortedOriginalLabels[i].name);
      // IDs should be different
      expect(sortedNewLabels[i].id).not.toBe(sortedOriginalLabels[i].id);
    }
  });

  it('cards are NOT copied from the template', async () => {
    const { cookies, workspace, board } = await setupTemplate(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/boards/from-template/${board.id}`,
      payload: { workspaceId: workspace.id, name: 'Copied Board' },
    });

    expect(res.statusCode).toBe(201);
    const newBoardId = res.json().board.id;

    // Fetch the new board detail — lists should have no cards
    const boardDetailRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${newBoardId}`,
    });

    const body = boardDetailRes.json();
    // Check lists for cards — if the response includes cards nested in lists
    if (body.lists) {
      for (const list of body.lists) {
        if (list.cards) {
          expect(list.cards).toHaveLength(0);
        }
      }
    }
    // Also check top-level cards if present
    if (body.cards) {
      expect(body.cards).toHaveLength(0);
    }
  });

  it('new board uses the provided name, not the template name', async () => {
    const { cookies, workspace, board } = await setupTemplate(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/boards/from-template/${board.id}`,
      payload: { workspaceId: workspace.id, name: 'My Custom Name' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().board.name).toBe('My Custom Name');
    // Not the template name
    expect(res.json().board.name).not.toBe('Template Board');
  });

  it('creator is added as board admin', async () => {
    const { cookies, workspace, board, user } = await setupTemplate(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/boards/from-template/${board.id}`,
      payload: { workspaceId: workspace.id, name: 'New Board' },
    });

    expect(res.statusCode).toBe(201);
    const newBoardId = res.json().board.id;

    // Check board members
    const membersRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${newBoardId}/members`,
    });

    expect(membersRes.statusCode).toBe(200);
    const members = membersRes.json().members;
    expect(members).toHaveLength(1);
    expect(members[0].user.id).toBe(user.id);
    expect(members[0].role).toBe('admin');
  });

  it('template board is unchanged after creating from it', async () => {
    const { cookies, workspace, board, lists, labels } = await setupTemplate(app);

    // Create a board from template
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/boards/from-template/${board.id}`,
      payload: { workspaceId: workspace.id, name: 'New Board' },
    });

    // Verify the template board is unchanged
    const templateRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${board.id}`,
    });

    expect(templateRes.statusCode).toBe(200);
    const templateBody = templateRes.json();
    expect(templateBody.board.name).toBe('Template Board');
    expect(templateBody.board.isTemplate).toBe(true);
    expect(templateBody.labels).toHaveLength(labels.length);
    expect(templateBody.lists).toHaveLength(lists.length);
  });

  it('copies background settings from the template', async () => {
    const { cookies, workspace, board } = await setupTemplate(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/boards/from-template/${board.id}`,
      payload: { workspaceId: workspace.id, name: 'New Board' },
    });

    expect(res.statusCode).toBe(201);
    const newBoard = res.json().board;
    expect(newBoard.backgroundType).toBe(board.backgroundType);
    expect(newBoard.backgroundValue).toBe(board.backgroundValue);
  });

  it('returns 404 for non-existent template', async () => {
    const { cookies, workspace } = await createTestUser(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards/from-template/00000000-0000-0000-0000-000000000000',
      payload: { workspaceId: workspace.id, name: 'New Board' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for non-template board (isTemplate=false)', async () => {
    const { cookies, workspace } = await createTestUser(app);

    // Create a regular board (not a template)
    const boardRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: workspace.id, name: 'Regular Board' },
    });
    const regularBoard = boardRes.json().board;
    expect(regularBoard.isTemplate).toBe(false);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/boards/from-template/${regularBoard.id}`,
      payload: { workspaceId: workspace.id, name: 'New Board' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/boards/from-template/00000000-0000-0000-0000-000000000000',
      payload: { workspaceId: '00000000-0000-0000-0000-000000000000', name: 'Test' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('requires workspace membership (403 for non-member)', async () => {
    const owner = await setupTemplate(app);
    const outsider = await createTestUser(app);

    const res = await injectWithAuth(app, outsider.cookies, {
      method: 'POST',
      url: `/api/v1/boards/from-template/${owner.board.id}`,
      payload: { workspaceId: owner.workspace.id, name: 'Outsider Board' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when name is empty', async () => {
    const { cookies, workspace, board } = await setupTemplate(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/boards/from-template/${board.id}`,
      payload: { workspaceId: workspace.id, name: '' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('template with no lists creates board with no lists', async () => {
    const { cookies, workspace } = await createTestUser(app);

    // Create a board with no lists and mark as template
    const boardRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: workspace.id, name: 'Empty Template' },
    });
    const board = boardRes.json().board;

    await injectWithAuth(app, cookies, {
      method: 'PATCH',
      url: `/api/v1/boards/${board.id}`,
      payload: { isTemplate: true },
    });

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: `/api/v1/boards/from-template/${board.id}`,
      payload: { workspaceId: workspace.id, name: 'From Empty Template' },
    });

    expect(res.statusCode).toBe(201);

    // Verify no lists
    const boardDetailRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${res.json().board.id}`,
    });

    if (boardDetailRes.json().lists) {
      expect(boardDetailRes.json().lists).toHaveLength(0);
    }
  });
});
