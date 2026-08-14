---
name: authentication
description: Implement and maintain Chess Managers user authentication, account lifecycle, email verification, password reset, and Google OAuth while keeping global account data separate from club-specific chess data.
---

# Authentication

## Account model

Required global account fields:
- email
- password credential or OAuth identity
- global username
- full name

Email is mandatory.

## Supported flows

- Register with email/password.
- Email verification.
- Login.
- Password reset.
- Google OAuth.
- Logout/session invalidation.

## Rules

- Authentication identifies a global user account only.
- Never store club role, player rating, or player identity as global user properties unless it is a derived convenience value.
- Club membership and player linking must be resolved from club-scoped records.
- Account deletion is a soft delete and must preserve historical club/chess data.

## Security

- Hash passwords using the established secure password hashing implementation.
- Never return password hashes or secrets to clients.
- Validate credentials and tokens server-side.
- Rate-limit authentication endpoints.
- Keep OAuth identity records separate from club membership.

## Tests

Test registration, duplicate email/username, verification, invalid credentials, reset flow, OAuth identity linking, logout, and deleted-account behavior.
