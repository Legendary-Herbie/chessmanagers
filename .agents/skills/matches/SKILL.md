---
name: Matches
description: Implements match CRUD, filtering, searching, and permissions.
---

# Matches

## When to use

Use when working inside:

- MatchesPage.jsx
- Match API
- Match services

## Rules

Admins may:

- Create matches
- Edit matches
- Delete matches

Members:

- View only

## UI

Matches support:

- Search
- Player filter
- Match type filter
- Time control filter

Prefer modal dialogs.

Refresh data after every mutation.

## Validation

White player cannot equal Black player.

Outcome is required.

Time control is required.