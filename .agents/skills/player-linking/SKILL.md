---
name: player-linking
description: Implement and maintain the player-to-user linking system, claims, approvals, rejection, self-unlink, admin unlink, uniqueness constraints, and club-scoped identity relationships.
---

# Player Linking

Use Model B: a dedicated `player_links` relationship is the authoritative link between users and players.

## Invariants

- One player can have at most one linked user in a club.
- One user can have at most one linked player in a club.
- A player belongs to one club.
- A user can have different linked players in different clubs.
- Historical matches/ratings never depend on the existence of a live user link.

## Claim flow

`UNLINKED -> CLAIM_PENDING -> LINKED`

Claim rejection:
`CLAIM_PENDING -> UNLINKED`

Unlink:
`LINKED -> UNLINKED`

## Claim submission

Only an active club member may claim an unlinked player.
Verify:
- target player belongs to the same club
- target player is not soft-deleted
- target player has no active link
- requesting user has no other linked player in that club
- no conflicting active claim exists

## Approval

Approval must be atomic and protected against races. Lock or otherwise serialize the target player/link records. Re-check all uniqueness conditions inside the transaction before committing.

## Self-unlink

A linked player may request self-unlink according to the product rule. Preserve all historical data.

## Admin unlink

An authorized club admin may force unlink. This is club-specific.

## Security

Never allow a user to claim a player from another club by changing IDs in the request.
