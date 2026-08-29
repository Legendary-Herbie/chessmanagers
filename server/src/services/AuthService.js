import bcrypt from 'bcryptjs';
import db from '../database/database.js';
import env from '../config/env.js';
import { UserModel } from '../models/User.js';
import { sendPasswordResetEmail, sendVerificationEmail } from './EmailService.js';
import {
    createRefreshSession,
    hashToken,
    randomToken,
    revokeAllUserSessions,
    signAccessToken,
} from './SessionService.js';

const failure = (code, details = {}) => ({ ok: false, code, ...details });
const DUMMY_HASH = '$2b$12$invalidhashfortimingprotection';

async function deliverSafely(delivery) {
    try { await delivery; }
    catch (error) { console.error('[AUTH EMAIL] Delivery failed:', error.message); }
}

export function toAuthUser(user) {
    return {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        name: user.full_name,
        role: user.role,
        emailVerified: Boolean(user.email_verified),
    };
}

function tokenExpiry(amount, unit) {
    const multiplier = unit === 'hours' ? 3_600_000 : 60_000;
    return new Date(Date.now() + amount * multiplier);
}

async function issueVerificationToken(user, meta, continuation = '', trx = null) {
    const query = trx ? trx.query.bind(trx) : db.query.bind(db);
    const rawToken = randomToken();
    await query(
        `UPDATE email_verification_tokens SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL`, [user.id]
    );
    await query(
        `INSERT INTO email_verification_tokens
            (user_id, token_hash, expires_at, request_ip, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, hashToken(rawToken),
            tokenExpiry(env.EMAIL_VERIFICATION_EXPIRY_HOURS, 'hours'),
            meta.ip ?? null, meta.userAgent ?? null]
    );
    return { rawToken, continuation };
}

export async function registerAccount(input, meta = {}) {
    const result = await db.transaction(async trx => {
        if (await UserModel.findByEmail(input.email, { includeDeleted: true, trx })) {
            return failure('EMAIL_ALREADY_EXISTS');
        }
        if (await UserModel.findByUsername(input.username, { includeDeleted: true, trx })) {
            return failure('USERNAME_ALREADY_EXISTS');
        }
        const passwordHash = await bcrypt.hash(input.password, 12);
        const user = await UserModel.create({
            email: input.email,
            username: input.username,
            fullName: input.fullName,
            passwordHash,
        }, trx);
        const verification = await issueVerificationToken(user, meta, input.continuation, trx);
        return { ok: true, user, verification };
    });
    if (result.ok) {
        await deliverSafely(sendVerificationEmail(
            result.user, result.verification.rawToken, input.continuation
        ));
    }
    return result;
}

export async function verifyEmailToken(rawToken) {
    return db.transaction(async trx => {
        const token = await trx.query(
            `SELECT * FROM email_verification_tokens WHERE token_hash = $1 FOR UPDATE`,
            [hashToken(rawToken)]
        ).then(result => result.first);
        if (!token) {
            return failure('VERIFICATION_TOKEN_INVALID');
        }

        const user = await UserModel.findById(token.user_id, { trx, forUpdate: true });
        if (!user || user.deleted_at) {
            return failure('VERIFICATION_TOKEN_INVALID');
        }

        if (user.email_verified) {
            return { ok: true, alreadyVerified: true };
        }

        if (token.used_at) {
            return failure('VERIFICATION_TOKEN_INVALID');
        }

        if (new Date(token.expires_at) <= new Date()) {
            return failure('VERIFICATION_TOKEN_EXPIRED');
        }

        await UserModel.verifyEmail(user.id, trx);
        await trx.query('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1', [token.id]);
        return { ok: true, alreadyVerified: false };
    });
}

export async function resendVerification(email, continuation, meta = {}) {
    const user = await UserModel.findByEmail(email);
    if (!user || user.email_verified) return { ok: true };
    const verification = await db.transaction(trx => issueVerificationToken(user, meta, continuation, trx));
    await deliverSafely(sendVerificationEmail(user, verification.rawToken, continuation));
    return { ok: true };
}

export async function authenticatePassword(email, password, meta = {}) {
    const user = await UserModel.findByEmail(email, { includeDeleted: true });
    const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || user.deleted_at || !user.password_hash || !valid) return failure('INVALID_CREDENTIALS');
    if (!user.email_verified) return failure('EMAIL_VERIFICATION_REQUIRED', { email: user.email });
    const session = await createRefreshSession(user, meta);
    return { ok: true, user, session, accessToken: signAccessToken(user) };
}

export async function requestPasswordReset(email, continuation, meta = {}) {
    const user = await UserModel.findByEmail(email);
    if (!user || !user.password_hash) return { ok: true };
    const rawToken = randomToken();
    await db.transaction(async trx => {
        await trx.query('UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
        await trx.query(
            `INSERT INTO password_resets
                (user_id, token_hash, expires_at, request_ip, user_agent)
             VALUES ($1, $2, $3, $4, $5)`,
            [user.id, hashToken(rawToken),
                tokenExpiry(env.PASSWORD_RESET_EXPIRY_MINUTES, 'minutes'),
                meta.ip ?? null, meta.userAgent ?? null]
        );
    });
    await deliverSafely(sendPasswordResetEmail(user, rawToken, continuation));
    return { ok: true };
}

export async function resetPassword(rawToken, password) {
    return db.transaction(async trx => {
        const token = await trx.query(
            `SELECT * FROM password_resets WHERE token_hash = $1 FOR UPDATE`,
            [hashToken(rawToken)]
        ).then(result => result.first);
        if (!token || token.used_at || new Date(token.expires_at) <= new Date()) {
            return failure('PASSWORD_RESET_TOKEN_INVALID');
        }
        const passwordHash = await bcrypt.hash(password, 12);
        const user = await UserModel.updatePassword(token.user_id, passwordHash, trx);
        if (!user) return failure('PASSWORD_RESET_TOKEN_INVALID');
        await trx.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [token.id]);
        await revokeAllUserSessions(user.id, 'password_reset', trx);
        return { ok: true };
    });
}

export async function changeAccountPassword(userId, currentPassword, newPassword) {
    return db.transaction(async trx => {
        const user = await UserModel.findById(userId, { forUpdate: true, trx });
        if (!user?.password_hash || !await bcrypt.compare(currentPassword, user.password_hash)) {
            return failure('CURRENT_PASSWORD_INVALID');
        }
        const passwordHash = await bcrypt.hash(newPassword, 12);
        await UserModel.updatePassword(user.id, passwordHash, trx);
        await revokeAllUserSessions(user.id, 'password_changed', trx);
        return { ok: true };
    });
}

export async function deleteAccount(userId, { currentPassword, reason }) {
    return db.transaction(async trx => {
        const user = await UserModel.findById(userId, { forUpdate: true, trx });
        if (!user) return failure('ACCOUNT_NOT_FOUND');
        if (user.password_hash
            && (!currentPassword || !await bcrypt.compare(currentPassword, user.password_hash))) {
            return failure('CURRENT_PASSWORD_INVALID');
        }
        await UserModel.softDelete(user.id, reason ?? null, trx);
        await revokeAllUserSessions(user.id, 'account_deleted', trx);
        return { ok: true };
    });
}

export async function logoutAllSessions(userId) {
    return db.transaction(async trx => {
        const user = await UserModel.findById(userId, { forUpdate: true, trx });
        if (!user) return failure('ACCOUNT_NOT_FOUND');
        await trx.query(
            'UPDATE users SET session_version = session_version + 1, updated_at = NOW() WHERE id = $1',
            [userId]
        );
        await revokeAllUserSessions(userId, 'logout_all', trx);
        return { ok: true };
    });
}
