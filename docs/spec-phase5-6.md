# Mello Phase 5-6 Specification

All API endpoints are prefixed with `/api/v1`. All endpoints require authentication (valid session cookie) unless stated otherwise. All UUIDs are v4 format. All timestamps are ISO 8601 with timezone. Error responses follow the existing `AppError` pattern: `{ error: { statusCode, message, code } }`.

---

## 5A-SEARCH: Full-Text Search

### API Endpoint

**`GET /api/v1/search`**

Query parameters:

| Param         | Type     | Required | Description                                      |
|---------------|----------|----------|--------------------------------------------------|
| `q`           | string   | Yes      | Search term, 1-200 characters                    |
| `workspaceId` | uuid     | No       | Restrict results to this workspace               |
| `boardId`     | uuid     | No       | Restrict results to this board                   |
| `labels`      | string   | No       | Comma-separated label UUIDs to filter by          |
| `members`     | string   | No       | Comma-separated user UUIDs to filter by           |
| `limit`       | integer  | No       | Max results to return, 1-50, default 20           |
| `cursor`      | string   | No       | Opaque cursor from previous response for pagination |

**Response 200:**

```json
{
  "results": [
    {
      "type": "card",
      "cardId": "uuid",
      "cardName": "string",
      "listId": "uuid",
      "listName": "string",
      "boardId": "uuid",
      "boardName": "string",
      "workspaceId": "uuid",
      "snippet": "string with <mark>highlighted</mark> terms",
      "matchSource": "name" | "description" | "comment"
    }
  ],
  "nextCursor": "string | null"
}
```

**Response 400** (validation error):

```json
{
  "error": { "statusCode": 400, "message": "Search query is required", "code": "VALIDATION_ERROR" }
}
```

### Database Changes

1. Add a `search_vector` column to the `cards` table:

```sql
ALTER TABLE cards ADD COLUMN search_vector tsvector;
CREATE INDEX cards_search_idx ON cards USING GIN (search_vector);
```

2. Add a `search_vector` column to the `comments` table:

```sql
ALTER TABLE comments ADD COLUMN search_vector tsvector;
CREATE INDEX comments_search_idx ON comments USING GIN (search_vector);
```

3. Create a trigger function and triggers to keep `search_vector` updated automatically:

```sql
-- Cards: combine name and description
CREATE OR REPLACE FUNCTION cards_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cards_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, description ON cards
  FOR EACH ROW EXECUTE FUNCTION cards_search_vector_update();

-- Comments: index body
CREATE OR REPLACE FUNCTION comments_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.body, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comments_search_vector_trigger
  BEFORE INSERT OR UPDATE OF body ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_search_vector_update();
```

4. Backfill existing rows:

```sql
UPDATE cards SET search_vector =
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B');

UPDATE comments SET search_vector = to_tsvector('english', coalesce(body, ''));
```

In the Drizzle schema files, add the `search_vector` column as a `customType` or `text` column. The triggers handle updates, so the application code never writes to this column directly.

### Validation (Zod Schema)

Add to `packages/shared/src/schemas/search.ts`:

```typescript
import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required').max(200),
  workspaceId: z.string().uuid().optional(),
  boardId: z.string().uuid().optional(),
  labels: z.string().optional(),       // validated further in handler: split by comma, each must be uuid
  members: z.string().optional(),      // validated further in handler: split by comma, each must be uuid
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
```

### Authorization Rules

- User must be authenticated.
- Results are filtered to only include cards from boards where the user is a member (any role: admin, normal, observer).
- If `workspaceId` is provided, additionally verify the user is a member of that workspace. If not a member, return an empty result set (do not return 403 -- prevents information leakage about workspace existence).
- If `boardId` is provided, additionally verify the user is a member of that board. If not a member, return an empty result set.

### Query Logic

1. Parse `q` into a `tsquery` using `websearch_to_tsquery('english', q)` which handles phrases, AND/OR, and special characters safely.
2. Search cards: match `cards.search_vector @@ tsquery`. Join to `lists` for list name, `boards` for board name and `workspaceId`.
3. Search comments: match `comments.search_vector @@ tsquery`. Join through `cards` to `lists` and `boards`. Deduplicate by card -- if a card matches via both its own text and a comment, return it once with `matchSource` set to the higher-weight match (`"name"` > `"description"` > `"comment"`).
4. Generate snippet using `ts_headline('english', source_text, tsquery, 'MaxWords=35, MinWords=15, MaxFragments=1, StartSel=<mark>, StopSel=</mark>')`.
5. Apply label filter: if `labels` is set, only include cards that have ALL specified labels (inner join to `card_labels` for each label ID).
6. Apply member filter: if `members` is set, only include cards that have at least ONE specified member (inner join to `card_assignments` with `IN` clause).
7. Order by `ts_rank(search_vector, tsquery) DESC`, then `cards.updated_at DESC` as tiebreaker.
8. Cursor: encode as base64 of `{rank}:{cardId}`. Use keyset pagination: `WHERE (ts_rank(...), cards.id) < (cursor_rank, cursor_id)`.

### Edge Cases and Error Conditions

| Condition | Behavior |
|-----------|----------|
| `q` is empty or whitespace only | 400: "Search query is required" |
| `q` exceeds 200 characters | 400: validation error |
| `q` contains only stop words (e.g., "the", "a") | Return empty results (tsquery will be empty) |
| `q` contains SQL injection attempts | Safe: `websearch_to_tsquery` sanitizes input |
| `labels` param contains non-UUID values | 400: validation error |
| `members` param contains non-UUID values | 400: validation error |
| `cursor` is malformed | 400: "Invalid cursor" |
| User is not a member of any workspace | Return empty results |
| No results match | Return `{ results: [], nextCursor: null }` |
| `limit` is 0 or negative | 400: validation error |
| `boardId` and `workspaceId` both provided, but board is not in that workspace | Return empty results |

