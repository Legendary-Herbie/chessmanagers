---
name: leaderboard
description: Implement club leaderboards with one table and independent Blitz, Rapid, and Classical ranking dimensions, active-player eligibility, deterministic sorting, and responsive presentation.
---

# Leaderboard

## Structure

Use one leaderboard table/UI with side-by-side columns:
`Rank | Player | Blitz | Rapid | Classical | Total Games`

Ranking is independent by category. Never invent or compute a combined rating unless explicitly specified.

The selected category determines which rank is shown. The table may present all three ratings while rank is category-specific.

## Eligibility

A player is eligible for a category leaderboard when:
- player is not soft-deleted
- player belongs to the club
- player has at least one rated match in that category

Linked and unlinked players are equally eligible.

## Sorting

Use deterministic ordering for a selected category:
1. displayed/rounded rating descending
2. raw rating descending
3. category score/win rate descending
4. rated category games descending
5. full name ascending

Use the exact product definition for tie-breaking; do not add hidden criteria.

## Performance

Prefer server-side sorting/pagination for large rosters. Preserve club/category filters in URLs where appropriate.

## Privacy

Public leaderboard access depends on club visibility. Private club data must never leak through public endpoints.

## Responsive UI

On small screens, convert dense tables to cards while retaining category switching and rank clarity.
