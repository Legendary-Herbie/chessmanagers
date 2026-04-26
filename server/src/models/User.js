import db from '../database/database.js';

// Represents a user account. Separate from Player —
// a user may or may not be linked to a player record.
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

    findById: async (id) => {
        return db.query(
            `SELECT * FROM users WHERE id = $1`,
            [id]
        ).then(r => r.first);
    },

    findByEmail: async (email) => {
        return db.query(
            `SELECT * FROM users WHERE email = $1`,
            [email]
        ).then(r => r.first);
    },

    findByName: async (name) => {
        return db.query(
            `SELECT * FROM users WHERE name = $1`,
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