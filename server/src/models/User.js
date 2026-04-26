import db from '../database/database.js';

// Represents a user account. Separate from Player —
// a user may or may not be linked to a player record.
export const UserModel = {

    // ── Create ────────────────────────────────────────────────────────────────

    create: async ({ email, name, passwordHash, role = 'member' }) => {
        return db.query(
            `INSERT INTO users (email, name, password_hash, role)
             VALUES (?, ?, ?, ?)
             RETURNING *`,
            [email, name, passwordHash, role]
        ).then(r => r.first);
    },

    // ── Read ──────────────────────────────────────────────────────────────────

    findById: async (id) => {
        return db.query(
            `SELECT * FROM users WHERE id = ?`,
            [id]
        ).then(r => r.first);
    },

    findByEmail: async (email) => {
        return db.query(
            `SELECT * FROM users WHERE email = ?`,
            [email]
        ).then(r => r.first);
    },

    findByName: async (name) => {
        return db.query(
            `SELECT * FROM users WHERE name = ?`,
            [name]
        ).then(r => r.first);
    },

    // ── Update ────────────────────────────────────────────────────────────────

    updatePassword: async (id, passwordHash) => {
        return db.query(
            `UPDATE users SET password_hash = ?, updated_at = NOW()
             WHERE id = ?
             RETURNING *`,
            [passwordHash, id]
        ).then(r => r.first);
    },

    updateRole: async (id, role) => {
        return db.query(
            `UPDATE users SET role = ?, updated_at = NOW()
             WHERE id = ?
             RETURNING *`,
            [role, id]
        ).then(r => r.first);
    },

    // ── Delete ────────────────────────────────────────────────────────────────

    delete: async (id) => {
        return db.query(
            `DELETE FROM users WHERE id = ? RETURNING id`,
            [id]
        ).then(r => r.first);
    },
};