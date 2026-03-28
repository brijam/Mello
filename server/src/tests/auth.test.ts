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

describe('POST /api/v1/auth/register', () => {
  it('creates a user and returns user + workspace with a session cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'alice@example.com',
        username: 'alice',
        password: 'password123',
        displayName: 'Alice',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe('alice@example.com');
    expect(body.user.username).toBe('alice');
    expect(body.user.displayName).toBe('Alice');
    expect(body.user.id).toBeDefined();
    // Password hash should NOT be returned
    expect(body.user.passwordHash).toBeUndefined();

    expect(body.workspace).toBeDefined();
    expect(body.workspace.name).toBe("Alice's Workspace");
    expect(body.workspace.slug).toBe('alice-workspace');

    // Session cookie should be set
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieStr).toContain('mello_session');
  });

  it('rejects duplicate email', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'dupe@example.com',
        username: 'user1',
        password: 'password123',
        displayName: 'User 1',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'dupe@example.com',
        username: 'user2',
        password: 'password123',
        displayName: 'User 2',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error.message).toContain('Email');
  });

  it('rejects duplicate username', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'first@example.com',
        username: 'dupeuser',
        password: 'password123',
        displayName: 'First',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'second@example.com',
        username: 'dupeuser',
        password: 'password123',
        displayName: 'Second',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error.message).toContain('Username');
  });

  it('validates input — rejects short password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'short@example.com',
        username: 'shortpw',
        password: 'short',
        displayName: 'Short',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('validates input — rejects invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'not-an-email',
        username: 'bademail',
        password: 'password123',
        displayName: 'Bad Email',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('first user gets isAdmin=true', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'admin@example.com',
        username: 'adminuser',
        password: 'password123',
        displayName: 'Admin',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().user.isAdmin).toBe(true);

    // Second user should NOT be admin
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'nonadmin@example.com',
        username: 'nonadmin',
        password: 'password123',
        displayName: 'Non Admin',
      },
    });

    expect(res2.statusCode).toBe(201);
    expect(res2.json().user.isAdmin).toBe(false);
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await cleanDatabase();
    // Register a user to login with
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'login@example.com',
        username: 'loginuser',
        password: 'password123',
        displayName: 'Login User',
      },
    });
  });

  it('valid credentials returns user and sets cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'login@example.com',
        password: 'password123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe('login@example.com');
    expect(body.user.passwordHash).toBeUndefined();

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
  });

  it('invalid password returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'login@example.com',
        password: 'wrongpassword',
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('non-existent email returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'nobody@example.com',
        password: 'password123',
      },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns current user with valid session', async () => {
    const { user, cookies } = await createTestUser(app);

    const res = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.id).toBe(user.id);
    expect(body.user.email).toBe(user.email);
  });

  it('returns 401 without session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears session and subsequent /me returns 401', async () => {
    const { cookies } = await createTestUser(app);

    // Logout
    const logoutRes = await injectWithAuth(app, cookies, {
      method: 'POST',
      url: '/api/v1/auth/logout',
    });
    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.json().ok).toBe(true);

    // Verify session is gone — /me should return 401
    const meRes = await injectWithAuth(app, cookies, {
      method: 'GET',
      url: '/api/v1/auth/me',
    });
    expect(meRes.statusCode).toBe(401);
  });
});
