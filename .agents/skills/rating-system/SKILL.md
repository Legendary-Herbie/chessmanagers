---
name: rating-system
description: Implement the Chess Managers Elo engine, club-specific rating configuration, Blitz/Rapid/Classical independence, rating history, peak ratings, provisional K-factors, rating floors, and chronological recalculation pipeline.
---

# Rating System

## Algorithm

Chess Managers uses **Elo**, not Glicko-2.

Each player has three independent ratings per club:
- Blitz
- Rapid
- Classical

A match changes only the rating for its selected category.

## Default configuration

These are defaults, not global hard-coded constants:
- initial rating = 1200.0
- rating floor = 100.0
- established K-factor = 16
- provisional K-factor = 32
- provisional games = 30

The club may configure:
- K-factor
- provisional K-factor
- provisional-games threshold
- other rating settings only when explicitly supported

Configuration is stored per club and category.

## Elo calculation

For white rating `Rw` and black rating `Rb`:

`Ew = 1 / (1 + 10^((Rb - Rw) / 400))`
`Eb = 1 / (1 + 10^((Rw - Rb) / 400))`

Actual score:
- white win: Sw=1, Sb=0
- black win: Sw=0, Sb=1
- draw: Sw=0.5, Sb=0.5

`Rw' = max(100, Rw + Kw * (Sw - Ew))`
`Rb' = max(100, Rb + Kb * (Sb - Eb))`

Each player's K is selected independently using their completed rated games count in that specific category.

## Precision

Store ratings as PostgreSQL `DOUBLE PRECISION`.
Display ratings rounded with standard `Math.round()` behavior.
Never round intermediate calculations.

## Rating history

Persist before/after snapshots for each rated match and category. Rating history must allow chronological reconstruction.

## Peak rating

Peak rating is the maximum recorded rating from Game 1 through the present. Use rating-history snapshots, not a synthetic game-zero value.

## Recalculation

Trigger asynchronous recalculation when a historical match is:
- edited
- deleted
- voided/frozen where rating inclusion changes
- re-categorized
- result-modified
- backdated

Pipeline:
1. enqueue affected club/category
2. serialize conflicting jobs for the same club/category
3. open an ACID transaction for the replay write phase
4. restore state immediately before the affected `played_at`
5. replay active rated matches in strict `played_at ASC, id ASC` order
6. update rating snapshots/history and game counters
7. update peak ratings and leaderboard materialization/queries as required
8. commit

Do not allow concurrent recalculations for the same club/category to overwrite each other.

## Category isolation

A Blitz replay must not mutate Rapid or Classical ratings.

## Club isolation

A user's ratings in Club A must never be used to calculate Club B ratings.

## Tests

Test:
- equal ratings
- upset wins
- draws
- floor behavior
- provisional threshold boundaries (30 vs 31)
- different K-factors by player
- category isolation
- club isolation
- backdated games
- edits/deletes/re-categorization
- deterministic replay
