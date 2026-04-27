import db from '../database/database.js';

// ─── helpers ──────────────────────────────────────────────────────────────────
const qry = (trx) => trx ? trx.query.bind(trx) : db.query.bind(db);

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
    }, trx) => {
        return qry(trx)(
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

    findByClub: async (clubId, { type, tournamentId, playerId, limit = 50, offset = 0 } = {}) => {
        const conditions = ['m.club_id = $1'];
        const params = [clubId];
        let i = 2;

        if (type) {
            conditions.push(`m.type = $${i++}`);
            params.push(type);
        }
        if (tournamentId) {
            conditions.push(`m.tournament_id = $${i++}`);
            params.push(tournamentId);
        }
        if (playerId) {
            conditions.push(`(m.white_player_id = $${i} OR m.black_player_id = $${i})`);
            params.push(playerId);
            i++;
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
             LIMIT $${i} OFFSET $${i + 1}`,
            params
        ).then(r => r.rows);
    },

    findByPlayer: async (playerId, { limit = 20, offset = 0 } = {}) => {
        return db.query(
            `SELECT m.*,
                    wp.name AS white_player_name,
                    bp.name AS black_player_name
             FROM matches m
             JOIN players wp ON wp.id = m.white_player_id
             JOIN players bp ON bp.id = m.black_player_id
             WHERE m.white_player_id = $1 OR m.black_player_id = $1
             ORDER BY m.played_at DESC
             LIMIT $2 OFFSET $3`,
            [playerId, limit, offset]
        ).then(r => r.rows);
    },

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

    // ── Rating history ────────────────────────────────────────────────────────

    recordRatingHistory: async (playerId, matchId, ratingBefore, ratingAfter, trx) => {
        return qry(trx)(
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