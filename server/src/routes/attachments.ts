import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { attachments } from '../db/schema/attachments.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFoundError } from '../utils/errors.js';
import { config } from '../config.js';
import { logActivity } from '../utils/activity.js';
import { cards } from '../db/schema/cards.js';
import { broadcast } from '../utils/broadcast.js';
import { WS_EVENTS } from '@mello/shared';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export async function attachmentRoutes(app: FastifyInstance) {
  // Upload attachment
  app.post('/cards/:cardId/attachments', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { cardId } = request.params as { cardId: string };
    const userId = request.userId!;

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: { code: 'NO_FILE', message: 'No file uploaded' } });
    }

    const originalFilename = file.filename;
    // Sanitize filename: remove path separators, replace whitespace with underscores
    const sanitized = originalFilename
      .replace(/[\\/]/g, '')
      .replace(/\s+/g, '_');

    const attachmentId = crypto.randomUUID();
    const dir = path.join(config.STORAGE_PATH, cardId);
    await fs.mkdir(dir, { recursive: true });

    const storageName = `${attachmentId}-${sanitized}`;
    const storagePath = path.join(dir, storageName);

    // Read the file buffer
    const buffer = await file.toBuffer();
    await fs.writeFile(storagePath, buffer);

    const sizeBytes = buffer.length;

    const [attachment] = await db.insert(attachments).values({
      id: attachmentId,
      cardId,
      userId,
      filename: originalFilename,
      storagePath,
      mimeType: file.mimetype,
      sizeBytes,
    }).returning();

    try {
      const [card] = await db.select().from(cards).where(eq(cards.id, cardId));
      if (card) {
        await logActivity({
          cardId,
          boardId: card.boardId,
          userId,
          type: 'attachment_added',
          data: { fileName: originalFilename },
        });
      }
    } catch { /* fire-and-forget */ }

    return reply.status(201).send({ attachment });
  });

  // Download attachment
  app.get('/attachments/:id/download', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [attachment] = await db.select().from(attachments).where(eq(attachments.id, id));
    if (!attachment) {
      throw new NotFoundError('Attachment');
    }

    const fileBuffer = await fs.readFile(attachment.storagePath);
    return reply
      .type(attachment.mimeType ?? 'application/octet-stream')
      .header('content-disposition', `attachment; filename="${attachment.filename}"`)
      .send(fileBuffer);
  });

  // Delete attachment
  app.delete('/attachments/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [attachment] = await db.select().from(attachments).where(eq(attachments.id, id));
    if (!attachment) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
    }

    // Delete file from filesystem (ignore errors if file already gone)
    try {
      await fs.unlink(attachment.storagePath);
    } catch {
      // File may already be deleted
    }

    await db.delete(attachments).where(eq(attachments.id, id));

    // If this attachment was the card's cover, the FK ON DELETE SET NULL clears it.
    // Broadcast the updated card so clients re-render the cover area.
    try {
      const [updatedCard] = await db.select().from(cards).where(eq(cards.id, attachment.cardId));
      if (updatedCard) {
        broadcast(app.io, updatedCard.boardId, WS_EVENTS.CARD_UPDATED, { card: updatedCard });
      }
    } catch { /* fire-and-forget */ }

    try {
      const [card] = await db.select().from(cards).where(eq(cards.id, attachment.cardId));
      if (card) {
        await logActivity({
          cardId: attachment.cardId,
          boardId: card.boardId,
          userId: request.userId!,
          type: 'attachment_removed',
          data: { fileName: attachment.filename },
        });
      }
    } catch { /* fire-and-forget */ }

    return reply.status(204).send();
  });
}
