import db from '../database/database.js';

// Represents a user account. A user may optionally have an approved
// `player_links` row; models and controllers often want the linked
// `player_id` and the `link_status` alongside the user record.
export const UserModel = {

    // ── Create ────────────────────────────────────────────────────────────────

    create: async ({ email, name, passwordHash, role = 'member' }) => {
        return db.query(
            `INSERT INTO users (email, name, password_hash, role)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [email, name, passwordHash, role]
        ).then(r => r.first);
    },

    // ── Read ──────────────────────────────────────────────────────────────────

    // Note: read helpers include a LEFT JOIN to the `player_links` table
    // to surface any approved link for this user as `player_id` and
    // `link_status`. Only one active link per user is enforced by the DB.
    findById: async (id) => {
        return db.query(
            `SELECT u.*, pl.player_id AS player_id, pl.status AS link_status
             FROM users u
             LEFT JOIN player_links pl ON pl.user_id = u.id AND pl.status = 'approved'
             WHERE u.id = $1`,
            [id]
        ).then(r => r.first);
    },

    findByEmail: async (email) => {
        return db.query(
            `SELECT u.*, pl.player_id AS player_id, pl.status AS link_status
             FROM users u
             LEFT JOIN player_links pl ON pl.user_id = u.id AND pl.status = 'approved'
             WHERE u.email = $1`,
            [email]
        ).then(r => r.first);
    },

    findByName: async (name) => {
        return db.query(
            `SELECT u.*, pl.player_id AS player_id, pl.status AS link_status
             FROM users u
             LEFT JOIN player_links pl ON pl.user_id = u.id AND pl.status = 'approved'
             WHERE u.name = $1`,
            [name]
        ).then(r => r.first);
    },

    // ── Update ────────────────────────────────────────────────────────────────

    updatePassword: async (id, passwordHash) => {
        return db.query(
            `UPDATE users SET password_hash = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [passwordHash, id]
        ).then(r => r.first);
    },

    updateRole: async (id, role) => {
        return db.query(
            `UPDATE users SET role = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [role, id]
        ).then(r => r.first);
    },

    // ── Delete ────────────────────────────────────────────────────────────────

    delete: async (id) => {
        return db.query(
            `DELETE FROM users WHERE id = $1 RETURNING id`,
            [id]
        ).then(r => r.first);
    },
};