import { pgTable, uuid, varchar, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { lists } from './lists.js';
import { users } from './users.js';

// Per-user list color override. When a row exists for (list, user) it takes
// precedence over the list's default color, so each member can color the same
// list however they like.
export const listColors = pgTable('list_colors', {
  listId: uuid('list_id').references(() => lists.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  color: varchar('color', { length: 20 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.listId, t.userId] }),
]);
