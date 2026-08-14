---
name: data-import-export
description: Implement CSV export and future controlled import flows for players, match history, and ratings while preserving club scoping and validation.
---

# Data Import/Export

## Export

Current product scope includes CSV export for:
- player rosters
- match history
- current ratings

Exports must be club-scoped and permission-checked.

## Import

Do not add import functionality unless explicitly authorized. If later enabled, imports must:
- validate every row
- produce a preview/error report
- execute database writes transactionally when appropriate
- never bypass role/club authorization
- preserve historical integrity
