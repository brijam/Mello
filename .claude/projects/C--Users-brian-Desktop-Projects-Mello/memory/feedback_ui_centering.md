---
name: UI centering and layout expectations
description: User expects UI elements centered in the main content area, not left-aligned in a column. Very strong preference.
type: feedback
---

When user says "center" labels/members in the card detail, they mean the ENTIRE SECTION (heading + content) should be visually centered in the MAIN CONTENT AREA of the card modal — not just `justify-center` on a flex row. The labels and members UI boxes should be prominent, centered blocks in the middle of the card detail view, not small left-aligned sections.

**Why:** User has been asked to fix this multiple times and is extremely frustrated. Previous agents just added `justify-center` to flex containers, which only centers items within their row — the section itself stayed left-aligned in the content column.

**How to apply:** When centering UI elements, center the entire containing section/block, not just the inline items. Use `mx-auto text-center` on the section, or restructure the layout so the content is visually dominant and centered. Always verify centering visually by reading the full component tree.
