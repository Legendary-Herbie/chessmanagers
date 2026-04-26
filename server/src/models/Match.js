import db from '../database/database.js';

// Represents a match between two players.
// Rating updates are handled by the ratings utility (utils/ratings.js)
// and applied via Player.updateRating() — not here.
// Match type: 'casual' | 'practice' | 'tournament'
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
             VALUES (?, ?, ?, ?, ?, ?, ?)
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
             WHERE m.id = ?`,
            [id]
        ).then(r => r.first);
    },

    // All matches for a club, with optional filters.
    findByClub: async (clubId, { type, tournamentId, playerId, limit = 50, offset = 0 } = {}) => {
        const conditions = ['m.club_id = ?'];
        const params = [clubId];

        if (type) {
            conditions.push('m.type = ?');
            params.push(type);
        }
        if (tournamentId) {
            conditions.push('m.tournament_id = ?');
            params.push(tournamentId);
        }
        if (playerId) {
            conditions.push('(m.white_player_id = ? OR m.black_player_id = ?)');
            params.push(playerId, playerId);
        }

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
             LIMIT ? OFFSET ?`,
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
             WHERE m.white_player_id = ? OR m.black_player_id = ?
             ORDER BY m.played_at DESC
             LIMIT ? OFFSET ?`,
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
                (m.white_player_id = ? AND m.black_player_id = ?)
                OR
                (m.white_player_id = ? AND m.black_player_id = ?)
             ORDER BY m.played_at DESC`,
            [playerAId, playerBId, playerBId, playerAId]
        ).then(r => r.rows);
    },

    // ── Update ────────────────────────────────────────────────────────────────

    // Admin correction of a match result.
    updateResult: async (id, { result, notes }) => {
        return db.query(
            `UPDATE matches
             SET result     = COALESCE(?, result),
                 notes      = COALESCE(?, notes),
                 updated_at = NOW()
             WHERE id = ?
             RETURNING *`,
            [result, notes, id]
        ).then(r => r.first);
    },

    // ── Delete ────────────────────────────────────────────────────────────────

    delete: async (id) => {
        return db.query(
            `DELETE FROM matches WHERE id = ? RETURNING id`,
            [id]
        ).then(r => r.first);
    },
};