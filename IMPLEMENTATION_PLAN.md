# Chess Managers Remediation Implementation Plan

## Purpose

This is the execution plan for bringing the current workspace into compliance with:

- `.agents/skills/product/SKILL.md`
- `.agents/skills/engineering-standards/SKILL.md`
- every domain skill under `.agents/skills`
- the findings from the August 2026 full workspace scan

The plan is ordered by dependency and risk. Tenant isolation, authorization, data
preservation, and rating correctness are release blockers. Feature work that depends
on those foundations must not ship first.

## Current Progress

- Phase 0 foundation is operational: Vitest is split between frontend and backend,
  backend tests require a PostgreSQL database whose name ends in `_test`, migrations
  run before integration tests, application tables are reset between tests, and
  deterministic factories cover the current core schema. Legacy-upgrade fixtures and
  factories for domains that do not yet exist in the schema remain outstanding.
- Phase 1 is complete for the current route surface: protected routes load membership
  and linked-player state from the database; owner/admin checks use `user_clubs.role`;
  the frontend consumes active-club capabilities; route params, queries, and mutation
  payloads have Zod coverage; and public club/player/tournament DTOs enforce visibility
  without leaking account-link or private club fields. Permission regressions cover
  global-role bypass attempts, cross-club access, owner-only role management, linked
  self-edit boundaries, every current admin mutation family, guests, and non-members.
- Phase 2 is complete: the additive, irreversible reconciliation migration backfills
  account, club, membership, player, and club-scoped link fields; maps legacy join
  requests into membership lifecycle rows; replaces destructive historical foreign
  keys; and installs active-row, uniqueness, club-scope, and chronology indexes.
  Runtime models now honor active memberships, club-scoped links, public visibility,
  archived-club read-only behavior, and player soft deletion. The obsolete one-off
  schema scripts are removed. Migration tests cover baseline upgrade, repeat runs,
  rollback policy, cross-club and duplicate-link constraints, lifecycle history, and
  preservation of matches and rating history.
- Phase 3 is complete: `/clubs/mine` now returns all active and historical
  memberships in a canonical `clubs` collection while retaining transitional
  singular fields; `/clubs/:clubId/context` loads an authorized active-club context;
  and existing members may create additional clubs. The client validates a
  user-specific stored club ID against current active memberships, falls back
  deterministically, reloads role/capabilities/linked-player context on selection,
  clears the old context during switches, and exposes an accessible club switcher.
  Integration tests cover different roles and linked players across clubs, revoked
  and archived contexts, second-club creation, and empty membership state; frontend
  tests cover preference validation and stale-context clearing.
- Phase 4 is complete: duplicate names receive collision-safe unique slugs;
  visibility and public-leaderboard policy are independent; metadata, contact,
  affiliation, presentation, notification, and category Elo settings are validated;
  and authenticated management responses are separated from public DTOs. Owner-only
  settings and admin-role controls, locked transactional ownership transfer with audit
  events, and archive/restore/soft-delete lifecycle operations preserve chess history
  while blocking inactive-club mutations. The client exposes supported creation and
  owner controls, archived-club restoration, loading/error states, and club-configured
  1500 rating defaults. Concurrency, lifecycle, privacy, validation, and UI default
  regressions are covered by the test suite.
- Phase 5 is complete: all membership transitions run through one transactional,
  row-locked state model with append-only event history; duplicate requests and the
  exact seven-day rejection cooldown are enforced for requests, invites, and join
  codes; approvals, rejections, leave, revocation, and rejoin preserve player and
  chess history; and owners must transfer ownership before leaving. Six-digit join
  codes are cryptographically generated, HMAC-protected at rest, one-time displayed,
  rotated/revoked by admins, and rate-limited on entry. Approval/rejection
  notifications are persisted in the transition transaction and respect club event
  settings. The client handles pending, rejected-cooldown, revoked, active, leave,
  invite continuation, join-code continuation, and admin queue/code states.
- Phase 6 is complete: player creation, official-identity updates, self-profile edits,
  archive/restore, and soft deletion are validated and transactionally audited. Active
  rosters and leaderboards exclude archived/deleted players while historical profiles,
  matches, and ratings remain intact. Player claims use club-scoped advisory and row
  locks, enforce one active user/player link per club, support rejection/resubmission,
  preserve unlink history, and persist configured approval/rejection/unlink
  notifications. Protected DTOs no longer expose linked user IDs, link routes now have
  a canonical router, and the client separates admin identity controls from member
  bio/photo controls with archive/restore language and actionable claim errors. Player
  photos and club badges use role-checked JPEG/PNG/WebP uploads rather than URL fields.
- Phase 7 is complete: authoritative player state and history are independent for
  Blitz, Rapid, and Classical, with player-specific start ratings, completed-game
  counts, peaks, club/category settings, and temporary legacy-column projections. The
  Elo engine uses independent provisional K-factors, configured floors, final-only
  integer rounding, and no maximum cap. Historical match and settings changes enqueue
  coalesced durable jobs transactionally; a non-blocking worker serializes replay with
  PostgreSQL advisory locks, retries observable failures, preserves snapshots before
  the affected timestamp, and replays ties by match ID. Protected/public leaderboards
  and player profiles now select a category and consume canonical state/history.
  Migration repeatability, deterministic/backdated replay, competing workers,
  recategorization order, deletion, settings changes, and club/category isolation are
  covered by the test suite.
