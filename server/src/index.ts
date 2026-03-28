import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import authPlugin from './plugins/auth.js';
import socketPlugin from './plugins/socket.js';
import { config } from './config.js';
import { AppError } from './utils/errors.js';

// Route imports
import { authRoutes } from './routes/auth.js';
import { workspaceRoutes } from './routes/workspaces.js';
import { boardRoutes } from './routes/boards.js';
import { listRoutes } from './routes/lists.js';
import { cardRoutes } from './routes/cards.js';
import { checklistRoutes } from './routes/checklists.js';
import { commentRoutes } from './routes/comments.js';
import { attachmentRoutes } from './routes/attachments.js';
import { searchRoutes } from './routes/search.js';
import { notificationRoutes } from './routes/notifications.js';

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
    },
  },
});

// Plugins
await app.register(cors, {
  origin: true,
  credentials: true,
});
await app.register(cookie);
await app.register(multipart, { limits: { fileSize: 26_214_400 } }); // 25MB
await app.register(authPlugin);
await app.register(socketPlugin);

// Error handler
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message },
    });
  }

  // Handle Fastify/plugin errors with statusCode (e.g., multipart file size limit)
  const err = error as any;
  if (err.statusCode && err.statusCode !== 500) {
    return reply.status(err.statusCode).send({
      error: { code: err.code ?? 'ERROR', message: err.message },
    });
  }

  app.log.error(error);
  return reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
});

// Routes
await app.register(authRoutes, { prefix: '/api/v1/auth' });
await app.register(workspaceRoutes, { prefix: '/api/v1/workspaces' });
await app.register(boardRoutes, { prefix: '/api/v1' });
await app.register(listRoutes, { prefix: '/api/v1' });
await app.register(cardRoutes, { prefix: '/api/v1' });
await app.register(checklistRoutes, { prefix: '/api/v1' });
await app.register(commentRoutes, { prefix: '/api/v1' });
await app.register(attachmentRoutes, { prefix: '/api/v1' });
await app.register(searchRoutes, { prefix: '/api/v1' });
await app.register(notificationRoutes, { prefix: '/api/v1' });

// Health check
app.get('/api/health', async () => ({ status: 'ok' }));

// Start
try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`Mello server running on port ${config.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
