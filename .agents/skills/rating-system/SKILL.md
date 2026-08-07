---
name: Rating System
description: Implements ELO calculations, rating recomputation, and time-control-specific rating ladders.
---

# Rating System

## When to use

Use this skill whenever you:

- Create a match
- Edit a match
- Delete a match
- Display ratings
- Rebuild player statistics
- Implement leaderboard logic

## Requirements

Each player owns three independent ratings:

- Blitz
- Rapid
- Classical

A match only affects the selected time-control ladder.

Editing or deleting a match must never mutate ratings directly.
Editing or deleting a match must always trigger a full rating recalculation on the affected time-control ladder.

Instead:

1. Sort matches chronologically.
2. Filter by time control.
3. Reset every player's rating to the default.
4. Replay every match.
5. Persist new ratings.

Never partially recalculate ratings.

## Validation

- White and Black players must differ.
- Ignore deleted matches.
- Preserve chronological order.