- Phase 8 is complete: matches use mandatory `played_at`, explicit category and rated
  state, active/voided/deleted lifecycle state, and compatibility projections for the
  legacy type/time-control fields. Current rated matches publish snapshots atomically;
  backdated entries and all rating-affecting edits, voids, and deletes enqueue durable
  recalculation for every affected category. Player/club scope, active-player status,
  tournament roster/category/rated settings, and five-minute duplicate confirmation
  are enforced transactionally. Append-only audit events preserve actor, reason, and
  before/after snapshots, while voiding and deletion retain match records and rebuild
  active statistics. The client provides editable chronology, category controls,
  rated state, compatible tournament selection, duplicate confirmation, and accessible
  edit/void/delete flows without native browser dialogs. Migration repeatability,
  validation, permissions, duplicate handling, rated isolation, tournament rules,
  chronology changes, auditing, and rating replay are covered by the test suite.
- Phase 9 is complete: leaderboards now enforce rated-category eligibility and the
  exact server-side rating, weighted-result, game-count, and name tie-break order
  before pagination. Canonical category statistics include W/D/L, weighted win rate,
  current/peak ratings, draw-reset streaks, separate rating history, and overall plus
  category head-to-head totals. Dashboard metrics use documented all-time definitions,
  keep member-safe data separate from admin queues, and reuse leaderboard eligibility
  for category-selectable top players. The client now has a data-fetching dashboard
  container, canonical match/statistics fields, responsive leaderboard cards, and URL-
  persisted category/search/page state. Server integration tests cover eligibility,
  tie-breaks, linked/unlinked parity, weighted draws, streak resets, category isolation,
  pagination, head-to-head totals, and dashboard privacy/definitions; frontend coverage
  verifies leaderboard URL restoration and updates.
- Phase 10 is complete: public-club activity and visibility checks are centralized,
  anonymous public club/player/tournament DTOs are allowlisted, and public players use
  dedicated non-internal identifiers. Private direct pages expose only club identity
  and join eligibility to non-members, while private chess subresources return one
  indistinguishable not-found response for every viewer role. Public discovery is
  visibility-filtered, searchable, paginated, and backed by trigram indexes; authorized
  roster and match searches are validated, club-scoped, server-filtered, and paginated.
  The client includes public club search, top-player presentation, public player and
  tournament routes, and server-driven roster/match search. Access-matrix, DTO privacy,
  cross-club isolation, search, pagination, public-ID, and repeatable-migration tests
  are included.
- Phase 11 is complete: tournaments now support only Swiss and Round Robin creation,
  category-specific rated/unrated play, durable participant/round/pairing state, soft
  archiving, withdrawals, and late registration. Dutch Swiss and Berger pairing are
  deterministic, retry-safe, bye-aware, and transactionally persisted. Tournament
  results flow through the ordinary audited match and Elo pipeline, including safe
  recalculation after corrections, while standings apply match points, Buchholz,
  Sonneborn-Berger, and direct head-to-head in order. The placeholder client pages are
  replaced by searchable event, roster, round, result, and standings workflows with
  admin-only mutations. Golden fixtures, rated/unrated integration, rollback, club
  isolation, lifecycle, public-boundary, and frontend tests are included.
- Phase 12 is complete: global accounts now have distinct case-insensitive usernames,
  full names, verification state, session versions, OAuth identities, and soft deletion.
  Existing accounts are safely grandfathered as verified while new accounts use hashed,
  expiring, one-time email tokens. Access tokens are short-lived; rotating refresh-token
  families are hashed at rest, kept in secure HttpOnly cookies, protected by a
  double-submit CSRF token, and revoked on reuse, password reset/change, logout-all, or
  deletion. Recovery responses resist account enumeration, Google OAuth uses one-time
  state and separate identities when configured, and authentication has dedicated rate
  limits. The client now keeps new access tokens in memory, refreshes sessions through
  cookies, preserves invite continuation, and includes verification, recovery, Google
  callback, session, password, and deletion screens. Lifecycle, expiry, reuse, privacy,
  preservation, OAuth-linking, rate-limit, migration, and frontend tests are included.
- Phase 13 is complete: club-aware notifications now use strict event-specific payload
  allowlists, durable read state, settings and membership eligibility checks, and
  per-user deduplication. Membership decisions, player claims and unlinking, linked-
  player match lifecycle events, tournament registration/pairing/result/withdrawal/
  status events, and admin pending-action alerts are committed with their domain
  transaction. Each in-app record creates an independent email outbox item; the
  asynchronous worker rechecks recipient eligibility and delivery settings, safely
  skips disabled delivery, recovers stale claims, and retries failures without changing
  in-app state. Authenticated APIs provide pagination, unread counts, one/all read
  mutations, and private-club visibility filtering. The application shell now includes
  an accessible persistent notification tray while the existing transient toast state
  remains separate. Eligibility, payload privacy, settings, unread state, retry,
  duplicate protection, migration replay, and tray interactions are covered.
