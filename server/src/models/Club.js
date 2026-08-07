import db from '../database/database.js';

// Represents a chess club. All players, matches, and tournaments
// are scoped under a club.
export const ClubModel = {

    // ── Create ────────────────────────────────────────────────────────────────

    create: async ({ name, ownerId, description = null, logo = null, contactInfo = null }) => {
        return db.query(
            `INSERT INTO clubs (name, owner_id, description, logo, contact_info)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [name, ownerId, description, logo, contactInfo]
        ).then(r => r.first);
    },

    // ── Read ──────────────────────────────────────────────────────────────────

    findById: async (id) => {
        return db.query(
            `SELECT * FROM clubs WHERE id = $1`,
            [id]
        ).then(r => r.first);
    },

    // Returns the club a given user belongs to.
    // Assumes a user_clubs join table or a club_id on users.
    findByUserId: async (userId) => {
        return db.query(
            `SELECT c.*
             FROM clubs c
             JOIN user_clubs uc ON uc.club_id = c.id
             WHERE uc.user_id = $1
             LIMIT 1`,
            [userId]
        ).then(r => r.first);
    },

    // ── Update ────────────────────────────────────────────────────────────────

    update: async (id, { name, description, logo, contactInfo }) => {
        return db.query(
            `UPDATE clubs
             SET name         = COALESCE($1, name),
                 description  = COALESCE($2, description),
                 logo         = COALESCE($3, logo),
                 contact_info = COALESCE($4, contact_info),
                 updated_at   = NOW()
             WHERE id = $5
             RETURNING *`,
            [name, description, logo, contactInfo, id]
        ).then(r => r.first);
    },

    // ── Members ───────────────────────────────────────────────────────────────

    getMembers: async (clubId) => {
        return db.query(
            `SELECT u.id AS user_id, u.email, uc.role AS role, uc.joined_at
             FROM users u
             JOIN user_clubs uc ON uc.user_id = u.id
             WHERE uc.club_id = $1
             ORDER BY uc.joined_at ASC`,
            [clubId]
        ).then(r => r.rows);
    },

    // Returns the membership record for a specific user in a club (or null)
    getMembership: async (clubId, userId) => {
        return db.query(
            `SELECT uc.user_id, uc.role, uc.joined_at
             FROM user_clubs uc
             WHERE uc.club_id = $1 AND uc.user_id = $2
             LIMIT 1`,
            [clubId, userId]
        ).then(r => r.first);
    },

    addMember: async (clubId, userId, role = 'member') => {
        return db.query(
            `INSERT INTO user_clubs (club_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (club_id, user_id) DO UPDATE SET role = LEAST(user_clubs.role, EXCLUDED.role)
             RETURNING *`,
            [clubId, userId, role]
        ).then(r => r.first);
    },

    removeMember: async (clubId, userId) => {
        return db.query(
            `DELETE FROM user_clubs
             WHERE club_id = $1 AND user_id = $2
             RETURNING user_id`,
            [clubId, userId]
        ).then(r => r.first);
    },
};
