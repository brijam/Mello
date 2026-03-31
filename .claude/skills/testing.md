# Testing

## Framework
Both client and server use **Vitest**.

## Server Tests

**Location**: `server/src/tests/`

### IMPORTANT: Server tests truncate all database tables
The test setup calls `cleanDatabase()` which runs `TRUNCATE TABLE ... CASCADE` on every table. Always confirm with the user before running server tests.

### Setup Architecture
- **`globalSetup.ts`** — runs once before all tests:
  - Creates an isolated `mello_test` Postgres schema (drops and recreates it)
  - Clones all table structures from `public` schema (columns, defaults, constraints, indexes)
  - Recreates foreign key constraints pointing within `mello_test`
  - Recreates search vector triggers for cards and comments
  - On teardown: drops `mello_test` schema
- **`setup.ts`** — test utilities:
  - `buildApp()` — creates a Fastify instance with all routes, stubs Socket.IO (`io.to().emit()` is a no-op)
  - `createTestUser(app, overrides?)` — registers a user via the API, returns `{ user, workspace, cookies }`
  - `injectWithAuth(app, cookies, opts)` — makes an authenticated request via `app.inject()`
  - `cleanDatabase()` — truncates all tables with CASCADE

### Test Files
| File | Covers |
|------|--------|
| `auth.test.ts` | Registration, login, logout, session handling |
| `boards.test.ts` | Board CRUD, members |
| `workspaces.test.ts` | Workspace CRUD, member management |
| `lists-cards.test.ts` | List and card CRUD |
| `checklists.test.ts` | Checklist and item CRUD |
| `comments.test.ts` | Comment CRUD |
| `attachments.test.ts` | File upload/delete |
| `labels-integration.test.ts` | Label CRUD and card-label associations |
| `members-integration.test.ts` | Board/card member management |
| `templates.test.ts` | Board template creation and cloning |
| `backgrounds.test.ts` | Board background updates |
| `copy-move.test.ts` | Card copy and move operations |
| `drag-drop.test.ts` | Drag-and-drop position calculations |
| `search.test.ts` | Full-text search |
| `filters.test.ts` | Card filtering by labels/members |
| `notifications.test.ts` | Notification CRUD |
| `no-body-requests.test.ts` | Empty body handling edge cases |

### Running Server Tests
```bash
cd server && npm test          # single run
cd server && npm run test:watch  # watch mode
```
Requires a running PostgreSQL instance (via `make up-dev`).

### Vitest Config
`server/vitest.config.ts` — sets `globalSetup` to the globalSetup file, configures the `mello_test` schema via `DATABASE_URL` search path or env override.

## Client Tests

**Location**: `client/src/` (co-located with components in `__tests__/` directories)

- Uses **React Testing Library** with **jsdom** environment
- Test setup in `client/src/test/`

### Running Client Tests
```bash
cd client && npm test
```

No database or server required — client tests mock API calls.