- Phase 14 is complete: announcements are club-scoped, audited, and support draft,
  published, archived, and soft-deleted lifecycle states. Rich HTML is sanitized with
  an explicit element, attribute, and URL-scheme allowlist before storage. Members can
  read only active published announcements, while owners/admins can search and manage
  every active lifecycle state. Publication and eligible-member notifications commit
  atomically and repeated publication is idempotent. JPEG, PNG, WebP, and PDF uploads
  are content-signature checked, size-limited, ownership-scoped, and served only through
  authenticated visibility checks; storage keys never enter client DTOs. A dedicated
  local attachment adapter matches the existing image-storage deployment model and
  isolates the still-pending production-provider decision. The client includes the
  member feed/detail views, rich-text draft editor, safe preview, attachment/image
  controls, and confirmed publish/archive/delete workflows. Club isolation, permissions,
  sanitization, attachment access, lifecycle visibility, publication idempotency,
  notification integration, migration replay, and frontend behavior are covered.
- Phase 15 is complete: player-roster, full match-history, and current-rating CSV
  downloads are club-scoped and restricted to owners/admins in both the API and client
  capability model. Exports use a dedicated serializer with UTF-8 BOM support, stable
  columns and ordering, correct quoting for commas/newlines, explicit category/rated/
  lifecycle fields, and spreadsheet-formula neutralization. Roster and rating exports
  exclude inactive players unless explicitly included; match history preserves active,
  voided, and deleted records. Each export and its filters/row count are recorded in a
  metadata-only audit table inside the same database transaction without retaining CSV
  content. The client provides a role-gated download panel with category and lifecycle
  controls; no import workflow exists and the panel states that import is unavailable.
  Permission, club-isolation, Unicode, escaping, lifecycle, category, large-roster,
  audit, migration replay, and frontend interaction regressions are covered.
- Phase 16 integration cleanup is in progress: canonical player match, statistics,
  rating-history, and head-to-head routes are available without removing transitional
  aliases; page and provider HTTP calls now live behind domain API modules; response
  handling uses canonical fields; and request timeout plus caller-driven cancellation
  are implemented and tested. Obsolete font declarations and the disconnected landing
  placeholder are removed. The public landing page now has a responsive, accessible
  product presentation, and a browser pass verified desktop/mobile layout, navigation,
  and the absence of horizontal overflow or console warnings. This slice passes 33
  frontend tests, 121 backend tests, lint, production build, and diff validation.
- Next: complete Phase 16 workflow-level end-to-end coverage, primary-flow
  accessibility checks, authenticated responsive-table/dialog QA, and the final scan
  against every skill contract.

## Delivery Rules

- Work in small, reviewable feature slices. Each slice includes migrations, backend,
  frontend, and tests when those layers are affected.
- Never modify an already-applied migration as the only fix. Add reconciliation
  migrations that work for both fresh and existing databases.
- Preserve existing IDs, matches, rating history, and membership history.
- Keep temporary API compatibility where practical, but do not preserve an insecure
  or product-invalid behavior.
- Every request body, query object, and route-parameter group gets a Zod schema.
- Every protected club operation resolves the active membership from the database.
- Every multi-record mutation uses `db.transaction()`.
- Every rating-affecting historical change uses the serialized recalculation queue.
- A feature is complete only when its unit, API integration, and relevant end-to-end
  tests pass.

## Release Gates

The application must not be treated as production-ready until all of these are true:

1. No club authorization decision uses `users.role` or a JWT player ID.
2. Private club, player, tournament, leaderboard, and notification data cannot be
   obtained through public endpoints or guessed IDs.
3. Players, matches, memberships, clubs, and user accounts use their specified soft
   lifecycle and preserve historical chess data.
4. A normal UI match entry can create a rated match with an explicit category and
   mandatory `played_at`.
5. Blitz, Rapid, and Classical ratings, histories, statistics, and rankings are
   independent and tested.
6. Fresh-database migrations and legacy-database upgrades produce the same schema.
7. Permission, transaction, rating replay, and cross-club isolation tests pass.

## Phase 0: Characterization and Test Infrastructure

### Goals

- Create a safety net before changing schema and authorization behavior.
- Make tests exercise PostgreSQL and the real Express middleware stack.

### Backend work

- Add a dedicated test environment configuration that never calls `process.exit()`
  from imported modules.
- Add PostgreSQL integration-test setup with isolated schemas or a dedicated test
  database, migration execution, cleanup, and deterministic factories.
- Add factories for users, clubs, memberships, players, links, matches, rating state,
  tournaments, announcements, and notifications.
- Add authenticated Supertest helpers that create users and club memberships without
  bypassing normal authorization checks in the tests under review.
- Add response-shape assertions for the shared API error format.
- Add migration tests for both an empty database and a fixture representing the
  current deployed schema.

### Initial characterization tests

