import db from '../database/database.js';

// Represents a chess club. All players, matches, and tournaments
// are scoped under a club.
import crypto from 'crypto';

export const ClubModel = {

    // ── Create ────────────────────────────────────────────────────────────────

    create: async ({ name, ownerId, description = null, logo = null, contactInfo = null, federation = null, is_public = false, settings = {} }) => {
        return db.transaction(async (trx) => {
            const club = await trx.query(
                `INSERT INTO clubs (name, federation, owner_id, description, logo, contact_info, public_leaderboard, settings_json)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                [name, federation, ownerId, description, logo, contactInfo, is_public, JSON.stringify(settings)]
            ).then(r => r.first);

            // Add creator as owner in user_clubs with role 'owner'.
            // Callers must NOT also call addMember() for the same user/club —
            // addMember() upserts on conflict and defaults to role 'member',
            // which would silently demote the owner set here.
            await trx.query(
                `INSERT INTO user_clubs (user_id, club_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
                [ownerId, club.id]
            );

            return club;
        });
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

    update: async (id, { name, description, logo, contactInfo, federation }) => {
        return db.query(
            `UPDATE clubs
             SET name         = COALESCE($1, name),
                 federation   = COALESCE($2, federation),
                 description  = COALESCE($3, description),
                 logo         = COALESCE($4, logo),
                 contact_info = COALESCE($5, contact_info),
                 updated_at   = NOW()
             WHERE id = $6
             RETURNING *`,
            [name, federation, description, logo, contactInfo, id]
        ).then(r => r.first);
    },

    // ── Members ───────────────────────────────────────────────────────────────

    getMembers: async (clubId) => {
        return db.query(
            `SELECT u.id, u.email, u.role AS system_role, uc.joined_at, uc.role AS club_role
             FROM users u
             JOIN user_clubs uc ON uc.user_id = u.id
             WHERE uc.club_id = $1
             ORDER BY uc.joined_at ASC`,
            [clubId]
        ).then(r => r.rows);
    },

    getMembership: async (clubId, userId) => {
        return db.query(
            `SELECT role FROM user_clubs WHERE club_id = $1 AND user_id = $2`,
            [clubId, userId]
        ).then(r => r.first);
    },

    // Adds (or re-roles, via upsert) a member. NEVER call this for a user who
    // was just inserted as 'owner' by create() — it will overwrite that role
    // with whatever `role` defaults to here ('member').
    addMember: async (clubId, userId, role = 'member') => {
        return db.query(
            `INSERT INTO user_clubs (club_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, club_id) DO UPDATE SET role = EXCLUDED.role
             RETURNING *`,
            [clubId, userId, role]
        ).then(r => r.first);
    },

    // Promotes/demotes an existing club member's club-scoped role.
    // Does not touch the global users.role (system_role) column.
    // Guards against ever re-assigning the owner's row via this path —
    // ownership transfer is intentionally out of scope for this helper.
    setMemberRole: async (clubId, userId, role) => {
        if (!['admin', 'member'].includes(role)) {
            throw new Error(`Invalid club role: "${role}". Expected 'admin' or 'member'.`);
        }
        return db.query(
            `UPDATE user_clubs
             SET role = $1
             WHERE club_id = $2 AND user_id = $3 AND role <> 'owner'
             RETURNING *`,
            [role, clubId, userId]
        ).then(r => r.first);
    },

    // ── Invite tokens ─────────────────────────────────────────────────────────

    createInvite: async (clubId, createdByUserId, expiresAt = null) => {
        const token = 'tkn_' + crypto.randomBytes(16).toString('hex');
        return db.query(
            `INSERT INTO club_invites (club_id, token, created_by, expires_at)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [clubId, token, createdByUserId, expiresAt]
        ).then(r => r.first);
    },

    revokeInvite: async (clubId, inviteId) => {
        return db.query(
            `UPDATE club_invites SET revoked = TRUE WHERE id = $1 AND club_id = $2 RETURNING *`,
            [inviteId, clubId]
        ).then(r => r.first);
    },

    listInvites: async (clubId) => {
        return db.query(
            `SELECT * FROM club_invites
             WHERE club_id = $1
               AND revoked = FALSE
               AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY created_at DESC`,
            [clubId]
        ).then(r => r.rows);
    },

    verifyInviteToken: async (token) => {
        return db.query(
            `SELECT * FROM club_invites WHERE token = $1 AND revoked = FALSE AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
            [token]
        ).then(r => r.first);
    },

    acceptInviteToken: async (token, userId) => {
        return db.transaction(async (trx) => {
            const inv = await trx.query(`SELECT * FROM club_invites WHERE token = $1 FOR UPDATE`, [token]).then(r => r.first);
            if (!inv || inv.revoked) return null;
            if (inv.expires_at && new Date(inv.expires_at) <= new Date()) return null;

            // Add the user as a member
            await trx.query(`INSERT INTO user_clubs (club_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`, [inv.club_id, userId]);
            return inv;
        });
    },

    removeMember: async (clubId, userId) => {
        return db.query(
            `DELETE FROM user_clubs
             WHERE club_id = $1 AND user_id = $2
             RETURNING user_id`,
            [clubId, userId]
        ).then(r => r.first);
    },

    // ── Public listing/search ──────────────────────────────────────────────────

    listPublic: async ({ q = '', limit = 50, offset = 0 } = {}) => {
        const search = q ? `%${q}%` : '%';
        return db.query(
            `SELECT c.id, c.name, c.federation, c.description, c.logo, c.public_leaderboard, c.created_at
             FROM clubs c
             WHERE c.public_leaderboard = TRUE AND (c.name ILIKE $1 OR c.federation ILIKE $1)
             ORDER BY c.name ASC
             LIMIT $2 OFFSET $3`,
            [search, limit, offset]
        ).then(r => r.rows);
    },

    // Returns all clubs (admin/public find) — useful for FindClubs page when public listing is empty
    listAll: async ({ q = '', limit = 50, offset = 0 } = {}) => {
        const search = q ? `%${q}%` : '%';
        return db.query(
            `SELECT c.id, c.name, c.federation, c.description, c.logo, c.public_leaderboard, c.created_at
             FROM clubs c
             WHERE c.name ILIKE $1 OR c.federation ILIKE $1
             ORDER BY c.name ASC
             LIMIT $2 OFFSET $3`,
            [search, limit, offset]
        ).then(r => r.rows);
    },

    // ── Join requests (user asks to join; admin approves) ──────────────────────

    requestJoin: async (clubId, userId, message = null) => {
        return db.query(
            `INSERT INTO club_join_requests (club_id, user_id, message)
             VALUES ($1, $2, $3)
             ON CONFLICT (club_id, user_id) DO UPDATE SET status = 'pending', message = EXCLUDED.message, created_at = NOW()
             RETURNING *`,
            [clubId, userId, message]
        ).then(r => r.first);
    },

    // Returns the caller's own pending request for this club, if any.
    // Used by getClub() so the "Request to join" button can stay disabled
    // across page reloads instead of only within the current session.
    getPendingJoinRequest: async (clubId, userId) => {
        return db.query(
            `SELECT id, created_at
             FROM club_join_requests
             WHERE club_id = $1 AND user_id = $2 AND status = 'pending'
             LIMIT 1`,
            [clubId, userId]
        ).then(r => r.first);
    },

    getJoinRequests: async (clubId) => {
        return db.query(
            `SELECT cjr.*, u.email, u.name
             FROM club_join_requests cjr
             JOIN users u ON u.id = cjr.user_id
             WHERE cjr.club_id = $1 AND cjr.status = 'pending'
             ORDER BY cjr.created_at ASC`,
            [clubId]
        ).then(r => r.rows);
    },

    approveJoinRequest: async (clubId, requestId) => {
        return db.transaction(async (trx) => {
            const reqRow = await trx.query(
                `SELECT * FROM club_join_requests WHERE id = $1 AND club_id = $2 AND status = 'pending' FOR UPDATE`,
                [requestId, clubId]
            ).then(r => r.first);
            if (!reqRow) return null;

            // Mark request approved
            await trx.query(`UPDATE club_join_requests SET status = 'approved', processed_at = NOW() WHERE id = $1`, [requestId]);
            // Add the user to club members
            await trx.query(`INSERT INTO user_clubs (club_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [reqRow.club_id, reqRow.user_id]);
            return { request: reqRow };
        });
    },

    rejectJoinRequest: async (clubId, requestId) => {
        return db.query(
            `UPDATE club_join_requests
             SET status = 'rejected', processed_at = NOW()
             WHERE id = $1 AND club_id = $2 AND status = 'pending'
             RETURNING *`,
            [requestId, clubId]
        ).then(r => r.first);
    },
};