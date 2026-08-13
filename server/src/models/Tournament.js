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

    findById: async (id, clubId = null) => {
        return db.query(
            `SELECT * FROM tournaments WHERE id = $1 AND ($2::TEXT IS NULL OR club_id = $2)`,
            [id, clubId]
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

    getPlayers: async (tournamentId, clubId = null) => {
        return db.query(
            `SELECT p.*
             FROM players p
             JOIN tournament_players tp ON tp.player_id = p.id
             JOIN tournaments t ON t.id = tp.tournament_id
             WHERE tp.tournament_id = $1 AND ($2::TEXT IS NULL OR t.club_id = $2)
             ORDER BY p.name ASC`,
            [tournamentId, clubId]
        ).then(r => r.rows);
    },

    addPlayer: async (tournamentId, playerId, clubId) => {
        return db.query(
            `INSERT INTO tournament_players (tournament_id, player_id)
             SELECT $1, $2
             FROM tournaments t
             JOIN players p ON p.id = $2 AND p.club_id = t.club_id
             WHERE t.id = $1 AND t.club_id = $3
             ON CONFLICT DO NOTHING
             RETURNING *`,
            [tournamentId, playerId, clubId]
        ).then(r => r.first);
    },

    removePlayer: async (tournamentId, playerId, clubId) => {
        return db.query(
            `DELETE FROM tournament_players
             USING tournaments t
             WHERE tournament_players.tournament_id = $1 AND player_id = $2
               AND t.id = tournament_players.tournament_id AND t.club_id = $3
             RETURNING player_id`,
            [tournamentId, playerId, clubId]
        ).then(r => r.first);
    },

    // ── Update ────────────────────────────────────────────────────────────────

    update: async (id, clubId, { name, startDate, endDate }) => {
        return db.query(
            `UPDATE tournaments
             SET name       = COALESCE($1, name),
                 start_date = COALESCE($2, start_date),
                 end_date   = COALESCE($3, end_date),
                 updated_at = NOW()
             WHERE id = $4 AND club_id = $5
             RETURNING *`,
            [name, startDate, endDate, id, clubId]
        ).then(r => r.first);
    },

    setStatus: async (id, clubId, status) => {
        return db.query(
            `UPDATE tournaments
             SET status = $1, updated_at = NOW()
             WHERE id = $2 AND club_id = $3
             RETURNING *`,
            [status, id, clubId]
        ).then(r => r.first);
    },

    // ── Delete ────────────────────────────────────────────────────────────────

    delete: async (id, clubId) => {
        return db.query(
            `DELETE FROM tournaments WHERE id = $1 AND club_id = $2 RETURNING id`,
            [id, clubId]
        ).then(r => r.first);
    },
};