### Acceptance Criteria

1. `GET /api/v1/search?q=design` returns cards whose name or description contains "design", and cards that have comments containing "design".
2. Results include `cardName`, `listName`, `boardName`, `snippet`, and `matchSource`.
3. Snippets contain `<mark>` tags around matching terms.
4. Results are scoped to boards where the authenticated user is a member.
5. Providing `workspaceId` restricts results to that workspace.
6. Providing `boardId` restricts results to that board.
7. Providing `labels=id1,id2` returns only cards that have both label id1 AND label id2.
8. Providing `members=id1,id2` returns only cards assigned to id1 OR id2.
9. Pagination works: first request returns `nextCursor`; passing it returns the next page.
10. A search for a term that only appears in a comment returns the parent card with `matchSource: "comment"`.
11. An unauthenticated request returns 401.
12. Results never include cards from boards the user is not a member of.

---

## 5B-FILTERS: Board Card Filtering

### API Changes

**`GET /api/v1/boards/:boardId/lists`** -- add optional query parameters:

| Param     | Type   | Required | Description                                      |
|-----------|--------|----------|--------------------------------------------------|
| `labels`  | string | No       | Comma-separated label UUIDs. Cards must have ALL. |
| `members` | string | No       | Comma-separated user UUIDs. Cards must have at least ONE. |

When either parameter is present, the response shape is identical to the existing response, but the `cards` arrays within each list are filtered. Lists that have zero matching cards are still returned (with an empty `cards` array) so the board layout is preserved.

**Response 200 (unchanged shape):**

```json
{
  "lists": [
    {
      "id": "uuid",
      "boardId": "uuid",
      "name": "string",
      "position": 1.0,
      "createdAt": "iso8601",
      "updatedAt": "iso8601",
      "cards": [
        {
          "id": "uuid",
          "listId": "uuid",
          "boardId": "uuid",
          "name": "string",
          "description": "string | null",
          "position": 1.0,
          "labelIds": ["uuid"],
          "createdAt": "iso8601",
          "updatedAt": "iso8601"
        }
      ]
    }
  ]
}
```

### Database Changes

None. Uses existing `card_labels` and `card_assignments` tables.

### Validation (Zod Schema)

Add to `packages/shared/src/schemas/list.ts`:

```typescript
export const listFilterSchema = z.object({
  labels: z.string().optional(),    // comma-separated UUIDs
  members: z.string().optional(),   // comma-separated UUIDs
});

export type ListFilterInput = z.infer<typeof listFilterSchema>;
```

In the handler, parse each comma-separated string and validate each element is a valid UUID. If any element is not a valid UUID, return 400.

### Authorization Rules

- Unchanged from existing endpoint: requires auth + board membership (admin, normal, or observer).

### Query Logic

1. If neither `labels` nor `members` is provided, behavior is identical to current implementation.
2. If `labels` is provided (e.g., `labels=id1,id2`):
   - For each card, check that it has entries in `card_labels` for ALL of the specified label IUIDs.
   - Implementation: join `card_labels`, group by `card.id`, `HAVING COUNT(DISTINCT card_labels.label_id) = <number of label IDs>`.
3. If `members` is provided (e.g., `members=id1,id2`):
   - For each card, check that it has at least ONE entry in `card_assignments` where `userId` is in the specified list.
   - Implementation: `EXISTS (SELECT 1 FROM card_assignments WHERE card_id = cards.id AND user_id IN (...))`.
4. When both `labels` and `members` are provided, both conditions must be satisfied (AND).

### Client Behavior

- A filter bar appears above the board columns when filters are active.
- The filter bar contains:
  - A "Filter" button/icon that opens a filter popover.
  - Inside the popover: a list of the board's labels as clickable pills (colored by label color, showing label name). Clicking toggles the label filter on/off.
  - Inside the popover: a list of board members as clickable avatars with display names. Clicking toggles the member filter on/off.
- Active filters are shown as pills in the filter bar (e.g., "Label: Bug", "Member: Alice").
- Clicking an active pill removes that filter.
- A "Clear filters" button removes all filters.
- Filters are stored in URL query params (`?labels=id1,id2&members=id1`) so they are shareable and survive page refresh.
- When filters change, `GET /boards/:boardId/lists?labels=...&members=...` is re-fetched.
- The board store must differentiate between "no cards in this list" (empty list) and "no cards match filters" (show a subtle "No matching cards" message).

### Edge Cases and Error Conditions

| Condition | Behavior |
|-----------|----------|
| `labels` contains a non-existent label UUID | No cards will match that label, so all lists return empty cards arrays |
| `members` contains a non-existent user UUID | No cards will match, so all lists return empty cards arrays |
| `labels` or `members` contains non-UUID strings | 400: validation error |
| `labels` is an empty string | Treated as no label filter (ignore) |
| `members` is an empty string | Treated as no member filter (ignore) |
| A card has no labels assigned | Will not match any label filter |
| A card has no members assigned | Will not match any member filter |
| Duplicate UUIDs in `labels` or `members` | Deduplicate before querying |

### Acceptance Criteria

1. `GET /boards/:id/lists?labels=labelA,labelB` returns only cards that have both labelA AND labelB.
2. `GET /boards/:id/lists?members=userA,userB` returns only cards assigned to userA OR userB.
3. `GET /boards/:id/lists?labels=labelA&members=userA` returns cards that have labelA AND are assigned to userA.
4. `GET /boards/:id/lists` (no params) returns all cards as before (backward compatible).
5. Lists with no matching cards are still returned with an empty `cards` array.
6. Invalid UUIDs in filter params return 400.
7. Client filter bar appears when filters are active and shows active filter pills.
8. Clicking a label/member pill in the filter bar removes that filter.
9. "Clear filters" removes all active filters.
10. Filters persist in the URL and survive page refresh.

