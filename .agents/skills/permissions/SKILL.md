---
name: permissions
description: Enforce the Chess Managers club-specific permission matrix across frontend and backend, including owner/admin/member/linked-player behavior and resource ownership validation.
---

# Permissions

## Roles/states

Core club roles:
- Owner
- Admin
- Member

Linked Player is a relationship/state, not a global role.

## Rules

All permissions are club-specific.

Guest:
- public content only

Member:
- view authorized club leaderboards/matches
- claim an unlinked player
- receive eligible announcements/notifications

Linked Player:
- all member permissions
- edit own avatar/photo, bio, federation ID, external chess profile usernames, and unlocked name
- request self-unlink where supported

Admin:
- manage players
- record/edit/void/delete matches
- handle join requests
- handle player claims
- manage tournaments and announcements

Owner:
- all admin permissions
- assign/revoke admins
- transfer ownership
- delete/close club
- lock/unlock player names and edit locked names

## Resource checks

For every protected request verify:
1. authenticated user
2. active eligible membership
3. requested club is the user's club scope
4. target resource belongs to the requested club
5. required role/relationship

Frontend checks are for UX. Backend checks are authoritative.
