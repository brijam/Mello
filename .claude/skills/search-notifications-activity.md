# Search, Notifications & Activity

Cross-cutting features that span multiple domain entities.

## Full-Text Search

### Implementation
PostgreSQL `tsvector` with triggers (no application-level indexing):
- **Cards**: `search_vector` column, weighted — name is weight A, description is weight B
- **Comments**: `search_vector` column, unweighted on body
- Triggers auto-update vectors on INSERT/UPDATE (defined in migrations, replicated in test globalSetup)

### Route
`server/src/routes/search.ts`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/search` | Full-text search across cards and comments |

Query parameters:
- `q` — search query (required)
- `workspaceId` — filter by workspace
- `boardId` — filter by board
- `labelIds` — filter by labels
- `memberIds` — filter by assigned members
- `cursor` — pagination cursor
- `limit` — results per page

Returns search results with highlighted snippets using PostgreSQL `ts_headline`.

### Client
`client/src/stores/searchStore.ts` — Zustand store for search state (query, results, loading).
`client/src/components/search/SearchBar.tsx` — global search UI with results dropdown.

## Notifications

### Schema
`server/src/db/schema/notifications.ts` — `notifications` table.
- Fields: id, userId, type, data (JSON), isRead (boolean), createdAt

### Creation
`server/src/utils/notifications.ts`:
- `createNotification(userId, type, data)` — inserts a notification record
- `parseMentions(text)` — extracts `@username` patterns from text, returns array of usernames

Notifications are created when:
- A user is @mentioned in a comment
- A user is assigned to a card
- Other relevant actions (depends on route logic)

### Routes
`server/src/routes/notifications.ts`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications` | List notifications for current user |
| PATCH | `/notifications/:id/read` | Mark notification as read |

### Real-Time Delivery
After creating a notification, the server emits `WS_EVENTS.NOTIFICATION` to the user's socket(s).

### Client
`client/src/stores/notificationStore.ts` — Zustand store for notifications (list, unread count, mark as read).
`client/src/components/notifications/NotificationBell.tsx` — bell icon with unread count badge.

## Activity Feed

### Schema
`server/src/db/schema/activities.ts` — `activities` table.
- Fields: id, cardId, boardId, userId, type (string), data (JSON), createdAt

### Logging
`server/src/utils/activity.ts`:
```typescript
logActivity({ cardId, boardId, userId, type, data })
```

Called from route handlers after mutations. Activity types include:
- Card: created, updated, moved, archived
- Comment: added, edited, deleted
- Checklist: created, deleted, item checked/unchecked
- Attachment: uploaded, deleted
- Member: assigned, unassigned

### Route
`server/src/routes/activities.ts`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cards/:cardId/activities` | List activities for a card (with user info) |

Activities are displayed in the card detail modal as a chronological audit trail.