---

## 5C-NOTIFICATIONS: In-App Notifications

### API Endpoints

#### 1. List Notifications

**`GET /api/v1/notifications`**

Query parameters:

| Param    | Type    | Required | Description                         |
|----------|---------|----------|-------------------------------------|
| `unread` | boolean | No       | If `true`, only return unread notifications. Default: false (return all). |
| `limit`  | integer | No       | Max results, 1-50, default 20       |
| `cursor` | string  | No       | Opaque cursor for pagination        |

**Response 200:**

```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "mention" | "card_assigned" | "board_added",
      "data": {
        "cardId": "uuid",
        "cardName": "string",
        "boardId": "uuid",
        "boardName": "string",
        "actorId": "uuid",
        "actorDisplayName": "string",
        "commentId": "uuid (only for mention type)",
        "commentSnippet": "string (only for mention type, first 100 chars)"
      },
      "read": false,
      "createdAt": "iso8601"
    }
  ],
  "nextCursor": "string | null",
  "unreadCount": 5
}
```

The response always includes `unreadCount` (total unread notifications for the user, regardless of filters/pagination) so the client can display the badge.

#### 2. Mark Notifications as Read

**`POST /api/v1/notifications/mark-read`**

**Request body:**

```json
{
  "ids": ["uuid", "uuid"]
}
```

**Response 200:**

```json
{
  "updated": 2
}
```

#### 3. Mark All Notifications as Read

**`POST /api/v1/notifications/mark-all-read`**

No request body.

**Response 200:**

```json
{
  "updated": 12
}
```

### Database Changes

The `notifications` table already exists with the correct schema:

```
id         uuid PK
user_id    uuid FK -> users.id ON DELETE CASCADE
type       varchar(50)
data       jsonb
read       boolean default false
created_at timestamptz
```

Existing index: `notifications_user_read_idx ON (user_id, read, created_at)`.

No schema changes needed. The `type` column will store one of: `"mention"`, `"card_assigned"`, `"board_added"`.

The `data` JSONB column structure per type:

- `mention`: `{ cardId, cardName, boardId, boardName, actorId, actorDisplayName, commentId, commentSnippet }`
- `card_assigned`: `{ cardId, cardName, boardId, boardName, actorId, actorDisplayName }`
- `board_added`: `{ boardId, boardName, actorId, actorDisplayName }`

### Validation (Zod Schemas)

Add to `packages/shared/src/schemas/notification.ts`:

```typescript
import { z } from 'zod';

export const listNotificationsSchema = z.object({
  unread: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export type ListNotificationsInput = z.infer<typeof listNotificationsSchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
```

### Authorization Rules

- All three endpoints require authentication.
- Users can only see/modify their own notifications. The `userId` is always taken from the session, never from request params.
- `mark-read` only updates notifications that belong to the authenticated user. If an `id` in the array belongs to another user, it is silently ignored (no error, no update for that row).

### Notification Creation Rules

Notifications are created server-side as side effects of existing operations. They should be created inside the relevant route handlers (or extracted into a shared `createNotification` utility). The creating user (the actor) should never receive a notification for their own action.

#### Trigger: @mention in a comment

- When: `POST /cards/:cardId/comments` is called.
- Detection: scan the comment `body` for `@username` patterns using regex `/@([a-zA-Z0-9_-]+)/g`.
- For each matched username:
  1. Look up the user by `username` in the `users` table.
  2. If the user exists AND is not the comment author AND is a member of the card's board, create a notification.
  3. Type: `"mention"`.
  4. Data: `{ cardId, cardName, boardId, boardName, actorId, actorDisplayName, commentId, commentSnippet }` where `commentSnippet` is the first 100 characters of the comment body.

#### Trigger: Card assignment

- When: `POST /cards/:cardId/members/:userId` is called.
- If the assigned `userId` is not the requesting user, create a notification.
- Type: `"card_assigned"`.
- Data: `{ cardId, cardName, boardId, boardName, actorId, actorDisplayName }`.

#### Trigger: Board member added

- When: `POST /boards/:boardId/members` is called.
- If the added `userId` is not the requesting user, create a notification.
- Type: `"board_added"`.
- Data: `{ boardId, boardName, actorId, actorDisplayName }`.

#### Real-time delivery

After inserting the notification row, emit a Socket.IO event to the recipient user's personal room. The existing `WS_EVENTS.NOTIFICATION` (`"user:notification"`) event is already defined.

- Each authenticated user joins a personal room named `user:{userId}` upon WebSocket connection.
- Emit `user:notification` to `user:{recipientUserId}` with the full notification object.

### Client Behavior

- A bell icon in the app header shows the unread count as a badge (red circle with number). If count is 0, no badge.
- Clicking the bell opens a dropdown panel (not a new page).
- The dropdown shows notifications in reverse chronological order.
- Each notification shows: actor avatar/name, action description, card/board name, and relative time (e.g., "2 hours ago").
- Unread notifications have a visual indicator (blue dot or background highlight).
- Clicking a notification:
  1. Marks it as read (call `POST /notifications/mark-read` with that ID).
  2. Navigates to the relevant card (opens the card detail modal on the correct board page).
  3. For `board_added` type, navigates to the board page.
- A "Mark all as read" button at the top of the dropdown calls `POST /notifications/mark-all-read`.
- The dropdown loads more notifications on scroll (infinite scroll using cursor pagination).
- When a `user:notification` WebSocket event is received, prepend the notification to the dropdown list and increment the unread count badge.

