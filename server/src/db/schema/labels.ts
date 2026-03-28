import { pgTable, uuid, varchar, doublePrecision, primaryKey } from 'drizzle-orm/pg-core';
import { boards } from './boards';
import { cards } from './cards';

export const labels = pgTable('labels', {
  id: uuid('id').defaultRandom().primaryKey(),
  boardId: uuid('board_id').references(() => boards.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }),
  color: varchar('color', { length: 30 }).notNull(),
  position: doublePrecision('position').notNull(),
});

export const cardLabels = pgTable('card_labels', {
  cardId: uuid('card_id').references(() => cards.id, { onDelete: 'cascade' }).notNull(),
  labelId: uuid('label_id').references(() => labels.id, { onDelete: 'cascade' }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.cardId, t.labelId] }),
]);