- Global admin versus club admin behavior across two clubs.
- Anonymous access to public and private club resources.
- Current player-link uniqueness behavior across two clubs.
- Current match creation, update, delete, and recalculation behavior.
- Current rating-history response shape.
- Existing join-request and invite transitions.

### Exit criteria

- Tests fail for the known defects and pass after each corresponding feature phase.
- Test failures cannot mutate development or production databases.

## Phase 1: Tenant Authorization and Permission Matrix

### Data and identity changes

- Stop treating `users.role` as a club role. Keep the column temporarily only for
  migration compatibility, then remove or restrict it to a true system role if the
  product later needs one.
- Remove `playerId` and `linkStatus` from the global authenticated-user identity.
- Resolve linked-player state from `(user_id, club_id)` whenever club context matters.

### Backend work

- Replace `requireRole()` for club operations with:
  - `loadClubContext`
  - `requireActiveClubMember`
  - `requireClubRole('owner', 'admin')`
  - `requireClubOwner`
  - `requireLinkedPlayerForResource`
- Make the middleware load the club and membership once and attach a normalized
  `req.clubContext` for downstream controllers.
- Ensure every resource query includes the route `clubId`; do not fetch by resource ID
  globally and compare afterward where a scoped query is possible.
- Update player, link, match, tournament, leaderboard, dashboard, invite, membership,
  announcement, notification, search, and export routes to use club-scoped middleware.
- Remove global role promotion from club creation and player-link approval.
- Split owner-only operations from admin operations exactly as specified.
- Make inactive, archived, or deleted clubs reject new operational mutations.

### Frontend work

- Derive capabilities from the active membership returned by the club-context API.
- Replace every `isAdmin` check based on the global user with capability checks such as
  `canManagePlayers`, `canManageMatches`, and `canManageClubSettings`.
- Keep hidden controls as UX only; backend tests remain authoritative.

### Required tests

- Owner, admin, member, linked player, non-member, and guest against every protected
  route group.
- A user who owns Club A but is a member of Club B cannot administer Club B.
- A Club B admin can administer Club B without receiving permissions in Club A.
- Resource IDs from another club return a non-leaking 404 or 403 consistently.

### Exit criteria

- Repository search finds no club authorization based on `req.user.role`.
- Permission-matrix integration tests cover all mutation endpoints.

## Phase 2: Reconciled Multi-Tenant Data Model

### Migration strategy

- Add an idempotent reconciliation migration after the existing baseline and rating
  migrations. It must normalize both fresh installations and already-migrated sites.
- Stop using mutable `schema.sql` as an evolving migration body. Keep a generated
  schema snapshot for documentation only.
- Replace the two one-off schema scripts with proper migrations, then remove them.
- Add explicit defaults and constraints so a fresh install and upgrade are identical.
- Run backfills inside transactions and report records that cannot be mapped safely.

### Core schema changes

- `users`: add unique username, full name, verification state, and `deleted_at` while
  preserving current names during backfill.
- `clubs`: add unique slug, explicit public/private visibility, active/archived/deleted
  status, `deleted_at`, and structured settings.
- `user_clubs`: add membership status, rejection timestamp, revoked timestamp,
  updated timestamp, and actor/reason fields where applicable.
- `players`: add date of birth, federation ID, photo URL, active state, and `deleted_at`.
- `player_links`: add `club_id`, full status lifecycle, reviewer, reason, and timestamps.
- Add partial unique indexes for one active/pending link per player per club and one
  active/pending linked player per user per club.
- Replace destructive foreign-key cascades on historical chess records with restricted
  or preserving relationships appropriate to soft deletion.
- Add indexes for club scope, active rows, statuses, chronology, and search.

### Backfill rules

- Derive every player link's club from the linked player.
- Preserve rejected links as historical records without blocking a later valid claim.
- Convert existing user-club rows to `ACTIVE_MEMBER`.
- Keep approved/rejected join-request timestamps and map them to membership history.
- Mark all existing clubs and players active unless an existing signal proves otherwise.

### Required tests

- Fresh migration, legacy upgrade, repeat migration, and rollback policy checks.
- Database constraints reject cross-club links and duplicate active links.
- Deleting or archiving a parent record does not delete historical matches or ratings.

## Phase 3: Multi-Club Application Context

### Backend work

- Change the membership listing API to return all active and historical club
  memberships available to the user.
- Preserve transitional compatibility by returning a legacy `club` field only while
  the client migrates; the canonical response becomes `clubs` plus membership role and
  status.
- Add an endpoint for loading a single active club context with membership,
  capabilities, linked player, and club settings.
- Remove the single-club creation prohibition. Do not add a product limit unless it is
  explicitly approved.

### Frontend work

- Store the selected club ID as a user preference, not as an authorization claim.
- Add a club switcher to the application layout.
- Validate the stored selection against current memberships at startup.
- Fall back deterministically to the first active membership or the club discovery and
  creation flow when no active membership exists.
- Refetch all club-scoped queries when the selected club changes.
- Include club/category filters in URLs where the relevant skill requires shareable
  state.

### Required tests

- One user belongs to two clubs with different roles and linked players.
- Switching clubs never reuses players, ratings, matches, pending actions, or cached
  query results from the previous club.
