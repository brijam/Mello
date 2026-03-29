import { pgTable, uuid, varchar, text, bigint, timestamp } from 'drizzle-orm/pg-core';
import { cards } from './cards';
import { users } from './users';

export const attachments = pgTable('attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  cardId: uuid('card_id').references(() => cards.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  storagePath: text('storage_path').notNull(),
  url: text('url'),
  mimeType: varchar('mime_type', { length: 100 }),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  thumbnailPath: text('thumbnail_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
