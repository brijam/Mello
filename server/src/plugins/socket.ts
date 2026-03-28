import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import { eq, and } from 'drizzle-orm';
import { parse as parseCookie } from 'cookie';
import { getSessionUserId, COOKIE_NAME_EXPORT } from './auth.js';
import { db } from '../db/index.js';
import { boardMembers } from '../db/schema/boards.js';
import { WS_EVENTS } from '@mello/shared';

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}

async function socketPlugin(fastify: FastifyInstance) {
  const io = new Server(fastify.server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  fastify.decorate('io', io);

  // Authenticate socket connections via session cookie
  io.use((socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) {
      return next(new Error('Authentication required'));
    }

    const cookies = parseCookie(cookieHeader);
    const sessionId = cookies[COOKIE_NAME_EXPORT];
    if (!sessionId) {
      return next(new Error('Authentication required'));
    }

    const userId = getSessionUserId(sessionId);
    if (!userId) {
      return next(new Error('Invalid session'));
    }

    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    fastify.log.info(`Socket connected: ${socket.id} (user: ${userId})`);

    socket.on(WS_EVENTS.JOIN_BOARD, async (boardId: string) => {
      // Verify user has access to this board
      const [member] = await db
        .select()
        .from(boardMembers)
        .where(
          and(
            eq(boardMembers.boardId, boardId),
            eq(boardMembers.userId, userId),
          ),
        );

      if (!member) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      await socket.join(`board:${boardId}`);
      fastify.log.info(`User ${userId} joined board:${boardId}`);
    });

    socket.on(WS_EVENTS.LEAVE_BOARD, async (boardId: string) => {
      await socket.leave(`board:${boardId}`);
      fastify.log.info(`User ${userId} left board:${boardId}`);
    });

    socket.on('disconnect', () => {
      fastify.log.info(`Socket disconnected: ${socket.id}`);
    });
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    io.close();
  });
}

export default fp(socketPlugin, {
  name: 'socket',
  dependencies: ['auth'],
});
