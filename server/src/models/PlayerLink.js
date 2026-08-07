import db from '../database/database.js';

// Manages the relationship between a user account and a player record.
// Linking is optional and requires admin approval.
//
// Status lifecycle:
//   (none) → pending  [user requests link]
//   pending → approved [admin approves]
//   pending → rejected [admin rejects]
//   approved → unlinked [admin or user removes link]
export const PlayerLinkModel = {

    // ── Create ────────────────────────────────────────────────────────────────

    // User requests to link their account to a player.
    // Fails if the player already has an approved or pending link.
    requestLink: async (userId, playerId) => {
        return db.query(
            `INSERT INTO player_links (user_id, player_id, status)
             VALUES ($1, $2, 'pending')
             RETURNING *`,
            [userId, playerId]
        ).then(r => r.first);
    },

    // ── Read ──────────────────────────────────────────────────────────────────

    findByPlayer: async (playerId) => {
        return db.query(
            `SELECT pl.*, u.email AS user_email
             FROM player_links pl
             JOIN users u ON u.id = pl.user_id
             WHERE pl.player_id = $1
             ORDER BY pl.created_at DESC`,
            [playerId]
        ).then(r => r.rows);
    },

    findByUser: async (userId) => {
        return db.query(
            `SELECT pl.*, p.name AS player_name
             FROM player_links pl
             JOIN players p ON p.id = pl.player_id
             WHERE pl.user_id = $1
             ORDER BY pl.created_at DESC`,
            [userId]
        ).then(r => r.first);
    },

    findById: async (linkId) => {
        return db.query(
            `SELECT pl.*, p.club_id
             FROM player_links pl
             JOIN players p ON p.id = pl.player_id
             WHERE pl.id = $1`,
            [linkId]
        ).then(r => r.first);
    },

    countApprovedByUser: async (userId) => {
        return db.query(
            `SELECT COUNT(*)::int AS count
             FROM player_links
             WHERE user_id = $1 AND status = 'approved'`,
            [userId]
        ).then(r => r.first?.count || 0);
    },

    // All pending requests for a club — shown in the admin approval queue.
    findPendingByClub: async (clubId) => {
        return db.query(
            `SELECT pl.*, u.email AS user_email, p.name AS player_name
             FROM player_links pl
             JOIN players p ON p.id  = pl.player_id
             JOIN users   u ON u.id  = pl.user_id
             WHERE p.club_id = $1 AND pl.status = 'pending'
             ORDER BY pl.created_at ASC`,
            [clubId]
        ).then(r => r.rows);
    },

    // ── Status transitions ────────────────────────────────────────────────────

    approve: async (linkId) => {
        return db.query(
            `UPDATE player_links
             SET status = 'approved', reviewed_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [linkId]
        ).then(r => r.first);
    },

    reject: async (linkId) => {
        return db.query(
            `UPDATE player_links
             SET status = 'rejected', reviewed_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [linkId]
        ).then(r => r.first);
    },

    // Removes any active link between a user and a player.
    // Used by admin or the linked user themselves.
    unlink: async (userId, playerId) => {
        return db.query(
            `DELETE FROM player_links
             WHERE user_id = $1 AND player_id = $2
             RETURNING id`,
            [userId, playerId]
        ).then(r => r.first);
    },
};