# Chess Managers Agent Skills

These skills are intended for GitHub Copilot Agent mode in VS Code and follow the Agent Skills `SKILL.md` format. VS Code supports project skills in `.agents/skills/`, `.github/skills/`, and `.claude/skills/`; this project uses `.agents/skills/` for compatibility with the existing repository layout.

## Skill hierarchy

- `product`: master product contract and non-negotiable invariants
- `engineering-standards`: global implementation, testing, security, database, and AI rules
- domain skills: feature-specific business rules and workflows

## Recommended order when implementing

1. Read `product`.
2. Read `engineering-standards`.
3. Read the requested domain skill.
4. Read directly related dependency skills.
5. Inspect existing implementation before changing it.
6. Make the smallest compliant change.
7. Run relevant tests and report failures.

## Critical dependency relationships

- `club-membership` depends on `club-management` and `permissions`.
- `players` depends on `club-membership`, `permissions`, and `player-linking`.
- `matches` depends on `players`, `permissions`, and `rating-system`.
- `rating-system` depends on `matches` and club-specific rating configuration.
- `leaderboard` depends on `players` and `rating-system`.
- `player-statistics` depends on `players`, `matches`, and `rating-system`.
- `tournaments` depends on `matches`, `rating-system`, `players`, and `permissions`.
- `notifications` is cross-cutting and is triggered by approved domain events.
- `audit-logging` is cross-cutting for significant changes.
