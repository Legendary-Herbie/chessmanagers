---
name: product
description: Master product contract for Chess Managers. Use when implementing or changing any feature, domain model, workflow, permission, API, page, or business rule. Treat this skill as the source of truth and do not invent product behavior.
---

# Chess Managers Product Contract

Chess Managers is a multi-tenant web application for chess clubs to manage members, player identities, rated over-the-board matches, category-specific ratings, leaderboards, tournaments, announcements, and club operations.

## Non-negotiable product rules

- All chess data is club-specific.
- A user can belong to multiple clubs and can have different player identities and ratings in each club.
- A user may have at most one linked player per club.
- A player belongs to exactly one club.
- An unlinked player may participate in matches and appear on leaderboards once eligible.
- Ratings are independent by club and by category.
- Rating categories are Blitz, Rapid, and Classical.
- A match changes only the rating for its own category.
- The rating engine is Elo, not Glicko-2.
- Match date (`played_at`) is mandatory and controls chronological rating order.
- Admins are the only users who directly record, edit, void, delete, or re-categorize matches.
- All significant events may generate notifications according to club notification settings.
- There is no dispute workflow. Members report match problems directly to admins.
- All actions and permissions are club-specific.
- Do not expand scope unless explicitly authorized or required by an existing specification.

## Global vs club data

Global account data includes authentication and account identity. Club-specific data includes memberships, roles, player identity, links, ratings, matches, statistics, tournaments, announcements, notifications, permissions, and settings.

## Required implementation behavior

Before changing code:
1. Identify the domain involved.
2. Read the relevant domain skill.
3. Check dependencies with this product contract.
4. Preserve existing data and API contracts unless the task explicitly changes them.
5. Prefer existing abstractions over creating parallel implementations.
6. Do not silently invent missing business rules. Ask when a requirement is genuinely unspecified.

## Core flow

User registration -> find/request/join club -> active membership -> create or claim player -> player participates in club matches -> category-specific rating changes -> category-specific leaderboard updates -> player statistics/history update.

## Technical expectation

Business rules must be enforced by the backend even when the frontend hides UI actions. UI restrictions are not security boundaries.
