# Checklists, Comments & Attachments

Card detail features — these all live within the card detail modal and follow similar CRUD patterns.

## Checklists

### Schema
`server/src/db/schema/checklists.ts` — `checklists` and `checklist_items` tables.
- Checklist: id, cardId, name, position
- Checklist item: id, checklistId, text, isChecked, position (float for ordering)

### Routes
`server/src/routes/checklists.ts`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/checklists` | Create checklist on a card |
| PATCH | `/checklists/:id` | Update checklist name |
| DELETE | `/checklists/:id` | Delete checklist + all items |
| POST | `/checklists/:id/items` | Add item to checklist |
| PATCH | `/checklist-items/:id` | Update item (text, isChecked, position) |
| DELETE | `/checklist-items/:id` | Delete item |

Auth: Uses `requireBoardRoleViaCard` to verify board membership through the card's boardId.

### Client Component
`client/src/components/card/CardChecklist.tsx` — renders checklists with progress bars (checked/total), inline add/edit/delete for items.

## Comments

### Schema
`server/src/db/schema/comments.ts` — `comments` table.
- Fields: id, cardId, userId, body, search_vector (tsvector), timestamps
- Has a Postgres trigger that auto-updates search_vector on insert/update of body

### Routes
`server/src/routes/comments.ts`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cards/:cardId/comments` | List comments on a card (with user info) |
| POST | `/cards/:cardId/comments` | Add comment (also logs activity + parses @mentions for notifications) |
| PATCH | `/comments/:id` | Edit comment (only by author) |
| DELETE | `/comments/:id` | Delete comment (only by author) |

### Mentions
`server/src/utils/notifications.ts` — `parseMentions(text)` extracts `@username` patterns from comment body and creates notifications for mentioned users.

### Client Component
`client/src/components/card/CardComments.tsx` — renders comment list with author avatars, timestamps, edit/delete controls.

## Attachments

### Schema
`server/src/db/schema/attachments.ts` — `attachments` table.
- Fields: id, cardId, userId, filename, path, mimeType, size, thumbnailPath, timestamps

### Routes
`server/src/routes/attachments.ts`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/attachments` | Upload file (multipart form data, cardId in form field) |
| DELETE | `/attachments/:id` | Delete attachment (removes file from disk) |

File serving: `@fastify/static` serves files from the `uploads/` directory at `/uploads/` URL prefix.

### Upload Details
- Max file size: 50MB (configured in `@fastify/multipart` plugin)
- Storage: files saved to `STORAGE_PATH` (default `./data/attachments`)
- The server saves the file to disk and records metadata in the database
- Logs activity on upload

### Client Component
`client/src/components/card/CardAttachments.tsx` — renders attachment list with file type icons, download links, delete controls.

## Real-Time Updates

All three feature areas broadcast WebSocket events when data changes:
- `CHECKLIST_UPDATED` — after any checklist/item change
- `COMMENT_ADDED`, `COMMENT_UPDATED`, `COMMENT_DELETED`
- `ATTACHMENT_ADDED`, `ATTACHMENT_DELETED`

These events are received by `useBoardSync` hook and update the card detail view in real time.

## Activity Logging

All three features log activities via `logActivity()` from `server/src/utils/activity.ts`:
- Comment added/edited/deleted
- Checklist created/deleted, item checked/unchecked
- Attachment uploaded/deleted
