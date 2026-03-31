# Architecture

## Monorepo Layout

Three npm workspaces managed from the root `package.json`:

| Workspace | Package Name | Purpose |
|-----------|-------------|---------|
| `packages/shared` | `@mello/shared` | Types, Zod schemas, constants shared between client and server |
| `server` | `@mello/server` | Fastify API + WebSocket server |
| `client` | `@mello/client` | React SPA |

Cross-workspace imports use the `@mello/shared` package name (e.g., `import { WS_EVENTS } from '@mello/shared'`).

## Server Bootstrap

Entry point: `server/src/index.ts`

Plugin registration order matters:
1. `@fastify/cors` — origin: true, credentials: true
2. `@fastify/cookie` — cookie parsing
3. `@fastify/multipart` — file uploads, 50MB limit
4. `@fastify/static` — serves `uploads/` directory at `/uploads/`
5. `authPlugin` — session management, decorates `request.userId`
6. `socketPlugin` — Socket.IO server, depends on auth plugin

Routes are registered with prefix `/api/v1/` (auth uses `/api/v1/auth`, workspaces use `/api/v1/workspaces`, all others use `/api/v1`).

Global error handler catches `AppError` subclasses and returns `{ error: { code, message } }`.

Custom content type parser allows empty JSON bodies (prevents 400 on DELETE/POST with no body).

## Client Bootstrap

Entry point: `client/src/App.tsx`

- React Router v6 with `ProtectedRoute` wrapper that checks `authStore.user`
- On mount, calls `fetchMe()` to restore session from cookie
- Font size preference applied to `<html>` root element for rem-based scaling

Routes:
- `/login`, `/register` — public
- `/` — redirects to first workspace (HomePage)
- `/w/:workspaceId` — workspace view
- `/b/:boardId` — board view
- `*` — catch-all redirect to `/`

## Environment Configuration

`server/src/config.ts` validates env vars with Zod:
- `PORT` (default 3000)
- `DATABASE_URL` (default `postgresql://mello:changeme@localhost:5432/mello`)
- `REDIS_URL` (default `redis://localhost:6379`)
- `SESSION_SECRET`
- `BASE_URL` (default `http://localhost:3000`)
- `STORAGE_PATH` (default `./data/attachments`)

## Docker Development

`docker-compose.dev.yml` provides PostgreSQL 16 and Redis 7. Start with `make up-dev`, stop with `make down-dev`.

## Build & Dev Commands

| Command | What it does |
|---------|-------------|
| `make install` | `npm install` all workspaces |
| `make dev-server` | `tsx watch src/index.ts` in server |
| `make dev-client` | `vite` dev server in client |
| `make build` | `npm run build --workspaces` |
| `make migrate` | `drizzle-kit migrate` in server |
| `make seed` | `tsx src/db/seed.ts` in server |

## Error Handling

`server/src/utils/errors.ts` defines an `AppError` hierarchy:
- `NotFoundError` (404) — takes a resource name string
- `ForbiddenError` (403)
- `UnauthorizedError` (401)
- `ConflictError` (409)
- `ValidationError` (400)

The global error handler in `index.ts` maps these to `{ error: { code, message } }` JSON responses.

## Shared Package Exports

`packages/shared/src/index.ts` re-exports:
- `types/*` — TypeScript interfaces for all domain entities
- `schemas/*` — Zod schemas for request validation
- `constants/*` — `WS_EVENTS`, `WORKSPACE_ROLES`, `BOARD_ROLES`, label color constants
