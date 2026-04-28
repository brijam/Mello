import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { cards } from './cards.js';
import { users } from './users.js';

export const comments = pgTable('comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  cardId: uuid('card_id').references(() => cards.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  body: text('body').notNull(),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