### Edge Cases and Error Conditions

| Condition | Behavior |
|-----------|----------|
| `@username` does not match any user | Silently skip, no notification created |
| `@username` matches the comment author | Skip (no self-notification) |
| `@username` matches a user not on the board | Skip (they should not see the card) |
| User assigns themselves to a card | No notification created |
| Admin adds themselves to a board | No notification created |
| `ids` array in `mark-read` is empty | 400: validation error |
| `ids` array contains more than 100 items | 400: validation error |
| `ids` array contains IDs that don't exist | Silently ignored, `updated` count reflects only rows actually updated |
| `ids` array contains IDs belonging to other users | Silently ignored |
| Notification references a deleted card | Client handles gracefully: show notification but clicking it shows "Card not found" if the card was deleted |
| `cursor` is invalid | 400: "Invalid cursor" |

### Acceptance Criteria

1. When user A @mentions user B in a comment, user B receives a notification of type `"mention"`.
2. When user A assigns user B to a card, user B receives a notification of type `"card_assigned"`.
3. When user A adds user B to a board, user B receives a notification of type `"board_added"`.
4. The actor never receives a notification for their own action.
5. Mentions of users who are not board members do not produce notifications.
6. `GET /notifications` returns the user's notifications in reverse chronological order.
7. `GET /notifications?unread=true` returns only unread notifications.
8. `POST /notifications/mark-read` with `{ ids: [id1, id2] }` marks those notifications as read.
9. `POST /notifications/mark-all-read` marks all of the user's notifications as read.
10. The response always includes `unreadCount`.
11. A WebSocket event `user:notification` is emitted to the recipient in real time.
12. The bell icon shows the correct unread count badge.
13. Clicking a notification navigates to the relevant card/board.
14. Unauthenticated requests return 401.
15. A user cannot read or modify another user's notifications.

---

## 5D-ATTACHMENTS: File Attachments

### API Endpoints

#### 1. Upload Attachment

**`POST /api/v1/cards/:cardId/attachments`**

Content-Type: `multipart/form-data`

| Field  | Type | Required | Description         |
|--------|------|----------|---------------------|
| `file` | file | Yes      | The file to upload  |

**Response 201:**

```json
{
  "attachment": {
    "id": "uuid",
    "cardId": "uuid",
    "userId": "uuid",
    "filename": "design-mockup.png",
    "storagePath": "/attachments/cardId/attachmentId-design-mockup.png",
    "mimeType": "image/png",
    "sizeBytes": 245832,
    "thumbnailPath": null,
    "createdAt": "iso8601"
  }
}
```

The `storagePath` in the response is the relative URL path for downloading, not the filesystem path.

#### 2. Download Attachment

**`GET /api/v1/attachments/:id/download`**

**Response 200:** The raw file with appropriate `Content-Type`, `Content-Disposition: attachment; filename="original-filename.ext"`, and `Content-Length` headers.

**Response 404:** If the attachment does not exist or the file is missing from disk.

#### 3. Delete Attachment

**`DELETE /api/v1/attachments/:id`**

**Response 204:** No content.

### Database Changes

The `attachments` table already exists:

```
id             uuid PK
card_id        uuid FK -> cards.id ON DELETE CASCADE
user_id        uuid FK -> users.id
filename       varchar(255)
storage_path   text
mime_type      varchar(100)
size_bytes     bigint
thumbnail_path text
created_at     timestamptz
```

No schema changes needed. Add an index for querying by card:

```sql
CREATE INDEX attachments_card_idx ON attachments (card_id, created_at);
```

### File Storage

