import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import authPlugin from '../plugins/auth.js';
import { AppError } from '../utils/errors.js';

import { authRoutes } from '../routes/auth.js';
import { workspaceRoutes } from '../routes/workspaces.js';
import { boardRoutes } from '../routes/boards.js';
import { listRoutes } from '../routes/lists.js';
import { cardRoutes } from '../routes/cards.js';
import { checklistRoutes } from '../routes/checklists.js';
import { commentRoutes } from '../routes/comments.js';

import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

let counter = 0;

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await app.register(authPlugin);

  // Stub Socket.IO for tests — routes call app.io.to(...).emit(...)
  const noopRoom = { emit: () => {} };
  app.decorate('io', { to: () => noopRoom } as any);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
  });

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(workspaceRoutes, { prefix: '/api/v1/workspaces' });
  await app.register(boardRoutes, { prefix: '/api/v1' });
  await app.register(listRoutes, { prefix: '/api/v1' });
  await app.register(cardRoutes, { prefix: '/api/v1' });
  await app.register(checklistRoutes, { prefix: '/api/v1' });
  await app.register(commentRoutes, { prefix: '/api/v1' });

  app.get('/api/health', async () => ({ status: 'ok' }));

  await app.ready();
  return app;
}

interface TestUser {
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    isAdmin: boolean;
    createdAt: string;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  cookies: string;
}

export async function createTestUser(
  app: FastifyInstance,
  overrides: {
    email?: string;
    username?: string;
    password?: string;
    displayName?: string;
  } = {},
): Promise<TestUser> {
  counter++;
  const email = overrides.email ?? `testuser${counter}_${Date.now()}@example.com`;
  const username = overrides.username ?? `testuser${counter}_${Date.now()}`;
  const password = overrides.password ?? 'password123';
  const displayName = overrides.displayName ?? `Test User ${counter}`;

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, username, password, displayName },
  });

  if (res.statusCode !== 201) {
    throw new Error(`Failed to create test user: ${res.statusCode} ${res.body}`);
  }

  const body = res.json();
  const setCookie = res.headers['set-cookie'];
  const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? '');

  return {
    user: body.user,
    workspace: body.workspace,
    cookies: cookieStr,
  };
}

export function injectWithAuth(
  app: FastifyInstance,
  cookies: string,
  opts: {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    url: string;
    payload?: unknown;
  },
) {
  return app.inject({
    method: opts.method,
    url: opts.url,
    payload: opts.payload,
    headers: {
      cookie: cookies,
    },
  });
}

export async function cleanDatabase() {
  await db.execute(sql`TRUNCATE TABLE
    notifications,
    activities,
    comments,
    attachments,
    checklist_items,
    checklists,
    card_assignments,
    card_labels,
    cards,
    labels,
    lists,
    board_members,
    boards,
    workspace_members,
    workspaces,
    users
    CASCADE`);
}

export { db };
