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

describe('POST /api/v1/boards', () => {
  it('creates a board with default labels', async () => {
    const { cookies, workspace } = await createTestUser(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: {
        workspaceId: workspace.id,
        name: 'My Board',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.board).toBeDefined();
    expect(body.board.name).toBe('My Board');
    expect(body.board.workspaceId).toBe(workspace.id);
    expect(body.board.backgroundType).toBe('color');
    expect(body.board.backgroundValue).toBe('#0079bf');

    // Verify default labels were created
    const boardRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${body.board.id}`,
    });
    expect(boardRes.statusCode).toBe(200);
    const boardBody = boardRes.json();
    expect(boardBody.labels).toBeDefined();
    expect(boardBody.labels.length).toBe(6);
  });

  it('requires workspace membership', async () => {
    // Create owner who has a workspace
    const owner = await createTestUser(app);

    // Create a different user who is NOT a member of the owner's workspace
    const outsider = await createTestUser(app);

    const res = await injectWithAuth(app, outsider.cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: {
        workspaceId: owner.workspace.id,
        name: 'Unauthorized Board',
      },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe('GET /api/v1/boards/:boardId', () => {
  it('returns board and labels', async () => {
    const { cookies, workspace } = await createTestUser(app);

    // Create a board first
    const createRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: workspace.id, name: 'Test Board' },
    });
    const boardId = createRes.json().board.id;

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${boardId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.board.id).toBe(boardId);
    expect(body.board.name).toBe('Test Board');
    expect(body.labels).toBeInstanceOf(Array);
    expect(body.labels.length).toBeGreaterThan(0);
    // Check label structure
    expect(body.labels[0]).toHaveProperty('id');
    expect(body.labels[0]).toHaveProperty('color');
    expect(body.labels[0]).toHaveProperty('boardId', boardId);
  });

  it('requires board membership', async () => {
    const owner = await createTestUser(app);
    const outsider = await createTestUser(app);

    const createRes = await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: owner.workspace.id, name: 'Private Board' },
    });
    const boardId = createRes.json().board.id;

    const res = await injectWithAuth(app, outsider.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${boardId}`,
    });

    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /api/v1/boards/:boardId', () => {
  it('updates board name', async () => {
    const { cookies, workspace } = await createTestUser(app);

    const createRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: workspace.id, name: 'Old Name' },
    });
    const boardId = createRes.json().board.id;

    const res = await injectWithAuth(app, cookies, {
      method: 'PATCH',
      url: `/api/v1/boards/${boardId}`,
      payload: { name: 'New Name' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().board.name).toBe('New Name');
  });
});

describe('DELETE /api/v1/boards/:boardId', () => {
  it('deletes board', async () => {
    const { cookies, workspace } = await createTestUser(app);

    const createRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: workspace.id, name: 'To Delete' },
    });
    const boardId = createRes.json().board.id;

    const delRes = await injectWithAuth(app, cookies, {
      method: 'DELETE',
      url: `/api/v1/boards/${boardId}`,
    });
    expect(delRes.statusCode).toBe(204);

    // Verify board is gone
    const getRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${boardId}`,
    });
    // Should be 403 (no membership since board doesn't exist) or 404
    expect([403, 404]).toContain(getRes.statusCode);
  });
});

describe('Board members CRUD', () => {
  it('lists board members', async () => {
    const { cookies, workspace, user } = await createTestUser(app);

    const createRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: workspace.id, name: 'Team Board' },
    });
    const boardId = createRes.json().board.id;

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/boards/${boardId}/members`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.members).toHaveLength(1);
    expect(body.members[0].user.id).toBe(user.id);
    expect(body.members[0].role).toBe('admin');
  });

  it('adds a board member', async () => {
    const owner = await createTestUser(app);
    const newMember = await createTestUser(app);

    const createRes = await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: owner.workspace.id, name: 'Team Board' },
    });
    const boardId = createRes.json().board.id;

    // Add new member
    const addRes = await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${boardId}/members`,
      payload: { userId: newMember.user.id, role: 'normal' },
    });
    expect(addRes.statusCode).toBe(201);

    // Verify member can access the board
    const getRes = await injectWithAuth(app, newMember.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${boardId}`,
    });
    expect(getRes.statusCode).toBe(200);
  });

  it('removes a board member', async () => {
    const owner = await createTestUser(app);
    const member = await createTestUser(app);

    const createRes = await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: owner.workspace.id, name: 'Team Board' },
    });
    const boardId = createRes.json().board.id;

    // Add then remove member
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${boardId}/members`,
      payload: { userId: member.user.id, role: 'normal' },
    });

    const removeRes = await injectWithAuth(app, owner.cookies, {
      method: 'DELETE',
      url: `/api/v1/boards/${boardId}/members/${member.user.id}`,
    });
    expect(removeRes.statusCode).toBe(204);

    // Member should no longer have access
    const getRes = await injectWithAuth(app, member.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${boardId}`,
    });
    expect(getRes.statusCode).toBe(403);
  });

  it('updates a board member role via upsert', async () => {
    const owner = await createTestUser(app);
    const member = await createTestUser(app);

    const createRes = await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: owner.workspace.id, name: 'Team Board' },
    });
    const boardId = createRes.json().board.id;

    // Add member as normal
    await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${boardId}/members`,
      payload: { userId: member.user.id, role: 'normal' },
    });

    // Upsert to admin
    const upsertRes = await injectWithAuth(app, owner.cookies, {
      method: 'POST',
      url: `/api/v1/boards/${boardId}/members`,
      payload: { userId: member.user.id, role: 'admin' },
    });
    expect(upsertRes.statusCode).toBe(201);

    // Verify role changed by checking members list
    const listRes = await injectWithAuth(app, owner.cookies, {
      method: 'GET',
      url: `/api/v1/boards/${boardId}/members`,
    });
    const members = listRes.json().members;
    const updatedMember = members.find((m: { user: { id: string } }) => m.user.id === member.user.id);
    expect(updatedMember.role).toBe('admin');
  });
});
