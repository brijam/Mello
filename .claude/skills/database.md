# Database

## ORM & Tooling

- **Drizzle ORM** (`drizzle-orm` v0.39) with the `postgres` driver
- **Drizzle Kit** for migrations: config in `server/drizzle.config.ts`
- Schema source: `server/src/db/schema/index.ts`
- Migrations output: `server/src/db/migrations/`

Generate migrations: `cd server && npx drizzle-kit generate`
Run migrations: `make migrate` (or `cd server && npx drizzle-kit migrate`)

## Database Connection

`server/src/db/index.ts` creates the connection using `DATABASE_URL` env var.
Default: `postgresql://mello:changeme@localhost:5432/mello`

## Schema Files

All in `server/src/db/schema/`:

| File | Tables | Key Details |
|------|--------|------------|
| `users.ts` | `users` | UUID PK, email (unique), username (unique), password hash, avatarUrl, isAdmin, timestamps |
| `workspaces.ts` | `workspaces`, `workspace_members` | UUID PK, name, slug (unique); members junction with role (owner/admin/member) |
| `boards.ts` | `boards`, `board_members` | UUID PK, workspaceId FK, name, background, isTemplate; members junction with role (admin/normal/observer) |
| `lists.ts` | `lists` | UUID PK, boardId FK, name, position (float for ordering) |
| `cards.ts` | `cards` | UUID PK, listId FK, boardId FK, name, description, position (float), search_vector (tsvector) |
| `labels.ts` | `labels`, `card_labels` | Board-scoped labels with color/name; junction to cards |
| `card-assignments.ts` | `card_assignments` | Junction: userId + cardId |
| `checklists.ts` | `checklists`, `checklist_items` | Checklists with items; items have isChecked boolean, position float |
| `attachments.ts` | `attachments` | cardId FK, filename, path, mimeType, size, thumbnailPath |
| `comments.ts` | `comments` | cardId FK, userId FK, body text, search_vector (tsvector) |
| `activities.ts` | `activities` | cardId FK, boardId FK, userId FK, type string, data (JSON) |
| `notifications.ts` | `notifications` | userId FK, type, data (JSON), isRead boolean |

## Key Design Patterns

### UUID Primary Keys
All tables use `uuid('id').defaultRandom().primaryKey()` (Postgres `gen_random_uuid()`).

### Fractional Positioning
Lists and cards use `real('position')` for ordering. The gap constant is 65536.
- New items: `lastPosition + 65536`
- Reorder between two items: `(before + after) / 2`
- Renumber when needed: positions at multiples of 65536
- Implementation: `server/src/utils/position.ts` (`getNextPosition`, `getMiddlePosition`, `renumberPositions`)

### Full-Text Search (tsvector)
Cards and comments have `tsvector` columns with Postgres triggers that auto-update on INSERT/UPDATE:
- Cards: weight A for name, weight B for description
- Comments: unweighted on body
- Triggers are defined in migrations and recreated in test globalSetup

### Timestamps
All entities have `timestamp('created_at').defaultNow()`. Most also have `updated_at`.

### Cascade Deletes
Foreign keys use `onDelete: 'cascade'` where appropriate (e.g., deleting a board cascades to lists, cards, labels, etc.).

## Querying Patterns

Routes use Drizzle's query builder directly:
```typescript
import { db } from '../db/index.js';
import { cards } from '../db/schema/cards.js';
import { eq, and } from 'drizzle-orm';

const [card] = await db.select().from(cards).where(eq(cards.id, cardId));
await db.insert(cards).values({ ... }).returning();
await db.update(cards).set({ ... }).where(eq(cards.id, cardId));
await db.delete(cards).where(eq(cards.id, cardId));
```
