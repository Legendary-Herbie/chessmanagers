---
name: Leaderboard
description: Implements ranking, statistics, and player rating history.
---

# Leaderboard

## When to use

Use inside:

- LeaderboardPage.jsx
- Player profile
- Rating history

## Rules

Sort:

Rating DESC

Display:

- Rank
- Name
- Rating
- Games
- Wins
- Draws
- Losses
- Win rate

## Rating History

Do not render sparklines inside the leaderboard.

Only render them inside:

- Player modal
- Player profile

Load rating history lazily.