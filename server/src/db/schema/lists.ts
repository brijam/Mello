import { pgTable, uuid, varchar, doublePrecision, timestamp, index } from 'drizzle-orm/pg-core';
import { boards } from './boards.js';

export const lists = pgTable('lists', {
  id: uuid('id').defaultRandom().primaryKey(),
  boardId: uuid('board_id').references(() => boards.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  position: doublePrecision('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('lists_board_position_idx').on(t.boardId, t.position),
]);
