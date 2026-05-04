import { pgTable, uuid, varchar, text, doublePrecision, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { boards } from './boards.js';
import { lists } from './lists.js';

export const cards = pgTable('cards', {
  id: uuid('id').defaultRandom().primaryKey(),
  listId: uuid('list_id').references(() => lists.id, { onDelete: 'cascade' }).notNull(),
  boardId: uuid('board_id').references(() => boards.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  position: doublePrecision('position').notNull(),
  isTemplate: boolean('is_template').default(false).notNull(),
  coverAttachmentId: uuid('cover_attachment_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('cards_list_position_idx').on(t.listId, t.position),
  index('cards_board_idx').on(t.boardId),
]);
