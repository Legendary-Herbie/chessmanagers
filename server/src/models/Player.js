import db from '../database/database.js';

// Represents a real-world chess player within a club.
// Players are owned by the club, not the user — a player record exists
// independently of any user account. Users may request to link to a player,
// subject to admin approval (see PlayerLink model).
export const PlayerModel = {

    // ── Create ────────────────────────────────────────────────────────────────

    create: async ({ clubId, name, rating = 1500, bio = null }) => {
        return db.query(
            `INSERT INTO players (club_id, name, rating, bio)
             VALUES (?, ?, ?, ?)
             RETURNING *`,
            [clubId, name, rating, bio]
        ).then(r => r.first);
    },

    // ── Read ──────────────────────────────────────────────────────────────────

    findById: async (id) => {
        return db.query(
            `SELECT p.*,
                    pl.user_id      AS linked_user_id,
                    pl.status       AS link_status
             FROM players p
             LEFT JOIN player_links pl ON pl.player_id = p.id AND pl.status = 'approved'
             WHERE p.id = ?`,
            [id]
        ).then(r => r.first);
    },

    // All players in a club, with their link status for display.
    findByClub: async (clubId) => {
        return db.query(
            `SELECT p.*,
                    pl.user_id  AS linked_user_id,
                    pl.status   AS link_status
             FROM players p
             LEFT JOIN player_links pl ON pl.player_id = p.id
                 AND pl.status IN ('approved', 'pending')
             WHERE p.club_id = ?
             ORDER BY p.rating DESC`,
            [clubId]
        ).then(r => r.rows);
    },

    // The player linked to a specific approved user account.
    findByUserId: async (userId) => {
        return db.query(
            `SELECT p.*
             FROM players p
             JOIN player_links pl ON pl.player_id = p.id
             WHERE pl.user_id = ? AND pl.status = 'approved'
             LIMIT 1`,
            [userId]
        ).then(r => r.first);
    },

    // ── Update ────────────────────────────────────────────────────────────────

    update: async (id, { name, bio }) => {
        return db.query(
            `UPDATE players
             SET name       = COALESCE(?, name),
                 bio        = COALESCE(?, bio),
                 updated_at = NOW()
             WHERE id = ?
             RETURNING *`,
            [name, bio, id]
        ).then(r => r.first);
    },

    // Called after each match to persist the newly calculated rating.
    updateRating: async (id, rating) => {
        return db.query(
            `UPDATE players
             SET rating     = ?,
                 updated_at = NOW()
             WHERE id = ?
             RETURNING id, rating`,
            [rating, id]
        ).then(r => r.first);
    },

    // ── Delete ────────────────────────────────────────────────────────────────

    delete: async (id) => {
        return db.query(
            `DELETE FROM players WHERE id = ? RETURNING id`,
            [id]
        ).then(r => r.first);
    },
};