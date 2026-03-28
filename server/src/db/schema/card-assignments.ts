import { pgTable, uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { cards } from './cards';
import { users } from './users';

export const cardAssignments = pgTable('card_assignments', {
  cardId: uuid('card_id').references(() => cards.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.cardId, t.userId] }),
]);
