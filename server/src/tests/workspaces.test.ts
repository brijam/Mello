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

// ── List workspaces ───────────────────────────────────────────────────────────

describe('GET /api/v1/workspaces', () => {
  it('lists workspaces the user belongs to', async () => {
    const { cookies, workspace } = await createTestUser(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: '/api/v1/workspaces',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.workspaces).toHaveLength(1);
    expect(body.workspaces[0].id).toBe(workspace.id);
    expect(body.workspaces[0].name).toBe(workspace.name);
    expect(body.workspaces[0].role).toBe('owner');
  });
});

// ── Create workspace ──────────────────────────────────────────────────────────

describe('POST /api/v1/workspaces', () => {
  it('creates a workspace', async () => {
    const { cookies } = await createTestUser(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/workspaces',
      payload: { name: 'New Workspace' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.workspace).toBeDefined();
    expect(body.workspace.name).toBe('New Workspace');
    expect(body.workspace.slug).toBeDefined();
    expect(body.workspace.id).toBeDefined();
  });

  it('creates workspace and user becomes owner', async () => {
    const { cookies } = await createTestUser(app);

    const createRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/workspaces',
      payload: { name: 'Owned Workspace' },
    });
    const wsId = createRes.json().workspace.id;

    const membersRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/workspaces/${wsId}/members`,
    });

    expect(membersRes.statusCode).toBe(200);
    expect(membersRes.json().members).toHaveLength(1);
    expect(membersRes.json().members[0].role).toBe('owner');
  });
});

// ── Get workspace ─────────────────────────────────────────────────────────────

describe('GET /api/v1/workspaces/:workspaceId', () => {
  it('gets workspace by id', async () => {
    const { cookies, workspace } = await createTestUser(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.workspace.id).toBe(workspace.id);
    expect(body.workspace.name).toBe(workspace.name);
  });

  it('rejects access from non-member', async () => {
    const owner = await createTestUser(app);
    const outsider = await createTestUser(app);

    const res = await injectWithAuth(app, outsider.cookies, {
      method: 'GET',
      url: `/api/v1/workspaces/${owner.workspace.id}`,
    });

    expect(res.statusCode).toBe(403);
  });
});

// ── Update workspace ──────────────────────────────────────────────────────────

describe('PATCH /api/v1/workspaces/:workspaceId', () => {
  it('updates workspace name (owner)', async () => {
    const { cookies, workspace } = await createTestUser(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspace.id}`,
      payload: { name: 'Renamed Workspace' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().workspace.name).toBe('Renamed Workspace');
  });

  it('rejects update from non-owner/admin', async () => {
    const owner = await createTestUser(app);
    const outsider = await createTestUser(app);

    const res = await injectWithAuth(app, outsider.cookies, {
      method: 'PATCH',
      url: `/api/v1/workspaces/${owner.workspace.id}`,
      payload: { name: 'Hacked Name' },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ── Delete workspace ──────────────────────────────────────────────────────────

describe('DELETE /api/v1/workspaces/:workspaceId', () => {
  it('deletes workspace (owner)', async () => {
    const { cookies, workspace } = await createTestUser(app);

    const delRes = await injectWithAuth(app, cookies, {
      method: 'DELETE',
      url: `/api/v1/workspaces/${workspace.id}`,
    });
    expect(delRes.statusCode).toBe(204);

    // Verify workspace is gone — listing should not include it
    const listRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: '/api/v1/workspaces',
    });
    const found = listRes.json().workspaces.find(
      (w: { id: string }) => w.id === workspace.id,
    );
    expect(found).toBeUndefined();
  });

  it('rejects delete from non-owner', async () => {
    const owner = await createTestUser(app);
    const outsider = await createTestUser(app);

    const res = await injectWithAuth(app, outsider.cookies, {
      method: 'DELETE',
      url: `/api/v1/workspaces/${owner.workspace.id}`,
    });

    expect(res.statusCode).toBe(403);
  });
});

// ── Workspace members ─────────────────────────────────────────────────────────

describe('GET /api/v1/workspaces/:workspaceId/members', () => {
  it('lists workspace members with user info', async () => {
    const { cookies, workspace, user } = await createTestUser(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/members`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.members).toHaveLength(1);
    expect(body.members[0].user.id).toBe(user.id);
    expect(body.members[0].user.username).toBe(user.username);
    expect(body.members[0].role).toBe('owner');
    expect(body.members[0].joinedAt).toBeDefined();
  });
});

// ── Workspace boards ──────────────────────────────────────────────────────────

describe('GET /api/v1/workspaces/:workspaceId/boards', () => {
  it('lists boards in a workspace', async () => {
    const { cookies, workspace } = await createTestUser(app);

    // Create two boards
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: workspace.id, name: 'Board 1' },
    });
    await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/boards',
      payload: { workspaceId: workspace.id, name: 'Board 2' },
    });

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/boards`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.boards).toHaveLength(2);
    expect(body.boards.map((b: { name: string }) => b.name)).toContain('Board 1');
    expect(body.boards.map((b: { name: string }) => b.name)).toContain('Board 2');
  });

  it('returns empty array when no boards exist', async () => {
    const { cookies, workspace } = await createTestUser(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.id}/boards`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().boards).toHaveLength(0);
  });
});
