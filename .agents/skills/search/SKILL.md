---
name: search
description: Implement contextual discovery and search across public clubs and in-club players/matches while enforcing club visibility and authorization.
---

# Search

## Public search

Search public clubs only. Private clubs must not be returned.

## In-club search

Within an authorized club, support the entities explicitly enabled by the product:
- players
- matches
- tournaments when later approved

## Security

Every search query must be filtered by the user's accessible club scope before results are returned. Do not use unrestricted global queries that then filter results in the frontend.

## Performance

Use indexed fields and server-side filtering/pagination. Avoid fetching entire club rosters for client-side search in large clubs.
