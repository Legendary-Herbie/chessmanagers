import db from '../database/database.js';

// ─── helpers ────────────────────────────────────────────────────────────────── 
const qry = (trx) => trx ? trx.query.bind(trx) : db.query.bind(db);

// Players are owned by the club, not the user — a player record exists
export const PlayerModel = {

    // ── Create ────────────────────────────────────────────────────────────────

    create: async ({ clubId, name, rating = 1200, bio = null }) => {
        return db.query(
            `INSERT INTO players (club_id, name, rating, start_rating, blitz_rating, rapid_rating, classical_rating, bio)
             VALUES ($1, $2, $3, $3, $3, $3, $3, $4)
             RETURNING *`,
            [clubId, name, rating, bio]
        ).then(r => r.first);
    },

    createBulk: async ({ clubId, players }) => {
        if (!players || players.length === 0) return [];
        const values = [];
        const placeholders = players.map((player, index) => {
            const rating = Number.parseInt(player.rating, 10) || 1200;
            const start = index * 4;
            values.push(clubId, player.name, rating, player.bio || null);
            return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 3}, $${start + 3}, $${start + 3}, $${start + 3}, $${start + 4})`;
        });
        return db.query(
            `INSERT INTO players (club_id, name, rating, start_rating, blitz_rating, rapid_rating, classical_rating, bio)
             VALUES ${placeholders.join(', ')}
             RETURNING *`,
            values,
        ).then(result => result.rows);
    },

    // ── Read ──────────────────────────────────────────────────────────────────

    findById: async (id) => {
        return db.query(
            `SELECT p.*,
                    pl.user_id  AS linked_user_id,
                    pl.status   AS link_status
             FROM players p
             LEFT JOIN player_links pl ON pl.player_id = p.id AND pl.status IN ('approved', 'pending')
             WHERE p.id = $1`,
            [id]
        ).then(r => r.first);
    },

    findByClub: async (clubId) => {
        return db.query(
            `SELECT p.*,
                    pl.user_id  AS linked_user_id,
                    pl.status   AS link_status
             FROM players p
             LEFT JOIN player_links pl ON pl.player_id = p.id AND pl.status IN ('approved', 'pending')
             WHERE p.club_id = $1
             ORDER BY p.rating DESC`,
            [clubId]
        ).then(r => r.rows);
    },

    findByUserId: async (userId) => {
        return db.query(
            `SELECT p.*
             FROM players p
             JOIN player_links pl ON pl.player_id = p.id
             WHERE pl.user_id = $1 AND pl.status = 'approved'
             ORDER BY p.created_at ASC, p.id ASC
             LIMIT 1`,
            [userId]
        ).then(r => r.first);
    },

    // ── Update ────────────────────────────────────────────────────────────────

    update: async (id, { name, bio }) => {
        return db.query(
            `UPDATE players
             SET name       = COALESCE($1, name),
                 bio        = COALESCE($2, bio),
                 updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [name, bio, id]
        ).then(r => r.first);
    },

    // Called after each match to persist the newly calculated ELO rating.
    // Accepts trx so it runs inside the match-creation transaction.
    updateRating: async (id, rating, trx) => {
        return qry(trx)(
            `UPDATE players
             SET rating     = $1,
                 updated_at = NOW()
             WHERE id = $2
             RETURNING id, rating`,
            [rating, id]
        ).then(r => r.first);
    },
    // ── Delete ────────────────────────────────────────────────────────────────

    delete: async (id) => {
        return db.query(
            `DELETE FROM players WHERE id = $1 RETURNING id`,
            [id]
        ).then(r => r.first);
    },
};
