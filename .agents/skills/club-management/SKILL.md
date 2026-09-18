---
name: club-management
description: Build and maintain club creation, club identity, visibility, administration, settings, owners, admins, public pages, invites, join codes, and club-scoped operations in Chess Managers.
---

# Club Management

## Club model

A club is an isolated tenant. All club members, players, matches, ratings, tournaments, announcements, notifications, and permissions are scoped to one club.

Registered users may create clubs. Club names do not need to be globally unique; each club has a unique URL slug.

## Visibility

Public clubs:
- appear in public discovery
- expose the public club information defined by the product contract

Private clubs:
- are hidden from discovery/search
- are accessible through a direct invite or join code

Do not leak private club data through APIs, search, autocomplete, error messages, or counts.

## Administration

Club Owner can:
- manage club settings
- assign/revoke admins
- transfer ownership
- delete/archive the club according to product rules

Club Admin can:
- manage members
- manage players
- record/edit/void/delete matches
- approve joins and player claims
- manage announcements and tournaments

Every authorization decision is club-specific.

## Joining

Support both:
- membership request flow
- direct join code/invite flow

Join code is six digits. Successful join-code entry may transition directly to active membership as defined by the membership skill.

## Settings

Rating configuration, notification preferences, visibility, metadata, contacts, affiliations, and club presentation are club-scoped.

## Data integrity

Archiving preserves historical records and prevents new operational activity. Permanent club deletion removes all club-owned records, including memberships, players, matches, ratings, tournaments, announcements, notifications, and uploaded files. Preserve global user accounts and all other clubs. Delete database records atomically and clean up uploads only after commit, with durable retries for failed file removal.
