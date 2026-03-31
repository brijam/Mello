# Real-Time Communication

## Server Setup

`server/src/plugins/socket.ts` — Fastify plugin, depends on auth plugin.

Creates a Socket.IO `Server` attached to the Fastify HTTP server. Decorated as `fastify.io`.

### Authentication
Socket connections are authenticated via the session cookie:
1. Parse `cookie` header from WebSocket handshake
2. Extract `mello_session` value
3. Validate via `getSessionUserId()` (imported from auth plugin)
4. Store `userId` in `socket.data.userId`
5. Reject with error if no valid session

### Room Model
Board-based rooms: `board:<boardId>`

Client events:
- `board:join` — client sends boardId, server verifies board membership before joining the room
- `board:leave` — client sends boardId, server leaves the room

Graceful shutdown: `onClose` hook calls `io.close()`.

## Broadcasting

`server/src/utils/broadcast.ts`:

```typescript
broadcast(io, boardId, event, data, excludeSocketId?)
```

- Emits to room `board:<boardId>`
- Optionally excludes a socket (typically the sender, to avoid echo)
- Called from route handlers after mutations

## WebSocket Events

Defined in `packages/shared/src/constants/events.ts` as `WS_EVENTS`:

### Client -> Server
| Event | Constant | Payload |
|-------|----------|---------|
| `board:join` | `JOIN_BOARD` | boardId string |
| `board:leave` | `LEAVE_BOARD` | boardId string |

### Server -> Client: Board Events
| Event | Constant | When |
|-------|----------|------|
| `board:list-created` | `LIST_CREATED` | List added |
| `board:list-updated` | `LIST_UPDATED` | List renamed/repositioned |
| `board:list-deleted` | `LIST_DELETED` | List removed |
| `board:list-reordered` | `LIST_REORDERED` | List positions recalculated |
| `board:card-created` | `CARD_CREATED` | Card added |
| `board:card-updated` | `CARD_UPDATED` | Card fields changed |
| `board:card-moved` | `CARD_MOVED` | Card moved between lists/positions |
| `board:card-deleted` | `CARD_DELETED` | Card removed |
| `board:label-created` | `LABEL_CREATED` | Label added to board |
| `board:label-updated` | `LABEL_UPDATED` | Label name/color changed |
| `board:label-deleted` | `LABEL_DELETED` | Label removed |
| `board:member-added` | `MEMBER_ADDED` | Member added to board |
| `board:member-removed` | `MEMBER_REMOVED` | Member removed from board |

### Server -> Client: Card Detail Events
| Event | Constant | When |
|-------|----------|------|
| `card:comment-added` | `COMMENT_ADDED` | Comment posted |
| `card:comment-updated` | `COMMENT_UPDATED` | Comment edited |
| `card:comment-deleted` | `COMMENT_DELETED` | Comment removed |
| `card:checklist-updated` | `CHECKLIST_UPDATED` | Any checklist/item change |
| `card:attachment-added` | `ATTACHMENT_ADDED` | File uploaded |
| `card:attachment-deleted` | `ATTACHMENT_DELETED` | Attachment removed |

### Server -> Client: User Events
| Event | Constant | When |
|-------|----------|------|
| `user:notification` | `NOTIFICATION` | New notification for user |

## Client Hooks

### `useSocket` (`client/src/hooks/useSocket.ts`)
Manages the Socket.IO client connection. Connects on mount, disconnects on unmount. Provides the socket instance.

### `useBoardSync` (`client/src/hooks/useBoardSync.ts`)
Listens for all board-level and card-detail WebSocket events. Updates the `boardStore` state in response to real-time changes from other users. Joins/leaves board rooms on board navigation.

## Pattern: Route Handler Broadcasting

Typical flow in a route handler:
1. Validate request + auth
2. Perform database mutation
3. `broadcast(app.io, boardId, WS_EVENTS.CARD_UPDATED, updatedCard)`
4. Return response to the requesting client

The requester gets the response via HTTP; other board members get the update via WebSocket.