- Files are stored on the local filesystem at: `{STORAGE_PATH}/{cardId}/{attachmentId}-{sanitizedFilename}`
- `STORAGE_PATH` is read from environment/config (e.g., `process.env.STORAGE_PATH` or a config file). Default: `./data/uploads`.
- `sanitizedFilename`: the original filename with any path separators (`/`, `\`) removed and whitespace replaced with underscores. Preserve the original extension.
- The `storage_path` column in the database stores the full filesystem path (for server-side file operations).
- The API response returns a download URL path: `/api/v1/attachments/:id/download`.

### Validation

- Max file size: 25 MB (26,214,400 bytes). Enforced at the Fastify multipart plugin level.
- Filename max length: 255 characters. If longer, truncate to 255 (preserving extension).
- No restriction on file types (any MIME type allowed).
- The `file` field must be present in the multipart form data.

Zod schema (for reference/documentation, actual validation is multipart-based):

```typescript
// No Zod schema for upload (multipart). Validation is done in the handler.
// For documentation:
// - file: required, max 25MB
// - No other fields
```

### Authorization Rules

- **Upload**: requires auth. The user must be a member of the board that the card belongs to, with role `admin` or `normal`. Observers cannot upload.
- **Download**: requires auth. The user must be a member of the board that the card belongs to (any role including observer).
- **Delete**: requires auth. The user must be the uploader (`attachment.userId === request.userId`) OR a board admin.

### Implementation Notes

- Use `@fastify/multipart` for handling file uploads.
- Set `limits: { fileSize: 26214400 }` (25 MB) in the multipart config.
- On upload:
  1. Validate the card exists (404 if not).
  2. Check board membership/role.
  3. Create the directory `{STORAGE_PATH}/{cardId}/` if it does not exist (use `mkdir -p` equivalent).
  4. Generate the attachment UUID first, then write file to `{STORAGE_PATH}/{cardId}/{attachmentId}-{sanitizedFilename}`.
  5. Insert the row into `attachments`.
  6. Broadcast `WS_EVENTS.ATTACHMENT_ADDED` to the board room with the attachment object.
- On download:
  1. Look up the attachment row.
  2. Verify the file exists on disk. If the DB row exists but the file is missing, return 404 with message "File not found on disk".
  3. Stream the file using `reply.sendFile()` or `fs.createReadStream()` with appropriate headers.
- On delete:
  1. Look up the attachment row (404 if not found).
  2. Check authorization.
  3. Delete the file from disk (if it exists; do not error if already missing).
  4. Delete the database row.
  5. Broadcast `WS_EVENTS.ATTACHMENT_DELETED` to the board room.

### Client Behavior

- The "Attachments" section in `CardDetail.tsx` (currently shows "Coming soon") is replaced with:
  - A file list showing each attachment: filename, file size (human-readable, e.g., "2.4 MB"), uploader name, upload date.
  - Each attachment has a download link (anchor tag pointing to `/api/v1/attachments/:id/download`) and a delete button (shown only if the user is the uploader or a board admin).
  - A drag-and-drop zone at the top of the attachments section. Also a "Choose file" button as fallback.
  - During upload, show a progress indicator.
  - After successful upload, the new attachment appears in the list (via re-fetch or optimistic update from the WebSocket event).
  - For image attachments (MIME type starts with `image/`), show a small thumbnail preview inline.
- The "Attachment" button in the sidebar should trigger a file picker dialog.

### Edge Cases and Error Conditions

| Condition | Behavior |
|-----------|----------|
| File exceeds 25 MB | 413: "File too large. Maximum size is 25 MB." |
| No file in multipart body | 400: "No file provided" |
| Card does not exist | 404: "Card not found" |
| Attachment ID does not exist | 404: "Attachment not found" |
| File exists in DB but missing from disk | Download returns 404: "File not found on disk" |
| User is observer trying to upload | 403: "You do not have permission to perform this action" |
| User tries to delete another user's attachment (not board admin) | 403 |
| Filename contains path traversal (e.g., `../../etc/passwd`) | Sanitize: strip all `/` and `\` characters |
| Filename is empty or only whitespace | Use "unnamed-file" as default filename |
| Two files with the same name on the same card | No conflict: each gets a unique `{attachmentId}-{filename}` path |
| Card is deleted (cascade) | DB rows are deleted via CASCADE. Orphaned files remain on disk. A cleanup job can handle this later (out of scope for this phase). |
| Disk is full | 500: "Failed to save file" |

### Acceptance Criteria

1. `POST /cards/:cardId/attachments` with a file uploads it and returns the attachment metadata.
2. The file is stored at `{STORAGE_PATH}/{cardId}/{attachmentId}-{filename}` on disk.
3. `GET /attachments/:id/download` returns the file with correct Content-Type and Content-Disposition headers.
4. `DELETE /attachments/:id` removes the file from disk and the row from the database.
5. Files larger than 25 MB are rejected with 413.
6. Observers cannot upload files (403).
7. Only the uploader or a board admin can delete an attachment.
8. WebSocket events are broadcast on upload and delete.
9. The CardDetail attachments section shows the file list with download links and delete buttons.
10. Drag-and-drop upload works in the CardDetail attachments section.
11. Image attachments show a thumbnail preview.
12. Unauthenticated requests return 401.
13. Non-board-members get 403 on all attachment operations.

---

## 5E-SHORTCUTS: Keyboard Shortcuts

### API Endpoints

None. This is a client-only feature.

### Database Changes

None.

### Validation

None.

### Authorization Rules

None (client-only).

### Implementation

Register a global keyboard event listener (on `document` or via a React hook at the app root level). Shortcuts must only fire when no text input, textarea, or contenteditable element is focused (except for `Escape`, which always fires).

#### Shortcut Definitions

| Key(s)       | Action                                | Scope       | Active when input focused? |
|--------------|---------------------------------------|-------------|---------------------------|
| `n`          | Focus the "Add a card" input on the first visible list | Board page  | No |
| `Escape`     | Close the topmost open modal, dropdown, or popover. If nothing is open, deselect/blur current element. | Global | Yes |
| `/`          | Focus the search input in the header  | Global      | No |
| `Ctrl+K` (or `Cmd+K` on Mac) | Focus the search input in the header | Global | Yes |
| `?`          | Open the keyboard shortcuts help modal | Global     | No |

#### Behavior Details

**`n` -- Add Card**
- Only active on the board page (`/boards/:boardId` route).
- Finds the first list (by position order) and scrolls it into view.
- Focuses the "Add a card" composer at the bottom of that list. If the composer is not yet open, open it and then focus.
- If there are no lists on the board, do nothing.

**`Escape` -- Close Modal**
- Closes the topmost overlay in this priority order: (1) keyboard shortcuts help modal, (2) card detail modal, (3) any open dropdown/popover.
- If multiple overlays are stacked, only close the topmost one per keypress.
- Must work even when an input is focused (e.g., typing in a card name field and pressing Escape should close the modal).

**`/` -- Focus Search**
- Prevents the default browser behavior (no "/" character typed in the search box).
- Focuses the search input in the app header.
- If the search input is already focused, do nothing.

**`Ctrl+K` / `Cmd+K` -- Focus Search**
- Same behavior as `/`, but works even when an input is focused.
- Prevent default browser behavior (Chrome opens bookmark bar).

**`?` -- Help Modal**
- Opens a modal listing all available keyboard shortcuts in a two-column table (shortcut key on left, description on right).
- Pressing `?` again or `Escape` closes the modal.

### Client Components

1. **`useKeyboardShortcuts` hook**: registered at the app root. Contains all shortcut logic.
2. **`KeyboardShortcutsModal` component**: the help modal showing the shortcuts table.

### Edge Cases and Error Conditions

| Condition | Behavior |
|-----------|----------|
| User is typing in a text input and presses `n` | Do nothing (shortcut suppressed when input focused) |
| User is typing in a text input and presses `Escape` | Close modal/dropdown (Escape always active) |
| User is typing in a text input and presses `Ctrl+K` | Focus search (Ctrl+K always active) |
| User is on the home/workspace page and presses `n` | Do nothing (only active on board page) |
| No lists on the board and user presses `n` | Do nothing |
| Search input does not exist in DOM (edge case) | Do nothing |
| Multiple modals open (e.g., card detail + label picker) | Escape closes the topmost one |

### Acceptance Criteria

1. Pressing `n` on a board page focuses the "Add a card" input on the first list.
2. Pressing `n` while typing in any input does nothing.
3. Pressing `Escape` closes the topmost open modal or dropdown.
4. Pressing `Escape` works even when an input element is focused.
5. Pressing `/` focuses the search input in the header.
6. Pressing `/` does not type a "/" character into the search box.
7. Pressing `Ctrl+K` (or `Cmd+K` on Mac) focuses the search input, even when another input is focused.
8. Pressing `?` opens the keyboard shortcuts help modal.
9. The help modal lists all shortcuts with their descriptions.
10. Pressing `Escape` or `?` closes the help modal.

---

## 6A-TEMPLATES: Board Templates

### API Endpoints

#### 1. Create Board from Template

**`POST /api/v1/boards/from-template/:templateId`**

**Request body:**

```json
{
  "workspaceId": "uuid",
  "name": "string"
}
```

| Field         | Type   | Required | Constraints        |
|---------------|--------|----------|--------------------|
| `workspaceId` | uuid   | Yes      | Must be a valid UUID |
| `name`        | string | Yes      | 1-255 characters   |

**Response 201:**

```json
{
  "board": {
    "id": "uuid",
    "workspaceId": "uuid",
    "name": "My New Board",
    "description": "string | null",
    "backgroundType": "color",
    "backgroundValue": "#0079bf",
    "isTemplate": false,
    "position": 131072,
    "createdAt": "iso8601",
    "updatedAt": "iso8601"
  }
}
```

#### 2. List Templates

Templates are boards with `isTemplate: true`. They are already returned by `GET /api/v1/workspaces/:workspaceId/boards` -- the client filters by `isTemplate`. No new endpoint needed, but the existing endpoint's response already includes `isTemplate`.

#### 3. Mark Board as Template

Use the existing `PATCH /api/v1/boards/:boardId` with body `{ "isTemplate": true }`. The `updateBoardSchema` must be extended to accept `isTemplate`.

### Database Changes

None. The `boards` table already has `is_template boolean default false`.

### Validation (Zod Schemas)

Add to `packages/shared/src/schemas/board.ts`:

```typescript
export const createFromTemplateSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(255),
});

