import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { apiKeys } from '../db/schema/api-keys.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { generateApiKey } from '../plugins/auth.js';
import { NotFoundError } from '../utils/errors.js';

const createKeySchema = z.object({
  name: z.string().min(1).max(255),
});

export async function apiKeyRoutes(app: FastifyInstance) {
  // List own keys (excluding revoked, ordered newest first)
  app.get('/api-keys', { preHandler: [requireAuth] }, async (request) => {
    const rows = await db.select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
      revokedAt: apiKeys.revokedAt,
    })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, request.userId!), isNull(apiKeys.revokedAt)))
      .orderBy(desc(apiKeys.createdAt));
    return { keys: rows };
  });

  // Create key — returns raw key ONCE
  app.post('/api-keys', {
    preHandler: [requireAuth, validateBody(createKeySchema)],
  }, async (request, reply) => {
    const { name } = request.body as { name: string };
    const { raw, prefix, hash } = generateApiKey();
    const [key] = await db.insert(apiKeys).values({
      userId: request.userId!,
      name,
      prefix,
      keyHash: hash,
    }).returning({
      id: apiKeys.id,
      userId: apiKeys.userId,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
    });
    return reply.status(201).send({ key, secret: raw });
  });

  // Revoke key
  app.delete('/api-keys/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [existing] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    if (!existing || existing.userId !== request.userId) throw new NotFoundError('API key');
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
    return reply.status(204).send();
  });
}
