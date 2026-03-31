# Mello

Trello-inspired collaborative task management app with real-time sync.

## Tech Stack

- **Monorepo**: npm workspaces (`packages/shared`, `server`, `client`)
- **Server**: Fastify 5, Drizzle ORM, PostgreSQL 16, Redis 7, Socket.IO, Zod, Argon2, TypeScript
- **Client**: React 18, Vite, Zustand, dnd-kit, Socket.IO client, Tailwind CSS, TypeScript
- **Shared**: TypeScript types, Zod schemas, constants (events, roles, colors)
- **Testing**: Vitest on both sides; server uses Supertest, client uses React Testing Library

## Development

```bash
make up-dev          # Start Postgres + Redis via Docker
make install         # npm install (all workspaces)
make dev-server      # tsx watch server
make dev-client      # vite dev client
make migrate         # drizzle-kit migrate
make seed            # seed database
```

Server runs on port 3000 (configurable via `PORT` env). Client Vite dev server proxies `/api` to it.

## Environment

Copy `.env.example` to `.env`. Key vars: `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `STORAGE_PATH`.
Config is validated with Zod in `server/src/config.ts`.

## Project Structure

```
packages/shared/src/
  types/          # TypeScript interfaces for all domain entities
  schemas/        # Zod validation schemas
  constants/      # WS_EVENTS, WORKSPACE_ROLES, BOARD_ROLES, label colors

server/src/
  db/schema/      # Drizzle table definitions (13 schema files)
  db/migrations/  # Drizzle-kit generated SQL migrations
  routes/         # Fastify route handlers (one file per domain)
  plugins/        # auth (sessions), socket (Socket.IO)
  middleware/     # requireAuth, requireWorkspaceRole, requireBoardRole, validateBody
  utils/          # errors, broadcast, position, activity, notifications
  tests/          # Vitest integration tests (requires running Postgres)

client/src/
  pages/          # LoginPage, RegisterPage, HomePage, WorkspacePage, BoardPage
  components/     # board/, card/, common/, notifications/, search/
  stores/         # Zustand: authStore, boardStore, searchStore, notificationStore, settingsStore
  hooks/          # useSocket, useBoardSync, useKeyboardShortcuts
  api/            # HTTP client utilities
```

## Key Conventions

- All API routes prefixed with `/api/v1/`
- UUID primary keys via Postgres `gen_random_uuid()`
- Fractional positioning (gap=65536) for list/card ordering — see `server/src/utils/position.ts`
- Custom error classes (`AppError` hierarchy) in `server/src/utils/errors.ts`
- WebSocket events defined in `packages/shared/src/constants/events.ts` as `WS_EVENTS`
- Role constants in `packages/shared/src/constants/roles.ts`
- Request validation via Zod schemas + `validateBody` middleware
- Session auth via HTTP-only cookies (`mello_session`), 7-day TTL

## Testing Caution

**Server tests truncate all database tables.** They use a cloned `mello_test` schema (see `server/src/tests/globalSetup.ts`) but still require a running Postgres instance. Always confirm before running server tests.