export type CreateFromTemplateInput = z.infer<typeof createFromTemplateSchema>;
```

Update `updateBoardSchema` to include:

```typescript
isTemplate: z.boolean().optional(),
```

### Authorization Rules

- **Create from template**: user must be a member of the target workspace. User must be a member of the template board (to read its contents) OR the template board must be in a workspace the user is a member of.
- **Mark as template**: user must be a board admin.
- **View templates**: existing board listing rules apply (workspace membership).

### Copy Logic

When creating a board from a template:

1. Create a new board in the target workspace with the provided `name`. Copy `description`, `backgroundType`, `backgroundValue` from the template. Set `isTemplate: false`.
2. Copy all lists from the template board, preserving `name` and `position`. Generate new UUIDs.
3. Copy all labels from the template board, preserving `name`, `color`, and `position`. Generate new UUIDs.
4. Do NOT copy: cards, card assignments, comments, checklists, attachments, activities, board members (except the creating user who becomes admin).
5. Add the creating user as board admin.
6. The new board's position is calculated as the next position in the target workspace (same logic as `POST /boards`).

### Edge Cases and Error Conditions

| Condition | Behavior |
|-----------|----------|
| `templateId` does not exist | 404: "Board not found" |
| `templateId` exists but `isTemplate` is false | 404: "Board not found" (treat non-template boards as invalid templates) |
| User is not a member of the target workspace | 403 |
| User is not a member of the template board's workspace | 403 |
| `name` is empty | 400: validation error |
| `workspaceId` does not exist | 403 (workspace membership check fails) |
| Template board has no lists | Board is created with no lists (valid) |
| Template board has no labels | Board is created with default labels (same as normal board creation) -- NO, copy the empty label set to match the template exactly |

### Acceptance Criteria

1. `POST /boards/from-template/:templateId` creates a new board copying lists and labels from the template.
2. The new board has `isTemplate: false`.
3. Lists are copied with the same names and positions but new UUIDs.
4. Labels are copied with the same names, colors, and positions but new UUIDs.
5. Cards, comments, checklists, attachments, and activities are NOT copied.
6. The creating user is added as board admin.
7. If the source board is not a template (`isTemplate: false`), return 404.
8. Non-workspace-members cannot create boards from templates (403).
9. `PATCH /boards/:boardId` with `{ isTemplate: true }` marks the board as a template.
10. The workspace boards list includes template boards with `isTemplate: true`.
11. Client shows a "Templates" section on the workspace page, listing boards where `isTemplate: true`.
12. Client shows a "Create from template" option that opens a dialog to select a template and provide a board name.

---

## 6B-BACKGROUNDS: Board Background Images

### API Endpoints

#### 1. Upload Board Background Image

**`POST /api/v1/boards/:boardId/background`**

Content-Type: `multipart/form-data`

| Field  | Type | Required | Description          |
|--------|------|----------|----------------------|
| `file` | file | Yes      | Image file to upload |

**Response 200:**

```json
{
  "board": {
    "id": "uuid",
    "workspaceId": "uuid",
    "name": "string",
    "description": "string | null",
    "backgroundType": "image",
    "backgroundValue": "/api/v1/boards/uuid/background/image",
    "isTemplate": false,
    "position": 65536,
    "createdAt": "iso8601",
    "updatedAt": "iso8601"
  }
}
```

#### 2. Serve Board Background Image

**`GET /api/v1/boards/:boardId/background/image`**

**Response 200:** The raw image file with appropriate `Content-Type` header and cache headers (`Cache-Control: public, max-age=86400`).

**Response 404:** If no custom background image exists for this board.

### Database Changes

None. Uses existing `backgroundType` (`'color' | 'image'`) and `backgroundValue` columns on `boards`.

When a custom image is uploaded:
- `backgroundType` is set to `'image'`.
- `backgroundValue` is set to the served URL path: `/api/v1/boards/:boardId/background/image`.

### File Storage

- Files are stored at: `{STORAGE_PATH}/backgrounds/{boardId}-{sanitizedFilename}`
- When a new background is uploaded for a board that already has a custom background image, delete the old file from disk before saving the new one.
- Only one background image per board exists on disk at any time.

### Validation

- Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. Reject all others with 400.
- Max file size: 10 MB (10,485,760 bytes).
- The `file` field must be present.

### Authorization Rules

- **Upload**: requires auth + board admin role.
- **Serve image**: requires auth + board membership (any role). This is needed since board data is not public.
- **Set color background**: use existing `PATCH /boards/:boardId` with `{ backgroundType: 'color', backgroundValue: '#hex' }`. Requires board admin.

### Client Behavior

- Board settings (accessible via a gear icon or menu on the board page) include a "Background" section.
- The background section shows:
  - A row of color swatches (from `BOARD_BACKGROUND_COLORS` constant). Clicking a swatch sets `backgroundType: 'color'` and `backgroundValue` to that color via `PATCH /boards/:boardId`.
  - An "Upload image" button that opens a file picker. On selection, calls `POST /boards/:boardId/background`.
  - If the board currently has a custom image, show a small preview with a "Remove" option (which sets `backgroundType: 'color'` and `backgroundValue` to the default `#0079bf`).
