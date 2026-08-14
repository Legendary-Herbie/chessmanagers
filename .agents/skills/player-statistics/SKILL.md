---
name: player-statistics
description: Implement category-specific player statistics, rating history, peak ratings, streaks, win rates, match history, and head-to-head calculations for Chess Managers.
---

# Player Statistics

## Scope

Statistics are club-specific and category-specific unless explicitly marked combined.

## Core statistics

For each rating category:
- total rated matches
- wins
- draws
- losses
- weighted win rate
- current rating
- peak rating
- current win streak
- current loss streak

Weighted win rate:
`(wins + 0.5 * draws) / total rated matches * 100`

## Streaks

Current win streak:
- consecutive wins only
- reset by loss or draw

Current loss streak:
- consecutive losses only
- reset by win or draw

Only rated matches in the same category count.

## Head-to-head

Provide overall and category-specific records:
- games
- wins
- draws
- losses

## Rating charts

Rating history should use recorded snapshots and never recreate historical data using current configuration alone.

## Performance

Derived statistics may be computed from authoritative match/rating history. Avoid storing redundant counters unless the system needs them for performance and maintains them transactionally.
