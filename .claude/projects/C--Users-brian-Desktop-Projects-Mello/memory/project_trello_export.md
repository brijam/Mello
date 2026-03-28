---
name: Trello Export Strategy
description: Plan to use trello-full-backup (Python) to export user's Trello data for import into Mello
type: project
---

Use `trello-full-backup` (github.com/jtpio/trello-full-backup) to export all Trello data. Then write a custom import script for Mello's database.

**Key details:**
- User needs API key + read-only token from trello.com/app-key
- Rate limit: 100 req/10s per token
- Attachment download URLs are time-limited
- Actions endpoint caps at 1000/request (paginate with `before`)
- Deleted cards are gone; archived cards are included
- May need supplemental script for deep activity history pagination

**How to apply:** Build the Trello import as a standalone script/tool within the Mello project.
