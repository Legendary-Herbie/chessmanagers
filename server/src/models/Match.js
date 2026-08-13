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
        timeControl = 'blitz',
        tournamentId = null,
        notes = null,
        playedAt = null,
    }, trx) => {
        return qry(trx)(
            `INSERT INTO matches
                (club_id, white_player_id, black_player_id, result, type, time_control, tournament_id, notes, played_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
             RETURNING *`,
            [clubId, whitePlayerId, blackPlayerId, result, type, timeControl, tournamentId, notes, playedAt]
        ).then(r => r.first);
    },

    // ── Read ──────────────────────────────────────────────────────────────────

    findById: async (id, clubId = null) => {
        return db.query(
            `SELECT m.*,
                    wp.name AS white_player_name,
                    bp.name AS black_player_name
             FROM matches m
             JOIN players wp ON wp.id = m.white_player_id
             JOIN players bp ON bp.id = m.black_player_id
             WHERE m.id = $1 AND ($2::TEXT IS NULL OR m.club_id = $2)`,
            [id, clubId]
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

    findByPlayer: async (clubId, playerId, { limit = 20, offset = 0 } = {}) => {
        return db.query(
            `SELECT m.*,
                    wp.name AS white_player_name,
                    bp.name AS black_player_name
             FROM matches m
             JOIN players wp ON wp.id = m.white_player_id
             JOIN players bp ON bp.id = m.black_player_id
             WHERE m.club_id = $1 AND (m.white_player_id = $2 OR m.black_player_id = $2)
             ORDER BY m.played_at DESC
             LIMIT $3 OFFSET $4`,
            [clubId, playerId, limit, offset]
        ).then(r => r.rows);
    },

    findHeadToHead: async (clubId, playerAId, playerBId) => {
        return db.query(
            `SELECT m.*,
                    wp.name AS white_player_name,
                    bp.name AS black_player_name
             FROM matches m
             JOIN players wp ON wp.id = m.white_player_id
             JOIN players bp ON bp.id = m.black_player_id
             WHERE m.club_id = $1 AND (
                (m.white_player_id = $2 AND m.black_player_id = $3)
                OR
                (m.white_player_id = $3 AND m.black_player_id = $2))
             ORDER BY m.played_at DESC`,
            [clubId, playerAId, playerBId]
        ).then(r => r.rows);
    },

    // ── Update ────────────────────────────────────────────────────────────────

    updateResult: async (id, clubId, { result, notes, timeControl }, trx) => {
        return qry(trx)(
            `UPDATE matches
                 SET result     = COALESCE($1, result),
                 notes      = COALESCE($2, notes),
                 time_control = COALESCE($3, time_control),
                 updated_at = NOW()
             WHERE id = $4 AND club_id = $5
             RETURNING *`,
            [result, notes, timeControl, id, clubId]
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

    delete: async (id, clubId, trx) => {
        return qry(trx)(
            `DELETE FROM matches WHERE id = $1 AND club_id = $2 RETURNING id`,
            [id, clubId]
        ).then(r => r.first);
    },
};
