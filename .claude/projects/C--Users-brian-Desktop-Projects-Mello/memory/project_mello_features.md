---
name: Mello Feature Set
description: Confirmed feature list for Mello - self-hosted Trello replacement with 2019-era functionality
type: project
---

Mello is a multi-user self-hosted Trello replacement. The user explicitly culled the feature list down from full Trello 2019 to this set:

## Confirmed Features

### Boards
- Create / rename / delete boards
- Board backgrounds (colors / photos)
- Board templates

### Lists
- Create / rename lists
- Drag-and-drop reorder lists
- Copy / move lists between boards
- "Move all cards in this list" action

### Cards
- Create / edit / delete cards
- Card descriptions (Markdown)
- Drag-and-drop between lists and within lists
- Card labels (colored, with text)
- Card members (assign users)
- Card checklists (with progress bar)
- Card attachments (file upload, links)
- Card comments / activity feed
- Card @mentions in comments
- Card copy / move to other boards

### Search & Filter
- Global search across all boards
- Filter cards by label, member

### Members & Permissions
- Invite members to boards
- Member roles: Admin / Normal / Observer
- Workspace member management
- Board-level permission settings

### Notifications
- In-app notifications only (no email — see air-gap constraint)
- @mention notifications (in-app)

### Activity & History
- Per-card activity log
- Comment editing / deletion

### Other
- Keyboard shortcuts
- Drag-and-drop file upload onto cards
- Markdown rendering in descriptions/comments
- Multiple workspaces/organizations

## Explicitly Excluded
Board starring, board visibility settings (all private), archive/close boards, archive lists, archive all cards action, card covers, due dates, checklist item assignment/due dates, card archive/unarchive, card subscribe, card voting, keyboard shortcut search, due date reminders, per-board activity feed, calendar view, card aging, custom fields, Butler automation, compact/detailed toggle, webhooks/API, board activity export.

**Why:** User considers post-2019 Trello features "shite" and wants a lean, focused kanban tool.

**How to apply:** Do not introduce excluded features. Keep the scope tight.