- The board page applies the background:
  - If `backgroundType === 'color'`: set the board container's `background-color` to `backgroundValue`.
  - If `backgroundType === 'image'`: set `background-image: url(backgroundValue)` with `background-size: cover; background-position: center`.

### Edge Cases and Error Conditions

| Condition | Behavior |
|-----------|----------|
| File is not an accepted image type | 400: "Invalid file type. Accepted types: JPEG, PNG, WebP, GIF." |
| File exceeds 10 MB | 413: "File too large. Maximum size is 10 MB." |
| No file in multipart body | 400: "No file provided" |
| Board does not exist | 404: "Board not found" |
| User is not board admin | 403 |
| Uploading a new image when one already exists | Old file is deleted from disk before new one is saved |
| Board background is set to color, then `GET .../background/image` is called | 404 |
| File on disk is missing but DB says `backgroundType: 'image'` | `GET .../background/image` returns 404 |
| Concurrent uploads for the same board | Last write wins; previous file may be orphaned briefly |

### Acceptance Criteria

1. `POST /boards/:boardId/background` with an image file uploads it and updates the board's `backgroundType` to `'image'` and `backgroundValue` to the serve URL.
2. `GET /boards/:boardId/background/image` serves the uploaded image with correct Content-Type.
3. Only JPEG, PNG, WebP, and GIF are accepted.
4. Files larger than 10 MB are rejected with 413.
5. Only board admins can upload backgrounds.
6. Uploading a new image replaces the old one on disk.
7. Setting `backgroundType: 'color'` via PATCH does not delete the old image file (lazy cleanup is acceptable).
8. The board page renders the background color or image correctly.
9. The background picker in board settings shows color swatches and an image upload option.
10. Non-board-members cannot access the background image (403).

---

## 6C-COPY-MOVE: Copy Lists and Move Cards Between Boards

### API Endpoints

#### 1. Copy List to Another Board

**`POST /api/v1/lists/:listId/copy`**

**Request body:**

```json
{
  "targetBoardId": "uuid"
}
```

**Response 201:**

```json
{
  "list": {
    "id": "uuid (new)",
    "boardId": "uuid (targetBoardId)",
    "name": "Copied List Name",
    "position": 131072,
    "createdAt": "iso8601",
    "updatedAt": "iso8601"
  },
  "cardsCopied": 5
}
```

#### 2. Move Card to Another Board

Uses the existing endpoint: **`POST /api/v1/cards/:cardId/move`**

The existing `moveCardSchema` already supports an optional `boardId` field. No new endpoint needed. However, the handler logic must be extended (see below).

### Database Changes

None. Uses existing tables.

### Validation (Zod Schemas)

Add to `packages/shared/src/schemas/list.ts`:

```typescript
export const copyListSchema = z.object({
  targetBoardId: z.string().uuid(),
});

export type CopyListInput = z.infer<typeof copyListSchema>;
```

### Authorization Rules

- **Copy list**: user must be a member of the source list's board (any role) AND a member of the target board with role `admin` or `normal`.
- **Move card between boards**: user must be a member of the source card's board (any role) AND a member of the target board with role `admin` or `normal`.

### Copy List Logic

1. Look up the source list and verify it exists. 404 if not.
2. Verify the target board exists. 404 if not.
3. Check authorization for both source and target boards.
4. Create a new list on the target board:
   - Same `name` as the source list.
   - `position`: next position in the target board (append to end).
   - New UUID.
