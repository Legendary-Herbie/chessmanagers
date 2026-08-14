---
name: tournaments
description: Implement Chess Managers Swiss and Round-Robin tournaments, pairing, standings, rating-category selection, byes, withdrawals, late registration, result editing, and rated/unrated tournament matches.
---

# Tournaments

## Supported formats

- Swiss using the defined Dutch-style pairing approach.
- Round Robin using Berger tables.

## Tournament scope

Each tournament belongs to exactly one club and has a selected rating category: Blitz, Rapid, or Classical.

Tournament games may be rated or unrated.

Rated tournament games are normal rating-affecting matches associated with the tournament.

## Swiss rules

- Prefer pairing players with equal/currently close points.
- No repeat opponent within the same tournament.
- Balance colors over the tournament.
- Handle odd participant counts with byes.
- A bye is a tournament outcome, not a chess match.
- Bye assignment must be deterministic and respect prior byes/withdrawals.

## Withdrawals

A withdrawn player is excluded from future pairings but retains all prior results.

## Late registration

A player added after rounds have occurred receives no pairings/results for prior rounds and enters from the current eligible round.

## Results

Tournament results can be edited by authorized administrators. If a rated result changes, trigger rating recalculation under the rating-system skill.

## Tiebreaks

Use in order where applicable:
1. match points
2. Buchholz
3. Sonneborn-Berger
4. direct head-to-head

Do not invent alternative tiebreaks without product approval.

## Transactions

Pairing generation, standings updates, and rated result recording must remain consistent even if a request fails midway.
