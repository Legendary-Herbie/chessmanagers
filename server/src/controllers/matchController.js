import { MatchModel } from '../models/Match.js';
import { PlayerModel } from '../models/Player.js';
import { calculateNewRatings } from '../utils/ratings.js';
import db from '../database/database.js';

const VALID_RESULTS = ['white', 'black', 'draw'];
const VALID_TYPES   = ['casual', 'rated', 'tournament'];

// GET /api/v1/clubs/:clubId/matches
export async function getMatches(req, res, next) {
    try {
        const { clubId } = req.params;
        const { type, tournamentId, playerId, limit, offset } = req.query;

        const matches = await MatchModel.findByClub(clubId, {
            type,
            tournamentId,
            playerId,
            limit:  Number(limit)  || 50,
            offset: Number(offset) || 0,
        });

        res.json({ matches });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/matches/:matchId
export async function getMatch(req, res, next) {
    try {
        const match = await MatchModel.findById(req.params.matchId);
        if (!match) return res.status(404).json({ error: 'Match not found.' });
        res.json({ match });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/clubs/:clubId/matches — admin only
//
// Transaction steps:
//   1. Insert match row  →  DB trigger (trg_player_stats) fires and updates
//      player games/wins/draws/losses automatically — no app-level stat calls needed.
//   2. Calculate new ELO ratings.
//   3. Update both players' ratings (via trx so it stays in the same transaction).
//   4. Insert rating_history rows for both players (via trx).
//
// PlayerModel.recordMatchResult() is NOT called — the trigger handles it.
export async function createMatch(req, res, next) {
    try {
        const { clubId } = req.params;
        const { whitePlayerId, blackPlayerId, result, type, tournamentId, notes } = req.body;

        // ── Validation ────────────────────────────────────────────────────────
        if (!whitePlayerId || !blackPlayerId) {
            return res.status(400).json({ error: 'Both whitePlayerId and blackPlayerId are required.' });
        }
        if (whitePlayerId === blackPlayerId) {
            return res.status(400).json({ error: 'A player cannot play against themselves.' });
        }
        if (!VALID_RESULTS.includes(result)) {
            return res.status(400).json({ error: `Result must be one of: ${VALID_RESULTS.join(', ')}.` });
        }
        if (type && !VALID_TYPES.includes(type)) {
            return res.status(400).json({ error: `Type must be one of: ${VALID_TYPES.join(', ')}.` });
        }

        // ── Pre-fetch players (read-only, outside transaction) ─────────────────
        const [white, black] = await Promise.all([
            PlayerModel.findById(whitePlayerId),
            PlayerModel.findById(blackPlayerId),
        ]);

        if (!white) return res.status(404).json({ error: 'White player not found.' });
        if (!black) return res.status(404).json({ error: 'Black player not found.' });

        // Belt-and-suspenders club check — schema composite FKs are the definitive guard.
        if (white.club_id !== clubId || black.club_id !== clubId) {
            return res.status(400).json({ error: 'Both players must belong to this club.' });
        }

        // ── Atomic transaction ─────────────────────────────────────────────────
        const { match } = await db.transaction(async (trx) => {

            // Step 1: insert match. The trg_player_stats trigger fires here,
            // updating both players' counters inside the same transaction.
            const match = await MatchModel.create({
                clubId, whitePlayerId, blackPlayerId,
                result,
                type: type || 'casual',
                tournamentId: tournamentId || null,
                notes: notes || null,
            }, trx);

            // Step 2: calculate ELO.
            const { newWhiteRating, newBlackRating } = calculateNewRatings(
                white.rating, black.rating, result, white, black,
            );

            // Step 3: persist ratings — trx ensures atomicity.
            await Promise.all([
                PlayerModel.updateRating(whitePlayerId, newWhiteRating, trx),
                PlayerModel.updateRating(blackPlayerId, newBlackRating, trx),
            ]);

            // Step 4: audit trail.
            await Promise.all([
                MatchModel.recordRatingHistory(whitePlayerId, match.id, white.rating, newWhiteRating, trx),
                MatchModel.recordRatingHistory(blackPlayerId, match.id, black.rating, newBlackRating, trx),
            ]);

            return { match };
        });

        res.status(201).json({ match });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId/matches/:matchId — admin only
export async function updateMatch(req, res, next) {
    try {
        const { result, notes } = req.body;

        if (result && !VALID_RESULTS.includes(result)) {
            return res.status(400).json({ error: `Result must be one of: ${VALID_RESULTS.join(', ')}.` });
        }

        const match = await MatchModel.updateResult(req.params.matchId, { result, notes });
        if (!match) return res.status(404).json({ error: 'Match not found.' });

        res.json({ match });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/v1/clubs/:clubId/matches/:matchId — admin only
export async function deleteMatch(req, res, next) {
    try {
        const deleted = await MatchModel.delete(req.params.matchId);
        if (!deleted) return res.status(404).json({ error: 'Match not found.' });
        res.json({ message: 'Match deleted.' });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/players/:playerId/matches
export async function getPlayerMatches(req, res, next) {
    try {
        const { playerId } = req.params;
        const { limit, offset } = req.query;

        const matches = await MatchModel.findByPlayer(playerId, {
            limit:  Number(limit)  || 20,
            offset: Number(offset) || 0,
        });

        res.json({ matches });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/players/:playerAId/vs/:playerBId
export async function getHeadToHead(req, res, next) {
    try {
        const { playerAId, playerBId } = req.params;
        const matches = await MatchModel.findHeadToHead(playerAId, playerBId);
        res.json({ matches });
    } catch (err) {
        next(err);
    }
}