- Revoking the selected membership moves the user to another valid club or no-club
  state without exposing old data.

## Phase 4: Club Management

### Backend work

- Generate collision-safe unique slugs while allowing duplicate club names.
- Separate visibility from public-leaderboard settings.
- Add validated settings for metadata, contacts, affiliations, presentation, rating
  configuration, and notification preferences.
- Implement owner-only admin assignment and revocation.
- Implement ownership transfer in one transaction:
  - lock the club and both memberships
  - make the new owner active and set role `owner`
  - demote the old owner to the approved target role
  - update `clubs.owner_id`
  - write an audit event
- Implement archive and soft-delete operations that preserve historical data and block
  new matches, claims, memberships, and tournament operations.
- Return explicit public DTOs and authenticated management DTOs rather than spreading
  raw database rows.

### Frontend work

- Replace the cosmetic creation settings with fields supported by the backend.
- Remove Glicko-2 from every screen.
- Use the configured 1500 defaults unless the club provides approved category settings.
- Add owner controls for admins, ownership transfer, visibility, archive, and deletion.
- Add clear inactive-club states with no mutation controls.
- Add loading states.

### Required tests

- Duplicate names produce different slugs.
- Only owners can change admins, transfer ownership, or close a club.
- Transfer is atomic under concurrent requests.
- Private settings and owner metadata never appear in public DTOs.

## Phase 5: Membership, Invites, and Join Codes

### State machine

- `PENDING_APPROVAL -> ACTIVE_MEMBER`
- `PENDING_APPROVAL -> REJECTED`
- `ACTIVE_MEMBER -> REVOKED`
- `REJECTED -> PENDING_APPROVAL` only after seven days
- `REVOKED -> PENDING_APPROVAL` through a request
- Eligible `REJECTED` or `REVOKED -> ACTIVE_MEMBER` through a valid invite or join code

### Backend work

- Implement all transitions in a membership service with row locks and transactions.
- Prevent duplicate pending requests.
- Enforce the seven-day rejection cooldown for normal requests, invites, and join codes.
- Preserve rejection and revocation timestamps and history.
- Implement member self-leave; owners must transfer ownership before leaving.
- Replace membership deletion with `REVOKED` and record actor/reason.
- Keep token invites, with revocation and expiry, and add the required six-digit join
  code flow with secure generation, rotation, and rate limiting.
- Validate request messages, tokens, codes, expiry values, route params, and queries with
  Zod.
- Emit notification events for approval and rejection.

### Frontend work

- Show correct actions for guest, pending, active, rejected-cooldown, and revoked states.
- Preserve invite continuation through registration and login.
- Add join-code entry, leave-club confirmation, and rejoin flows.
- Give admins a membership queue with timestamps and actionable status feedback.

### Required tests

- Every state transition, duplicate request, cooldown boundary, expired/revoked invite,
  invalid code, leave, revocation, and rejoin path.
- Cross-club requests and guessed invite IDs cannot affect another club.
- Concurrent approval and revocation cannot create an invalid state.

## Phase 6: Players and Player Linking

### Player management

- Create and update players through Zod-validated services.
- Make official identity fields admin-controlled.
- Allow a linked user to edit only bio and photo/avatar fields.
- Add activation and soft deletion; deleted players remain in historical match and rating
  output but cannot enter new matches or leaderboards.
- Replace the hard-delete UI language and operation with archive/restore semantics.
- Remove the unsupported ad-hoc import label and flow until import is explicitly
  authorized. A narrowly defined bulk-create action may remain only if approved as
  roster entry rather than data import.

### Link workflow

- Implement claim submission in a transaction.
- Lock the target player and relevant club-scoped user/link rows on approval.
- Re-check active membership, player status, club ownership, existing link, and
  conflicting claim after locks are acquired.
- Allow rejected claims to be resubmitted when otherwise eligible.
- Implement member self-unlink and admin force-unlink without deleting history.
- Stop changing global user roles during approval, rejection, or unlink.
- Emit claim approval/rejection and unlink notification events.

### Frontend work

- Gate claim buttons by active membership and club-scoped link state.
- Give linked users a self-profile form containing only permitted fields.
- Give admins a separate official-identity editor and claim queue.
- Correct all player-link API paths and show actionable errors instead of empty results.

### Required tests

- One linked player per user per club and one linked user per player per club.
- The same user can link different players in two clubs.
- Approval race tests prove only one conflicting claim succeeds.
- Self-edit cannot change official identity fields.
- Soft-deleted players cannot be claimed or used in new matches.

## Phase 7: Category-Specific Elo and Recalculation

### Canonical data model

- Add `club_rating_settings` keyed by club and category with:
  - initial rating
  - rating floor
  - established K-factor
  - provisional K-factor
  - provisional-games threshold
- Add `player_rating_state` keyed by player and category with start rating, current
  rating, completed rated games, peak rating, and update timestamp.
- Expand or replace `rating_history` so each snapshot records club, category, match,
  player, before, after, and chronological timestamp.
- Backfill state from existing Blitz/Rapid/Classical fields, then rebuild authoritative
  history from active rated matches.
