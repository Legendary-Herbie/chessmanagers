import db from '../database/database.js';

export const TournamentModel = {

    // ── Create ────────────────────────────────────────────────────────────────

    create: async ({ clubId, name, type, startDate, endDate = null }) => {
        return db.query(
            `INSERT INTO tournaments (club_id, name, type, start_date, end_date, status)
             VALUES ($1, $2, $3, $4, $5, 'upcoming')
             RETURNING *`,
            [clubId, name, type, startDate, endDate]
        ).then(r => r.first);
    },

    // ── Read ──────────────────────────────────────────────────────────────────

    findById: async (id) => {
        return db.query(
            `SELECT * FROM tournaments WHERE id = $1`,
            [id]
        ).then(r => r.first);
    },

    findByClub: async (clubId, { status } = {}) => {
        const conditions = ['club_id = $1'];
        const params = [clubId];

        if (status) {
            conditions.push('status = $2');
            params.push(status);
        }

        return db.query(
            `SELECT * FROM tournaments
             WHERE ${conditions.join(' AND ')}
             ORDER BY start_date DESC`,
            params
        ).then(r => r.rows);
    },

    // Standings from VIEW — no CASE logic in application code.
    getStandings: async (tournamentId) => {
        return db.query(
            `SELECT
                player_id  AS id,
                name,
                played,
                wins,
                draws,
                losses,
                score
             FROM v_tournament_standings
             WHERE tournament_id = $1
             ORDER BY score DESC, wins DESC`,
            [tournamentId]
        ).then(r => r.rows);
    },

    // ── Players ───────────────────────────────────────────────────────────────

    getPlayers: async (tournamentId) => {
        return db.query(
            `SELECT p.*
             FROM players p
             JOIN tournament_players tp ON tp.player_id = p.id
             WHERE tp.tournament_id = $1
             ORDER BY p.name ASC`,
            [tournamentId]
        ).then(r => r.rows);
    },

    addPlayer: async (tournamentId, playerId) => {
        return db.query(
            `INSERT INTO tournament_players (tournament_id, player_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING
             RETURNING *`,
            [tournamentId, playerId]
        ).then(r => r.first);
    },

    removePlayer: async (tournamentId, playerId) => {
        return db.query(
            `DELETE FROM tournament_players
             WHERE tournament_id = $1 AND player_id = $2
             RETURNING player_id`,
            [tournamentId, playerId]
        ).then(r => r.first);
    },

    // ── Update ────────────────────────────────────────────────────────────────

    update: async (id, { name, startDate, endDate }) => {
        return db.query(
            `UPDATE tournaments
             SET name       = COALESCE($1, name),
                 start_date = COALESCE($2, start_date),
                 end_date   = COALESCE($3, end_date),
                 updated_at = NOW()
             WHERE id = $4
             RETURNING *`,
            [name, startDate, endDate, id]
        ).then(r => r.first);
    },

    setStatus: async (id, status) => {
        return db.query(
            `UPDATE tournaments
             SET status = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [status, id]
        ).then(r => r.first);
    },

    // ── Delete ────────────────────────────────────────────────────────────────

    delete: async (id) => {
        return db.query(
            `DELETE FROM tournaments WHERE id = $1 RETURNING id`,
            [id]
        ).then(r => r.first);
    },
};