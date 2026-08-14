---
name: club-statistics
description: Build club-level dashboards and statistics such as membership counts, active players, games played, top players, recent activity, category breakdowns, and club-specific aggregates.
---

# Club Statistics

All statistics are scoped to one club.

Typical dashboard data:
- total members
- active players
- games played
- games by category
- top players by selected category
- recent matches
- pending admin actions

Do not mix statistics between clubs, even when the same user belongs to both.

Prefer database aggregation or materialized/derived queries over fetching entire rosters into the frontend.

Use consistent definitions of:
- active member
- active player
- rated game
- total game
- current period

Never silently change metric definitions.