- Keep legacy player rating columns only as temporary compatibility projections, then
  remove them after all callers migrate.

### Elo engine

- Keep pure functions separate from database code.
- Select each player's K independently from their completed rated games in the match
  category.
- Apply the configured floor and remove the unapproved maximum-rating cap.
- Round only the final stored integer result; do not round expected scores or deltas.
- A match changes exactly one category.
- Compute peak from Game 1 onward using recorded history, not a synthetic game-zero
  value.

### Recalculation pipeline

- Add a durable `rating_recalculation_jobs` table keyed by club/category/status.
- Enqueue from the same transaction as any historical match mutation.
- Coalesce overlapping pending jobs to the earliest affected chronology point.
- Process jobs asynchronously with a PostgreSQL advisory lock per club/category.
- In the replay transaction:
  - lock the job and category state
  - restore state before the affected match
  - replay active rated matches in `played_at ASC, id ASC`
  - replace affected snapshots
  - update completed-game counters and peaks
  - commit state and job status atomically
- Make failures retryable and observable without partially published ratings.

### Required tests

- Equal ratings, upset wins, draws, floor, provisional boundaries, different K-factors,
  and integer precision.
- Category and club isolation.
- Backdated insertion, result edit, category edit, void, deletion, and deterministic
  same-timestamp ordering.
- Concurrent jobs for the same category serialize; different club/categories may run
  independently.

## Phase 8: Matches

### API and service model

- Replace ambiguous `type` behavior with explicit validated fields:
  - white player
  - black player
  - result
  - rating category
  - mandatory `played_at`
  - explicit rated/unrated flag
  - optional notes and tournament
- Remove the database default for `played_at`; missing chronology must fail validation.
- Validate both players as active members of the match club and reject same-player
  matches.
- Validate tournament club, roster, category, and rated setting when linked.
- Detect an identical pairing/options combination within five minutes.
- Return a machine-readable duplicate-confirmation response and accept a validated
  confirmation flag on retry.

### Mutations

- Record a normal chronological rated match and its snapshots atomically.
- Allow only club owners/admins to record, edit, re-categorize, void, or soft-delete.
- Add match audit snapshots with actor, reason, old state, new state, and timestamp.
- Require a reason for voiding and preserve voided matches as history.
- Soft-delete instead of physical deletion.
- Enqueue recalculation for backdated entry or any change affecting chronology or
  rating inclusion.
- Return the updated match and affected rating or recalculation-pending state.

### Frontend work

- Add date/time input initialized sensibly but editable.
- Add a Blitz/Rapid/Classical segmented control and rated toggle.
- Add tournament selection only when appropriate.
- Add duplicate confirmation, void reason, edit, and soft-delete flows.
- Replace native alerts/confirms with shared accessible dialogs.
- Remove replacement-character result labels.

### Required tests

- Full validation matrix, admin-only access, cross-club players, deleted players,
  duplicate warning/confirmation, rated/unrated isolation, and tournament constraints.
- Audit snapshots and recalculation enqueue behavior for every historical mutation.

## Phase 9: Leaderboards and Statistics

### Leaderboard

- Return one row with `Rank | Player | Blitz | Rapid | Classical | Total Games`.
- Accept and validate selected category, pagination, and search query.
- Include only active, non-deleted club players with at least one rated match in the
  selected category.
- Rank with the exact tie-break order:
  1. displayed rating descending
  2. raw rating descending
  3. category weighted win rate descending
  4. rated category games descending
  5. full name ascending
- Perform sorting and pagination on the server.

### Player statistics

- Return per-category games, wins, draws, losses, weighted win rate, current rating,
  peak rating, current win streak, and current loss streak.
- Count only active rated matches in the same club/category.
- Return rating history separately by category using recorded snapshots.
- Return overall and per-category head-to-head records.
- Standardize all API DTO field names and remove client fallback guessing.

### Club statistics and dashboard

- Define and document active member, active player, rated game, total game, and current
  period once in the query/service layer.
- Return member-safe dashboard statistics separately from admin pending-action fields.
- Fix `/dashboard` so a page container fetches data before rendering `ClubDashboard`.
- Make top-player category selectable and use the same eligibility/ranking definitions
  as the leaderboard.

### Frontend work

- Implement category tabs and the required desktop table.
- Use responsive player ranking cards on small screens.
- Correct rating charts, match history routes, response fields, opponent names, and
  head-to-head totals.
- Preserve category and page in the URL.

### Required tests

- Eligibility, every tie-break, linked/unlinked equality, weighted draws, streak resets,
  category isolation, peak history, pagination, and dashboard metric definitions.

## Phase 10: Public Pages and Search

### Public boundary

- Centralize visibility checks in a public-club access service.
- Public clubs may expose only approved club and player DTO fields.
- Private clubs never appear in discovery, autocomplete, counts, leaderboard, player,
  tournament, or search results.
- Until the private direct-page presentation is explicitly approved, default to the
  minimum disclosure needed to identify that a private club exists and present an
  invite/join action.
- Do not return raw player-link/user IDs or management settings from public endpoints.
- Introduce public-safe identifiers if exposing internal player IDs conflicts with the
  approved privacy contract.

