---
name: No external network access at runtime
description: Mello must never make outbound network requests when running - fully self-contained on one box
type: feedback
---

The running application must never make outbound network requests. Everything runs from one box.

**Why:** Critical user requirement — self-hosted means truly self-contained. No phoning home, no external dependencies at runtime.

**How to apply:**
- No external SMTP/email services — in-app notifications only
- No CDN-hosted fonts, icons, CSS, or JS — all assets bundled locally
- No external image APIs (Unsplash etc.) for board backgrounds — upload only
- No telemetry, analytics, or update checks
- npm packages at build time are fine (bundled into the app, no runtime calls)
- All Docker images must contain everything needed to run offline after initial pull
