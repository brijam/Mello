---
name: TDD process and test coverage expectations
description: User wants extremely thorough TDD with very high test coverage - spec first, tests first, then code
type: feedback
---

User wants a rigorous TDD process: spec agent -> test writer -> code writer -> test runner. "Very, very thorough" and "extremely good test coverage" with "we have time" indicating quality over speed.

**Why:** User encountered bugs (duplicates, label picker, modal close) that better test coverage would have caught. Wants confidence that new features work correctly.

**How to apply:**
- Write detailed specs before any code
- Write failing tests FIRST, then implement to pass
- Test edge cases, error conditions, authorization boundaries
- Don't skip negative tests (invalid input, unauthorized access, not-found cases)
- Run full test suite after every change
- Target near-complete API coverage before moving to next feature