### Search

- Keep public club search server-side and visibility-filtered.
- Add authorized in-club player and match search with validated pagination.
- Add tournament search only with the approved tournament feature.
- Add indexed normalized fields or PostgreSQL trigram indexes for scalable search.
- Remove client-side full-roster/full-history search as the primary implementation.

### Frontend work

- Build public club presentation with configured metadata and top leaderboard summary.
- Add public leaderboard/player/tournament routes only for public-safe endpoints.
- Handle private, missing, and unauthorized resources without leaking why a guessed ID
  failed.

### Required tests

- Anonymous, non-member, member, admin, and owner public/private access matrices.
- Search and pagination never return private or cross-club records.
- Public DTO snapshots contain no account, link, settings, or audit fields.

## Phase 11: Tournaments

### Domain model

- Support only Swiss and Round Robin formats.
- Add category and rated/unrated configuration to each tournament.
- Add participant state for registration round, active/withdrawn status, withdrawal
  round, and bye history.
- Add round and pairing records with board, colors, result, match link, bye marker, and
  status.
- Preserve all tournament history through soft lifecycle fields.

### Pairing engines

- Select a proven maintained pairing library that can satisfy the specified Dutch-style
  Swiss behavior and deterministic tests. Document any adapter rules.
- Use Berger tables for Round Robin scheduling.
- Swiss pairing must prefer equal/close scores, avoid repeats, balance colors, and
  assign deterministic byes without repeating avoidable byes.
- A bye is a tournament result and never creates a chess match.
- Pairing generation runs in a transaction and is idempotent for a round.

Implementation note: the Swiss adapter pins `@echecs/swiss` 3.x because it supports the
project's Node 20 runtime and exposes the maintained Dutch pairing engine. It maps each
completed round to the library's white-perspective numeric results, passes prior
opponents as avoidance constraints and historical colors as seating values, and maps
library byes back to first-class tournament outcomes. Berger generation is local,
seed-stable, and rotates every participant through each opponent exactly once.

### Results and standings

- Record played results through the match service so rated games use the normal Elo and
  audit pipeline.
- Editing a rated tournament result enqueues recalculation.
- Exclude withdrawn players from future rounds while retaining prior results.
- Late entrants start in the current eligible round with no synthetic prior pairings.
- Sort standings by match points, Buchholz, Sonneborn-Berger, then direct head-to-head.

### Frontend work

- Replace placeholder pages with tournament list, creation, detail, roster, rounds,
  pairings, result entry, standings, withdrawal, and late-registration views.
- Show category/rated state clearly and expose management controls only to club admins.

### Required tests

- Golden pairing fixtures for even/odd fields, repeat avoidance, color balance, byes,
  withdrawals, and late entrants.
- Round Robin Berger schedules for odd and even player counts.
- Tiebreak ordering, result correction, rated/unrated behavior, transaction rollback,
  and club isolation.

## Phase 12: Authentication Lifecycle

### Account model

- Separate username and full name while keeping email mandatory.
- Add email verification state and separate OAuth identity records.
- Add account soft deletion that preserves club and chess history.

### Session architecture

- Use short-lived access tokens and rotating refresh tokens stored as hashes.
- Store refresh credentials in secure HttpOnly cookies and protect cookie mutations
  against CSRF.
- Revoke the current refresh token on logout and all tokens on password reset or account
  deletion.
- Remove long-lived bearer tokens from local storage after the migration period.

Implementation note: the client consumes legacy local-storage bearer tokens only as a
temporary compatibility path. Every newly issued access token is memory-only. Google
OAuth routes return a configuration error until `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` are supplied; no provider secret or
identity is stored in club-scoped data.

### Flows

- Registration with duplicate email and username handling.
- Email verification with hashed, expiring, one-time tokens.
- Login with deleted/unverified-account policy as explicitly approved.
- Password reset request and completion with generic anti-enumeration responses.
- Google OAuth with state validation and separate identity linking.
- Password change, logout, logout-all, and soft account deletion.
- Add strict authentication-specific rate limits independent of the global limiter.

### Frontend work

- Add verification pending/resend, forgot-password, reset-password, Google sign-in,
  session expiry, and account deletion screens.
- Preserve invite continuation through every authentication path.

### Required tests

- Registration, duplicate email/username, verification, invalid credentials, reset,
  token reuse/expiry, OAuth linking, logout invalidation, deleted accounts, rate limits,
  and secret-field response filtering.

## Phase 13: Notifications

### Data and delivery

- Add persistent notifications with user, club, event type, validated payload, read
  state, and timestamps.
- Add club event-notification settings and optional user delivery preferences where
  approved.
- Add a transactional outbox so significant events are committed with their domain
  mutation.
- Process email asynchronously; email failure never changes in-app read/delivery state.
- Re-check recipient membership and event eligibility before creating or delivering a
  club notification.

### Event catalogue

- Membership approved/rejected.
- Player claim approved/rejected and unlink events.
- Match recorded, corrected, voided, or deleted for linked players.
- Announcement publication.
- Tournament registration, pairing, result, withdrawal, and status events as approved.
- Admin-relevant pending actions.

