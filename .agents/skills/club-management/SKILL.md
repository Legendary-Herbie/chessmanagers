---
name: Club Management
description: Implements club profile editing,permissions, member management, and invite links.
---

# Club Management

## When to use

Use for:

- ClubPage.jsx
- Club API
- Membership logic

## Permissions

Owner:

- Full access

Admin:

- Manage members
- Edit club
- Generate invite links

Member:

- Read-only

## Rules

Never allow:

- Removing the owner
- Removing yourself

Always validate permissions server-side.

Invite links are visible only to admins.