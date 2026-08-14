---
name: players
description: Implement the club player roster, player identity, player profiles, statistics, editing, activation, soft deletion, roster views, and player-specific UI/API behavior.
---

# Players

## Player identity

A player is a chess identity owned by exactly one club. A player may exist without a user account.

Required:
- player_id
- club_id
- full_name

Optional/admin-controlled:
- date_of_birth
- federation_id
- photo_url
- bio

## Linked vs unlinked

Unlinked player:
- user relationship is absent
- can participate in matches
- can have ratings/statistics
- can appear on eligible leaderboards

Linked player:
- one user account is associated with the player through `player_links`
- the linked user may manage permitted self-profile fields

## Editing

Linked users may edit avatar/photo and bio.
Official identity fields (name, date of birth, federation ID) are admin-controlled.

## Deletion

Use soft delete. A deleted player cannot participate in new matches and is excluded from active roster/leaderboards, but historical matches and rating history remain intact.

## Statistics

Category-specific stats are based on rated matches in the same club/category:
- total matches
- wins
- draws
- losses
- weighted win rate
- current win streak
- current loss streak
- current rating
- peak rating

Combined stats may aggregate categories only where the product explicitly requests it.

## Profile

Player profile should surface:
- identity
- club
- linked status where appropriate
- Blitz/Rapid/Classical ratings
- category statistics
- match history
- rating history
- head-to-head where implemented

Do not leak private user account information through player profiles.
