import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { nanoid } from 'nanoid';
import * as crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { apiKeys } from '../db/schema/api-keys.js';

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const random = crypto.randomBytes(32).toString('base64url');
  const raw = `mello_sk_${random}`;
  const prefix = raw.slice(0, 16);
  return { raw, prefix, hash: hashApiKey(raw) };
}

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds
const COOKIE_NAME = 'mello_session';

// In-memory session store (swap for Redis in production)
const sessions = new Map<string, { userId: string; expiresAt: number }>();

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(id);
  }
}

// Clean up every 10 minutes
setInterval(cleanExpiredSessions, 10 * 60 * 1000).unref();

declare module 'fastify' {
  interface FastifyRequest {
    userId: string | null;
  }
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('userId', null);

  // Parse session or API key on every request
  fastify.addHook('onRequest', async (request) => {
    // 1. Bearer API key takes precedence (used by dispatcher / external agents)
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const raw = authHeader.slice(7).trim();
      if (raw) {
        const hash = hashApiKey(raw);
        const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash));
        if (key && !key.revokedAt) {
          request.userId = key.userId;
          // Fire-and-forget: update last_used_at (no await to keep request fast)
          db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id))
            .catch(() => { /* best-effort */ });
          return;
        }
      }
    }

    // 2. Cookie session
    const sessionId = request.cookies[COOKIE_NAME];
    if (!sessionId) return;

    const session = sessions.get(sessionId);
    if (session && session.expiresAt > Date.now()) {
      request.userId = session.userId;
      // Refresh TTL on active sessions
      session.expiresAt = Date.now() + SESSION_TTL * 1000;
    } else if (session) {
      sessions.delete(sessionId);
    }
  });

  // Helper to create a session
  fastify.decorate('createSession', async (reply: FastifyReply, userId: string) => {
    const sessionId = nanoid(32);
    sessions.set(sessionId, { userId, expiresAt: Date.now() + SESSION_TTL * 1000 });
    reply.setCookie(COOKIE_NAME, sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.BASE_URL.startsWith('https'),
      maxAge: SESSION_TTL,
    });
  });

  // Helper to destroy a session
  fastify.decorate('destroySession', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.cookies[COOKIE_NAME];
    if (sessionId) {
      sessions.delete(sessionId);
    }
    reply.clearCookie(COOKIE_NAME, { path: '/' });
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    createSession: (reply: FastifyReply, userId: string) => Promise<void>;
    destroySession: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function getSessionUserId(sessionId: string): string | null {
  const session = sessions.get(sessionId);
  if (session && session.expiresAt > Date.now()) {
    return session.userId;
  }
  if (session) {
    sessions.delete(sessionId);
  }
  return null;
}

export const COOKIE_NAME_EXPORT = COOKIE_NAME;

export default fp(authPlugin, { name: 'auth' });
