# Boards, Lists & Cards

The core domain of Mello. These three entities are tightly coupled — the `boardStore` manages all three, and drag-and-drop spans lists and cards.

## Boards

### Schema
`server/src/db/schema/boards.ts` — `boards` and `board_members` tables.
- Fields: id, workspaceId, name, background (JSON: color or image), isTemplate, timestamps
- Board members have roles: admin, normal, observer

### Routes
`server/src/routes/boards.ts`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/boards` | Create board in a workspace (auto-creates default labels + adds creator as admin) |
| GET | `/boards/:boardId` | Get board with members |
| PATCH | `/boards/:boardId` | Update board name/background |
| DELETE | `/boards/:boardId` | Delete board (cascades to all children) |
| POST | `/boards/from-template/:templateId` | Clone a template board with all lists, cards, labels |
| GET | `/boards/:boardId/members` | List board members |
| POST | `/boards/:boardId/members` | Add member to board |
| GET | `/boards/:boardId/labels` | List board labels |
| POST | `/boards/:boardId/labels` | Create a label |

## Lists

### Schema
`server/src/db/schema/lists.ts` — `lists` table.
- Fields: id, boardId, name, position (real/float)
- Ordered by position ascending

### Routes
`server/src/routes/lists.ts`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/boards/:boardId/lists` | Get all lists with their cards (main board data endpoint) |
| POST | `/lists/:listId` | Create list in board |
| PATCH | `/lists/:listId` | Update list name/position |
| DELETE | `/lists/:listId` | Delete list + all its cards |

## Cards

### Schema
`server/src/db/schema/cards.ts` — `cards` table.
- Fields: id, listId, boardId, name, description, position (real/float), search_vector (tsvector), timestamps
- boardId is denormalized for efficient queries and search

### Routes
`server/src/routes/cards.ts`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/cards` | Create card in a list |
| GET | `/cards/:cardId` | Get card with all details (labels, members, checklists, attachments, comments) |
| PATCH | `/cards/:cardId` | Update card fields |
| DELETE | `/cards/:cardId` | Delete card |
| POST | `/cards/:cardId/move` | Move card to different list/position |
| POST | `/cards/:cardId/members` | Assign member to card |
| DELETE | `/cards/:cardId/members` | Remove member from card |

## Labels

### Schema
`server/src/db/schema/labels.ts` — `labels` and `card_labels` tables.
- Labels are board-scoped (boardId FK)
- card_labels is a junction table

### Routes
Labels CRUD is in board routes. Card-label toggling is done via card update/member routes.

## Drag-and-Drop

### Client Implementation
Uses `@dnd-kit/core` and `@dnd-kit/sortable`:
- Lists are horizontally sortable within the board
- Cards are vertically sortable within lists and draggable between lists
- The `boardStore` handles optimistic updates to positions

### Position Calculation
`server/src/utils/position.ts`:
- `getNextPosition(lastPos)` — returns `lastPos + 65536` (appending)
- `getMiddlePosition(before, after)` — returns midpoint (inserting between)
- `renumberPositions(count)` — returns evenly spaced positions (rebalancing)

Gap constant: 65536. Supports millions of reorders before precision issues.

### Board Data Loading
The main data endpoint `GET /boards/:boardId/lists` returns all lists with nested cards, labels, and member assignments — everything needed to render the board in one request.

## Client State

`client/src/stores/boardStore.ts` (Zustand) manages:
- Current board, lists, cards, labels, members
- CRUD operations for all entities
- Card filtering (by label, by member)
- Drag-and-drop state and optimistic position updates
- Calls API endpoints and updates local state

## Filtering

Cards can be filtered by:
- Label IDs
- Member/assignee IDs

Filter state lives in `boardStore`. The `FilterBar` component provides the UI.
