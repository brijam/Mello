import { pgTable, uuid, varchar, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { boards } from './boards.js';
import { users } from './users.js';

// Per-user board background override. When a row exists for (board, user) it
// takes precedence over the board's default backgroundType/backgroundValue, so
// each member can see the board in whatever color or image they prefer.
export const boardBackgrounds = pgTable('board_backgrounds', {
  boardId: uuid('board_id').references(() => boards.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  backgroundType: varchar('background_type', { length: 20 }).notNull().$type<'color' | 'image'>(),
  backgroundValue: text('background_value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.boardId, t.userId] }),
]);
