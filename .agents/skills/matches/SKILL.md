---
name: matches
description: Implement club match recording, match validation, time-control category selection, editing, voiding, soft deletion, tournament links, rating updates, and chronological recalculation triggers.
---

# Matches

## Ownership

Every match belongs to exactly one club and references two players belonging to that same club.

## Entry permissions

Only Club Admin or Owner may directly record matches.

## Required fields

- club_id
- white_player_id
- black_player_id
- result
- rating_category: Blitz | Rapid | Classical
- played_at: required

Optional:
- notes
- tournament_id
- rated/unrated flag
- time-control metadata when implemented

## Validation

Reject:
- players from different clubs
- deleted players
- same player on both sides
- invalid result/category
- unauthorized actor

Warn, but allow confirmation, when the same two players with identical relevant options are entered within 5 minutes.

## Rating interaction

Rated match:
- updates exactly one category
- triggers rating engine inside a transaction
- records before/after rating history

Unrated match:
- remains part of match history/statistics only where the product explicitly includes it
- must not affect ratings

## Editing/voiding/deleting

Admin-only.
- preserve original data through audit snapshots/logs
- use soft deletion
- support voiding with reason and actor
- any change that affects rating chronology queues asynchronous recalculation

## Time

`played_at` controls chronological rating replay.
`created_at` records when the system record was created.
Do not use `created_at` as the game chronology when backdating is possible.

## API behavior

Return updated match state and affected rating information where appropriate. Use consistent error shapes and HTTP status codes.
