import db from '../database/database.js';

const queryFor = trx => trx ? trx.query.bind(trx) : db.query.bind(db);

export const UserModel = {
    create: async ({ email, username, fullName, name, passwordHash = null,
        role = 'member', emailVerified = false }, trx = null) => queryFor(trx)(
        `INSERT INTO users (
            email, name, username, full_name, password_hash, role,
            email_verified, email_verified_at
         ) VALUES (LOWER($1), $3, $2, $3, $4, $5, $6, CASE WHEN $6 THEN NOW() END)
         RETURNING *`,
        [email, username ?? name, fullName ?? name, passwordHash, role, emailVerified]
    ).then(result => result.first),

    findById: async (id, { includeDeleted = false, forUpdate = false, trx = null } = {}) => queryFor(trx)(
        `SELECT * FROM users WHERE id = $1 AND ($2::BOOLEAN OR deleted_at IS NULL)
         ${forUpdate ? 'FOR UPDATE' : ''}`,
        [id, includeDeleted]
    ).then(result => result.first),

    findByEmail: async (email, { includeDeleted = false, trx = null } = {}) => queryFor(trx)(
        `SELECT * FROM users WHERE LOWER(email) = LOWER($1)
           AND ($2::BOOLEAN OR deleted_at IS NULL)`,
        [email, includeDeleted]
    ).then(result => result.first),

    findByUsername: async (username, { includeDeleted = false, trx = null } = {}) => queryFor(trx)(
        `SELECT * FROM users WHERE LOWER(username) = LOWER($1)
           AND ($2::BOOLEAN OR deleted_at IS NULL)`,
        [username, includeDeleted]
    ).then(result => result.first),

    findByName: async name => UserModel.findByUsername(name),

    updatePassword: async (id, passwordHash, trx = null) => queryFor(trx)(
        `UPDATE users SET password_hash = $1, session_version = session_version + 1,
                updated_at = NOW()
         WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
        [passwordHash, id]
    ).then(result => result.first),

    updateRole: async (id, role) => db.query(
        `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [role, id]
    ).then(result => result.first),

    verifyEmail: async (id, trx = null) => queryFor(trx)(
        `UPDATE users SET email_verified = TRUE, email_verified_at = COALESCE(email_verified_at, NOW()),
                updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
        [id]
    ).then(result => result.first),

    softDelete: async (id, reason, trx = null) => queryFor(trx)(
        `UPDATE users SET deleted_at = NOW(), deletion_reason = $2,
                session_version = session_version + 1, updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
        [id, reason]
    ).then(result => result.first),

    delete: async id => UserModel.softDelete(id, null),
};
