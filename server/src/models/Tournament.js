import db from '../database/database.js';

// Represents a tournament within a club.
// Tournament type: 'round_robin' | 'knockout'
// Status: 'upcoming' | 'active' | 'completed'
export const TournamentModel = {

    // ── Create ────────────────────────────────────────────────────────────────

    create: async ({ clubId, name, type, startDate, endDate = null, }) => {
        return db.query(
            `INSERT INTO tournaments (club_id, name, type, start_date, end_date, status)
             VALUES (?, ?, ?, ?, ?, 'upcoming')
             RETURNING *`,
            [clubId, name, type, startDate, endDate]
        ).then(r => r.first);
    },

    // ── Read ──────────────────────────────────────────────────────────────────

    findById: async (id) => {
        return db.query(
            `SELECT * FROM tournaments WHERE id = ?`,
            [id]
        ).then(r => r.first);
    },

    findByClub: async (clubId, { status } = {}) => {
        const conditions = ['club_id = ?'];
        const params = [clubId];

        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }

        return db.query(
            `SELECT * FROM tournaments
             WHERE ${conditions.join(' AND ')}
             ORDER BY start_date DESC`,
            params
        ).then(r => r.rows);
    },

    // Standings: players ranked by score within a tournament.
    // Score is derived from match results (win=1, draw=0.5, loss=0).
    getStandings: async (tournamentId) => {
        return db.query(
            `SELECT
                p.id,
                p.name,
                COUNT(m.id)                                             AS played,
                SUM(CASE
                    WHEN m.white_player_id = p.id AND m.result = 'white' THEN 1
                    WHEN m.black_player_id = p.id AND m.result = 'black' THEN 1
                    ELSE 0
                END)                                                    AS wins,
                SUM(CASE WHEN m.result = 'draw' THEN 1 ELSE 0 END)     AS draws,
                SUM(CASE
                    WHEN m.white_player_id = p.id AND m.result = 'black' THEN 1
                    WHEN m.black_player_id = p.id AND m.result = 'white' THEN 1
                    ELSE 0
                END)                                                    AS losses,
                SUM(CASE
                    WHEN m.white_player_id = p.id AND m.result = 'white' THEN 1
                    WHEN m.black_player_id = p.id AND m.result = 'black' THEN 1
                    WHEN m.result = 'draw' THEN 0.5
                    ELSE 0
                END)                                                    AS score
             FROM tournament_players tp
             JOIN players p  ON p.id = tp.player_id
             LEFT JOIN matches m ON m.tournament_id = tp.tournament_id
                 AND (m.white_player_id = p.id OR m.black_player_id = p.id)
             WHERE tp.tournament_id = ?
             GROUP BY p.id, p.name
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
             WHERE tp.tournament_id = ?
             ORDER BY p.name ASC`,
            [tournamentId]
        ).then(r => r.rows);
    },

    addPlayer: async (tournamentId, playerId) => {
        return db.query(
            `INSERT INTO tournament_players (tournament_id, player_id)
             VALUES (?, ?)
             ON CONFLICT DO NOTHING
             RETURNING *`,
            [tournamentId, playerId]
        ).then(r => r.first);
    },

    removePlayer: async (tournamentId, playerId) => {
        return db.query(
            `DELETE FROM tournament_players
             WHERE tournament_id = ? AND player_id = ?
             RETURNING player_id`,
            [tournamentId, playerId]
        ).then(r => r.first);
    },

    // ── Update ────────────────────────────────────────────────────────────────

    update: async (id, { name, startDate, endDate }) => {
        return db.query(
            `UPDATE tournaments
             SET name       = COALESCE(?, name),
                 start_date = COALESCE(?, start_date),
                 end_date   = COALESCE(?, end_date),
                 updated_at = NOW()
             WHERE id = ?
             RETURNING *`,
            [name, startDate, endDate, id]
        ).then(r => r.first);
    },

    setStatus: async (id, status) => {
        return db.query(
            `UPDATE tournaments
             SET status = ?, updated_at = NOW()
             WHERE id = ?
             RETURNING *`,
            [status, id]
        ).then(r => r.first);
    },

    // ── Delete ────────────────────────────────────────────────────────────────

    delete: async (id) => {
        return db.query(
            `DELETE FROM tournaments WHERE id = ? RETURNING id`,
            [id]
        ).then(r => r.first);
    },
};