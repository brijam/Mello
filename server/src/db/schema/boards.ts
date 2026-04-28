import { pgTable, uuid, varchar, text, boolean, doublePrecision, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { workspaces } from './workspaces.js';

export const boards = pgTable('boards', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  backgroundType: varchar('background_type', { length: 20 }).default('color').notNull().$type<'color' | 'image'>(),
  backgroundValue: text('background_value').default('#0079bf').notNull(),
  isTemplate: boolean('is_template').default(false).notNull(),
  position: doublePrecision('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const boardMembers = pgTable('board_members', {
  boardId: uuid('board_id').references(() => boards.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 20 }).notNull().$type<'admin' | 'normal' | 'observer'>(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.boardId, t.userId] }),
]);
