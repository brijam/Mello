import { pgTable, uuid, varchar, text, boolean, doublePrecision } from 'drizzle-orm/pg-core';
import { cards } from './cards';

export const checklists = pgTable('checklists', {
  id: uuid('id').defaultRandom().primaryKey(),
  cardId: uuid('card_id').references(() => cards.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  position: doublePrecision('position').notNull(),
});

export const checklistItems = pgTable('checklist_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  checklistId: uuid('checklist_id').references(() => checklists.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  checked: boolean('checked').default(false).notNull(),
  position: doublePrecision('position').notNull(),
});
