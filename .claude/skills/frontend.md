# Frontend

## Tech Stack
- **React 18** with TypeScript
- **Vite** (dev server + build)
- **Tailwind CSS 3** (utility-first styling)
- **Zustand** (state management)
- **React Router v6** (client-side routing)
- **dnd-kit** (drag-and-drop: `@dnd-kit/core`, `@dnd-kit/sortable`)
- **Socket.IO client** (real-time sync)
- **marked** + **DOMPurify** (Markdown rendering in card descriptions)

## Pages

| Page | Route | Purpose |
|------|-------|---------|
| `LoginPage` | `/login` | Email/password login form |
| `RegisterPage` | `/register` | Registration form |
| `HomePage` | `/` | Redirects to user's first workspace |
| `WorkspacePage` | `/w/:workspaceId` | Workspace dashboard with board list |
| `BoardPage` | `/b/:boardId` | Main board view with lists and cards |

All pages except login/register are wrapped in `<ProtectedRoute>` which checks `authStore.user`.

## Component Organization

```
client/src/components/
  board/          # Board-level: List, Card, AddList, AddCard, FilterBar,
                  #   TemplateCard, MoveListDialog, MoveAllCardsDialog
  card/           # Card detail modal: CardDetail, CardChecklist, CardComments,
                  #   CardAttachments, LabelPicker, MemberPicker, CopyCardDialog
  common/         # Shared: Modal, AvatarUpload, FontSizeSelector, KeyboardShortcutsHelp
  notifications/  # NotificationBell
  search/         # SearchBar
```

## Zustand Stores

| Store | File | Manages |
|-------|------|---------|
| `authStore` | `stores/authStore.ts` | User session, login/register/logout, avatar |
| `boardStore` | `stores/boardStore.ts` | Board, lists, cards, labels, members, filtering, drag-drop |
| `searchStore` | `stores/searchStore.ts` | Search query, results, loading state |
| `notificationStore` | `stores/notificationStore.ts` | Notification list, unread count, mark-as-read |
| `settingsStore` | `stores/settingsStore.ts` | User preferences (font size, theme) |

`boardStore` is the largest store — it handles all CRUD for lists, cards, labels, and members, plus card filtering and drag-and-drop optimistic updates.

## Custom Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useSocket` | `hooks/useSocket.ts` | Manages Socket.IO connection lifecycle |
| `useBoardSync` | `hooks/useBoardSync.ts` | Listens for WebSocket events and syncs boardStore |
| `useKeyboardShortcuts` | `hooks/useKeyboardShortcuts.ts` | Global keyboard shortcut handling |

## API Client

`client/src/api/` contains HTTP client utilities for making requests to the `/api/v1/` endpoints. Stores call these internally.

## Drag-and-Drop

Uses `@dnd-kit/core` and `@dnd-kit/sortable`:
- Board page sets up `DndContext` with sensors and collision detection
- Lists are horizontally sortable containers
- Cards are vertically sortable within lists and draggable between lists
- `boardStore` applies optimistic position updates immediately, then syncs with server
- Drop indicators show where items will land

## Styling

- Tailwind CSS 3 with PostCSS + Autoprefixer
- Config: `client/tailwind.config.js`
- Global styles: `client/src/styles/`
- Font size is user-configurable via `settingsStore` — sets `<html>` root font size so all rem units scale

## Testing

- **Vitest** with **React Testing Library** and **jsdom**
- Test files in `client/src/` near their subjects (e.g., `__tests__/` directories)
- Run: `cd client && npm test` (or `npx vitest run`)
