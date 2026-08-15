---
name: engineering-standards
description: Global engineering standards for Chess Managers frontend, backend, database, testing, security, migrations, and AI-assisted development. Use for every implementation task.
---

# Engineering Standards

## Stack

- Frontend: existing JavaScript SPA architecture and Vite/React project.
- Backend: Node.js + Express.
- Database: PostgreSQL.
- Validation: Zod on every incoming request endpoint.
- IDs: Use the project's established prefixed TEXT id strategy consistently (e.g. 'player_' + md5(...), 'match_' + md5(...)) — not UUIDs. Zod schemas should validate these as non-empty strings, not z.string().uuid().
- SQL/database access: use the existing database abstraction; do not introduce a second ORM/query abstraction without approval.

## Architecture

Frontend should follow:

`pages -> hooks/api -> components -> shared UI`

Backend should follow:

`route -> middleware -> controller -> service/model -> database`

Keep business rules out of route files. Keep SQL/database writes out of React components.

## Transactions

Any multi-step operation that changes related records must run in an ACID transaction. Examples:
- recording a rated match plus updating ratings/history/statistics
- approving a player link
- unlinking a player when related records must change
- changing club ownership
- editing/voiding a historical match plus recalculation

## Validation and authorization

- Validate all external input with Zod.
- Verify authentication before protected operations.
- Verify the user's membership in the requested club.
- Verify the target record belongs to the requested club.
- Verify the user's club-specific role before privileged operations.
- Never trust clubId/playerId/userId relationships supplied by the client.

## API conventions

Prefer resource-oriented routes and consistent JSON response shapes. Do not duplicate endpoint paths in components. Keep URLs in feature API modules.

## Database

- Use migrations as the authoritative schema history.
- Do not create one-off schema scripts for permanent changes.
- Use soft deletes for entities governed by the product contract.
- Add appropriate indexes for club-scoped lookups, active records, foreign keys, timestamps, and unique business rules.
- Preserve historical match/rating data.

## Testing

Required before a feature is considered done:
- unit tests for pure business logic
- API integration tests for protected and permission-sensitive endpoints
- regression tests for discovered bugs
- transaction/recalculation tests for rating-affecting operations

For rating code, test boundary values, draws, wins/losses, provisional/established thresholds, category isolation, rating floor, and chronological recalculation.

## AI scope rule

Agents may not expand product scope unless explicitly authorized by the user or required to satisfy an existing specification. Implementation details may be improved, but new features, workflows, entities, or business rules require explicit approval.
