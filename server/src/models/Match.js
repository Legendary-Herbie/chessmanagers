import db from '../database/database.js';

// Represents a match between two players.
// Rating updates are handled by the ratings utility (utils/ratings.js)
// and applied via Player.updateRating() — not here.
// Match type: 'casual' | 'rated' | 'tournament'
// Result (from white's perspective): 'white' | 'black' | 'draw'
export const MatchModel = {

    // ── Create ────────────────────────────────────────────────────────────────

    create: async ({
        clubId,
        whitePlayerId,
        blackPlayerId,
        result,
        type = 'casual',
        tournamentId = null,
        notes = null,
    }) => {
        return db.query(
            `INSERT INTO matches
                (club_id, white_player_id, black_player_id, result, type, tournament_id, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [clubId, whitePlayerId, blackPlayerId, result, type, tournamentId, notes]
        ).then(r => r.first);
    },

    // ── Read ──────────────────────────────────────────────────────────────────

    findById: async (id) => {
        return db.query(
            `SELECT m.*,
                    wp.name AS white_player_name,
                    bp.name AS black_player_name
             FROM matches m
             JOIN players wp ON wp.id = m.white_player_id
             JOIN players bp ON bp.id = m.black_player_id
             WHERE m.id = $1`,
            [id]
        ).then(r => r.first);
    },

    // All matches for a club, with optional filters.
    findByClub: async (clubId, { type, tournamentId, playerId, limit = 50, offset = 0 } = {}) => {
        const conditions = ['m.club_id = $1'];
        const params = [clubId];
        let placeholderIndex = 2;

        if (type) {
            conditions.push(`m.type = $${placeholderIndex}`);
            params.push(type);
            placeholderIndex++;
        }
        if (tournamentId) {
            conditions.push(`m.tournament_id = $${placeholderIndex}`);
            params.push(tournamentId);
            placeholderIndex++;
        }
        if (playerId) {
            conditions.push(`(m.white_player_id = $${placeholderIndex} OR m.black_player_id = $${placeholderIndex + 1})`);
            params.push(playerId, playerId);
            placeholderIndex += 2;
        }

        const limitPlaceholder = placeholderIndex;
        const offsetPlaceholder = placeholderIndex + 1;
        params.push(limit, offset);

        return db.query(
            `SELECT m.*,
                    wp.name AS white_player_name,
                    bp.name AS black_player_name
             FROM matches m
             JOIN players wp ON wp.id = m.white_player_id
             JOIN players bp ON bp.id = m.black_player_id
             WHERE ${conditions.join(' AND ')}
             ORDER BY m.played_at DESC
             LIMIT $${limitPlaceholder} OFFSET $${offsetPlaceholder}`,
            params
        ).then(r => r.rows);
    },

    // Match history for a single player across both colours.
    findByPlayer: async (playerId, { limit = 20, offset = 0 } = {}) => {
        return db.query(
            `SELECT m.*,
                    wp.name AS white_player_name,
                    bp.name AS black_player_name
             FROM matches m
             JOIN players wp ON wp.id = m.white_player_id
             JOIN players bp ON bp.id = m.black_player_id
             WHERE m.white_player_id = $1 OR m.black_player_id = $2
             ORDER BY m.played_at DESC
             LIMIT $3 OFFSET $4`,
            [playerId, playerId, limit, offset]
        ).then(r => r.rows);
    },

    // Head-to-head record between two specific players.
    findHeadToHead: async (playerAId, playerBId) => {
        return db.query(
            `SELECT m.*,
                    wp.name AS white_player_name,
                    bp.name AS black_player_name
             FROM matches m
             JOIN players wp ON wp.id = m.white_player_id
             JOIN players bp ON bp.id = m.black_player_id
             WHERE
                (m.white_player_id = $1 AND m.black_player_id = $2)
                OR
                (m.white_player_id = $2 AND m.black_player_id = $1)
             ORDER BY m.played_at DESC`,
            [playerAId, playerBId]
        ).then(r => r.rows);
    },

    // ── Update ────────────────────────────────────────────────────────────────

    // Admin correction of a match result.
    updateResult: async (id, { result, notes }) => {
        return db.query(
            `UPDATE matches
             SET result     = COALESCE($1, result),
                 notes      = COALESCE($2, notes),
                 updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [result, notes, id]
        ).then(r => r.first);
    },

    // ── Record rating history for a player after a match ──────────────────────

    recordRatingHistory: async (playerId, matchId, ratingBefore, ratingAfter) => {
        return db.query(
            `INSERT INTO rating_history
                (player_id, match_id, rating_before, rating_after)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [playerId, matchId, ratingBefore, ratingAfter]
        ).then(r => r.first);
    },

    // ── Delete ────────────────────────────────────────────────────────────────

    delete: async (id) => {
        return db.query(
            `DELETE FROM matches WHERE id = $1 RETURNING id`,
            [id]
        ).then(r => r.first);
    },
};