### API and frontend

- Add paginated list, unread count, mark-one-read, and mark-all-read endpoints.
- Add an application notification tray and durable read state.
- Keep the current transient toast system for immediate UI feedback, but render it and
  keep it separate from persisted notifications.

### Required tests

- Eligibility, private payload filtering, settings, unread state, outbox retry,
  duplicate-delivery protection, and independent email failure.

## Phase 14: Announcements

### Data and backend

- Add club-scoped announcements with draft, published, archived, and soft-deleted
  states.
- Store sanitized rich-text content and publication metadata.
- Add attachment records with club ownership, content type, size, storage key, and
  access policy.
- Introduce a storage adapter after the deployment storage provider is approved.
- Validate uploads by type, size, ownership, and authorization.
- Limit create/edit/publish/archive/delete actions to club owners/admins.
- Publish and enqueue eligible notifications in one transaction.

### Frontend work

- Add member announcement list/detail views.
- Add admin draft editor, attachment controls, preview, publish, archive, and delete
  flows.
- Do not add scheduled expiry without explicit approval.

### Required tests

- Club isolation, status visibility, permission matrix, sanitization, attachment access,
  publication idempotency, and notification integration.

## Phase 15: CSV Export and Import Scope

### Export

- Add club-scoped CSV endpoints for player roster, match history, and current category
  ratings.
- Allow only club owners and admins to export data; enforce the same club-specific
  boundary in the API and client capability model.
- Stream CSV where practical and use a real CSV serializer for quoting, newlines, and
  spreadsheet-safe output.
- Include explicit category, rated state, chronology, and soft-lifecycle semantics.
- Record export audit metadata without storing exported private content.

### Import

- Keep import unavailable; no existing import workflow was found or exposed.
- Do not implement CSV import until explicitly authorized.
- If authorized later, create a separate plan covering row validation, preview/error
  reports, transactional writes, authorization, and historical integrity.

### Required tests

- Permission and club isolation, CSV escaping, Unicode, large exports, category fields,
  and exclusion/inclusion rules for inactive records.

## Phase 16: Frontend Integration and Product Quality

### Route and API cleanup

- Move every feature URL into its feature API module and remove hard-coded component
  paths.
- Correct player match, head-to-head, rating-history, and player-link routes.
- Standardize response DTOs and remove fallback chains for incompatible field names.
- Add request cancellation and the timeout behavior currently claimed by the API client.
- Make all empty, loading, error, unauthorized, and stale-session states explicit.

### User experience

- Fix the dashboard route and remove disconnected placeholder pages.
- Render transient notifications and persisted notification UI.
- Replace replacement characters and restore valid result labels.
- Add the missing font assets or remove the unresolved font declarations.
- Use shared accessible dialogs, focus management, icon controls, tooltips, responsive
  tables/cards, and stable layouts.
- Ensure no screen exposes controls based on a stale club role after club switching.

### End-to-end coverage

- Registration, verification, login, reset, logout.
- Create two clubs and switch between them.
- Join request, cooldown, invite, code, leave, and rejoin.
- Create, claim, approve, self-edit, unlink, and archive a player.
- Record rated and unrated matches in all categories, then edit, void, and backdate.
- Verify ratings, leaderboard, profile statistics, and history after recalculation.
- Create and complete Swiss and Round Robin tournaments.
- Publish and read announcements and notifications.
- Verify public/private discovery and public pages.
- Export all supported CSV resources.

### Final verification

- Run lint, unit tests, API integration tests, migration tests, end-to-end tests, and
  production build.
- Run accessibility checks on all primary workflows.
- Inspect desktop and mobile screenshots for overflow, overlap, and responsive tables.
- Run a final repository scan against every skill contract.

## Product and Infrastructure Decisions Required

These are genuinely unspecified and must be confirmed before their dependent slice is
implemented:

1. What limited fields, if any, a private club direct page may show before membership.
2. Whether unverified accounts may log in or use any protected features.
3. Google OAuth client credentials, callback origins, and deployment environments.
4. The production storage provider and upload limits for player photos and announcement
   attachments.
5. Whether a bulk roster-entry tool is approved independently of CSV import.

Until decided, implementations use deny-by-default behavior and do not invent product
rules.

## Proposed Pull Request Sequence

1. Test harness and characterization tests.
2. Emergency permission and private-public boundary fixes.
3. Reconciliation migration and club-scoped data model.
4. Multi-club provider, switcher, and capability model.
5. Club management and membership lifecycle.
6. Player lifecycle and transactional linking.
7. Elo state, history, and recalculation worker.
8. Match lifecycle and admin UI.
9. Leaderboard, player statistics, club dashboard, and profile repairs.
10. Public pages, search, and CSV exports.
11. Authentication lifecycle and session migration.
12. Persistent notifications and email outbox.
13. Announcements and storage integration.
14. Tournament engine and tournament UI.
15. Frontend integration cleanup, end-to-end tests, and final skill audit.

Each pull request must leave the build green, include migration notes when applicable,
and update this document's status before the next slice starts.