5. Copy all cards from the source list to the new list on the target board:
   - For each card: copy `name`, `description`. New UUID, new `listId` (the new list), new `boardId` (target board). Position preserved.
   - Copy `card_labels`: for each card-label association, find a matching label on the target board (by `color` and `name`). If a matching label exists, create the association. If not, skip it (label is not copied).
   - Do NOT copy: card assignments, checklists, checklist items, comments, attachments, activities.
6. Broadcast `WS_EVENTS.LIST_CREATED` to the target board room with the new list and its cards.
7. Return the new list and the count of copied cards.

### Move Card Between Boards Logic (Enhancement to Existing Handler)

The existing `POST /cards/:cardId/move` handler already accepts an optional `boardId`. When `boardId` is provided and differs from the card's current board:

1. Verify authorization for both source and target boards.
2. Update the card's `boardId`, `listId`, and `position`.
3. Handle label associations: remove all `card_labels` entries for this card (labels are board-specific and won't match on the new board).
4. Handle card assignments: keep them (members are users, not board-specific).
5. Broadcast `WS_EVENTS.CARD_DELETED` to the source board room (so it disappears from the old board).
6. Broadcast `WS_EVENTS.CARD_CREATED` to the target board room (so it appears on the new board).

### Client Behavior

**Copy List:**
- Each list's menu (the "..." or kebab menu on the list header) includes a "Copy list to..." option.
- Clicking it opens a popover/modal showing a list of boards the user has access to (excluding the current board). Only boards where the user has `admin` or `normal` role are shown.
- User selects a target board and clicks "Copy".
- Show a loading state. On success, show a toast: "List copied to {board name}" with a link to the target board.

**Move Card to Another Board:**
- In the card detail modal sidebar, add a "Move to board..." option.
- Clicking it opens a popover showing:
  1. A board selector dropdown (boards the user has access to with `admin` or `normal` role, excluding the current board).
  2. After selecting a board, a list selector dropdown showing the lists on that target board.
  3. A "Move" button.
- On success, close the card detail modal and remove the card from the current board view.
- Show a toast: "Card moved to {board name}".

### Edge Cases and Error Conditions

| Condition | Behavior |
|-----------|----------|
| Source list does not exist | 404: "List not found" |
| Target board does not exist | 404: "Board not found" |
| Target board is the same as the source board | 400: "Cannot copy list to the same board" |
| User is not a member of the target board | 403 |
| User is an observer on the target board | 403 |
| Source list has no cards | List is copied with no cards. `cardsCopied: 0` |
| Source list has cards with labels that don't exist on target board | Label associations are silently dropped for those cards |
| Moving a card to a board where a list doesn't exist for the target `listId` | 404: "List not found" |
| Moving a card to the same board (boardId matches current) | Normal within-board move (existing behavior) |
| Card has checklists/comments/attachments when moved | These stay attached to the card (they reference `card_id`, not `board_id`) |
| Card has labels when moved to another board | All label associations are removed (labels are board-scoped) |

### Acceptance Criteria

1. `POST /lists/:listId/copy` with `{ targetBoardId }` copies the list and all its cards to the target board.
2. Copied cards have new UUIDs and reference the new list and board.
3. Card label associations are matched by label color+name on the target board; unmatched labels are dropped.
4. Card assignments, checklists, comments, and attachments are NOT copied.
5. The response includes the new list object and `cardsCopied` count.
6. Copying a list to the same board returns 400.
7. Moving a card between boards (via `POST /cards/:cardId/move` with `boardId`) updates the card's `boardId`.
8. When a card is moved between boards, all its label associations are removed.
9. When a card is moved between boards, its checklists, comments, and attachments remain intact.
10. WebSocket events are broadcast to both the source and target board rooms.
11. Authorization is checked for both source and target boards.
12. Observers cannot copy lists to or move cards to a board (403).
13. The "Copy list to..." option appears in the list menu.
14. The "Move to board..." option appears in the card detail sidebar.
15. Both operations show appropriate loading states and success toasts.

---

## Appendix A: New WebSocket Events Summary

No new event names are needed. All features use existing events from `WS_EVENTS`:

| Feature | Event | Notes |
|---------|-------|-------|
| 5C Notifications | `user:notification` | Emitted to `user:{userId}` room |
| 5D Attachments | `card:attachment-added` | Emitted to board room |
| 5D Attachments | `card:attachment-deleted` | Emitted to board room |
| 6C Copy List | `board:list-created` | Emitted to target board room |
| 6C Move Card | `board:card-deleted` | Emitted to source board room |
| 6C Move Card | `board:card-created` | Emitted to target board room |

## Appendix B: New Shared Schemas Summary

New files/exports to add in `packages/shared/src/schemas/`:

| File | Exports |
|------|---------|
| `search.ts` | `searchQuerySchema`, `SearchQueryInput` |
| `notification.ts` | `listNotificationsSchema`, `markReadSchema`, `ListNotificationsInput`, `MarkReadInput` |

Modifications to existing files:

| File | Change |
|------|--------|
| `list.ts` | Add `listFilterSchema`, `ListFilterInput`, `copyListSchema`, `CopyListInput` |
| `board.ts` | Add `createFromTemplateSchema`, `CreateFromTemplateInput`. Add `isTemplate` to `updateBoardSchema`. |
| `index.ts` | Add `export * from './search.js'` and `export * from './notification.js'` |

## Appendix C: New Database Indexes Summary

| Table | Index | Type |
|-------|-------|------|
| `cards` | `cards_search_idx ON search_vector` | GIN |
| `comments` | `comments_search_idx ON search_vector` | GIN |
| `attachments` | `attachments_card_idx ON (card_id, created_at)` | B-tree |

## Appendix D: Configuration / Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `STORAGE_PATH` | Base directory for file storage | `./data/uploads` |

The `STORAGE_PATH` directory must be writable by the server process. Subdirectories are created automatically as needed.
