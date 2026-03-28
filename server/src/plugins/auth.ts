import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { nanoid } from 'nanoid';
import { config } from '../config.js';

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

  // Parse session on every request
  fastify.addHook('onRequest', async (request) => {
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
