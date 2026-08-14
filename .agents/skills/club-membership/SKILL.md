---
name: club-membership
description: Implement the complete club membership lifecycle, join requests, invites, join codes, rejection cooldowns, revocation, rejoining, and club-specific membership permissions.
---

# Club Membership

## States

`PENDING_APPROVAL` -> waiting for admin approval.
`ACTIVE_MEMBER` -> active club member.
`REJECTED` -> join request rejected; user may reapply after the cooldown.
`REVOKED` -> member left or membership was revoked; can rejoin through request or invite.

## Transitions

Request join:
- create PENDING_APPROVAL
- prevent duplicate pending requests

Approve:
- PENDING_APPROVAL -> ACTIVE_MEMBER
- create notification according to club settings

Reject:
- PENDING_APPROVAL -> REJECTED
- set rejection timestamp
- block reapplication for 7 days

Join code/invite:
- valid code/invite may move an eligible user directly to ACTIVE_MEMBER
- reject rules must still be enforced

Leave:
- ACTIVE_MEMBER -> REVOKED
- preserve player, matches, ratings, and history

## Rejoin

REVOKED users are club-specific and may return via request or invite when permitted by the club's rules/admin.

## Player setup after joining

After membership becomes active, the user may:
1. create a new player profile, or
2. claim an existing unlinked player.

A user may remain an active club member without a linked player.

## Permissions

Membership status and club role must be checked on every protected club request. Never infer active membership from a player link alone.
