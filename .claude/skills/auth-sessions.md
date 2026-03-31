# Authentication & Sessions

## Session Management

Implemented in `server/src/plugins/auth.ts` as a Fastify plugin.

- **In-memory session store** (Map-based; comment says swap for Redis in production)
- Session ID generated via `nanoid(32)`
- Cookie: `mello_session`, HTTP-only, SameSite=lax, secure if BASE_URL is https
- **TTL: 7 days** (refreshed on every active request)
- Expired sessions cleaned every 10 minutes

### Plugin Decorations

- `request.userId` — set to the authenticated user's UUID (or null) on every request
- `fastify.createSession(reply, userId)` — creates session + sets cookie
- `fastify.destroySession(request, reply)` — deletes session + clears cookie
- `getSessionUserId(sessionId)` — exported function, used by socket plugin for WebSocket auth

## Auth Routes

`server/src/routes/auth.ts` — prefix `/api/v1/auth`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Creates user + personal workspace, sets session cookie. Returns `{ user, workspace }` |
| POST | `/login` | Verifies email/password with Argon2, sets session cookie. Returns `{ user }` |
| POST | `/logout` | Destroys session, clears cookie |
| GET | `/me` | Returns current user (requires auth) |
| PATCH | `/me/avatar` | Updates avatar URL (requires auth) |

Password hashing uses **Argon2** (`argon2.hash` / `argon2.verify`).

## Auth Middleware

`server/src/middleware/auth.ts` provides Fastify preHandler hooks:

- **`requireAuth`** — throws `UnauthorizedError` if `request.userId` is null
- **`requireWorkspaceRole(...roles)`** — checks workspace membership + role. Reads `workspaceId` from route params.
- **`requireBoardRole(...roles)`** — checks board membership + role. Reads `boardId` from route params.
- **`requireBoardRoleViaCard(...roles)`** — looks up the card's boardId first, then checks board membership. Reads `cardId` from route params.

## Role System

Defined in `packages/shared/src/constants/roles.ts`:

**Workspace roles**: `owner`, `admin`, `member`
**Board roles**: `admin`, `normal`, `observer`

Roles are used in middleware guards and stored in junction tables (`workspace_members.role`, `board_members.role`).

## Request Validation

`server/src/middleware/validate.ts` — `validateBody(zodSchema)` middleware:
- Parses `request.body` through a Zod schema
- Replaces `request.body` with the parsed result (strips unknown fields)
- Throws `ValidationError` on failure with joined error messages

## Client-Side Auth

`client/src/stores/authStore.ts` (Zustand):
- `user` state + `loading` flag
- `fetchMe()` — called on app mount, restores session from cookie
- `login(email, password)`, `register(...)`, `logout()`
- `updateAvatar(avatarUrl)`

`client/src/App.tsx` wraps protected routes in `<ProtectedRoute>` which redirects to `/login` if no user.

## WebSocket Auth

Socket.IO connections are authenticated in `server/src/plugins/socket.ts`:
1. Parse cookie header from WebSocket handshake
2. Extract `mello_session` cookie value
3. Call `getSessionUserId()` to validate
4. Store `userId` in `socket.data.userId`
