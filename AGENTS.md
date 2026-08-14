# Chess Managers Agent Instructions

## Source of truth

Read `.agents/skills/product/SKILL.md` before implementing or changing product behavior. Read `.agents/skills/engineering-standards/SKILL.md` before editing code. Then read the relevant domain skill(s).

## Non-negotiable rules

- Chess data is club-specific.
- Users may belong to multiple clubs with different linked players and ratings.
- One linked player per user per club.
- Ratings are independent for Blitz, Rapid, and Classical.
- Chess Managers uses Elo.
- Match chronology uses mandatory `played_at`.
- Admins are the only direct match record editors.
- Backend authorization is mandatory even when frontend controls are hidden.
- Multi-step mutations use ACID transactions.
- Incoming API payloads use Zod validation.
- Historical rating changes require safe chronological recalculation.
- Agents must not expand product scope unless explicitly authorized or required by the existing specification.

## Implementation style

- Inspect existing code before creating new abstractions.
- Reuse existing API clients, hooks, database abstractions, and shared components where appropriate.
- Keep feature-specific UI/logic in `src/features/<domain>`.
- Keep route composition in `src/pages`.
- Keep generic UI in `src/shared`.
- Keep backend flow as route -> middleware -> controller -> service/model -> database.
- Do not put database/business logic in Express route declarations or React components.

## Completion standard

A feature is not complete until relevant tests pass and the implementation satisfies the applicable skill contracts or user requirements are met. Ask the user for clarification if you are not sure about the requirements or the applicable skill contracts.
