import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import db from '../database/database.js';
import env from '../config/env.js';

export const REFRESH_COOKIE = 'cm_refresh';
export const CSRF_COOKIE = 'cm_csrf';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

export function signAccessToken(user) {
    return jwt.sign({
        id: user.id,
        email: user.email,
        sv: user.session_version,
        type: 'access',
    }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN, jwtid: randomToken(12) });
}

function refreshExpiry() {
    return new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 86_400_000);
}

export async function createRefreshSession(user, meta = {}, trx = null, familyId = null) {
    const rawToken = randomToken(48);
    const csrfToken = randomToken(24);
    const expiresAt = refreshExpiry();
    const query = trx ? trx.query.bind(trx) : db.query.bind(db);
    const row = await query(
        `INSERT INTO refresh_tokens (
            user_id, token_hash, expires_at, family_id, created_ip, user_agent
         ) VALUES ($1, $2, $3, COALESCE($4, 'pending'), $5, $6)
         RETURNING *`,
        [user.id, hashToken(rawToken), expiresAt, familyId, meta.ip ?? null, meta.userAgent ?? null]
    ).then(result => result.first);
    if (!familyId) {
        await query('UPDATE refresh_tokens SET family_id = id WHERE id = $1', [row.id]);
        row.family_id = row.id;
    }
    return { rawToken, csrfToken, expiresAt, row };
}

export async function rotateRefreshSession(rawToken, meta = {}) {
    if (!rawToken) return { ok: false, code: 'REFRESH_REQUIRED' };
    return db.transaction(async trx => {
        const existing = await trx.query(
            `SELECT token.*, user_account.email, user_account.username,
                    user_account.full_name, user_account.role, user_account.email_verified,
                    user_account.deleted_at, user_account.session_version
             FROM refresh_tokens token
             JOIN users user_account ON user_account.id = token.user_id
             WHERE token.token_hash = $1 FOR UPDATE OF token, user_account`,
            [hashToken(rawToken)]
        ).then(result => result.first);
        if (!existing) return { ok: false, code: 'REFRESH_INVALID' };
        if (existing.revoked || existing.revoked_at) {
            await trx.query(
                `UPDATE refresh_tokens SET revoked = TRUE, revoked_at = COALESCE(revoked_at, NOW()),
                        revoke_reason = COALESCE(revoke_reason, 'family_reuse_detected')
                 WHERE user_id = $1 AND family_id = $2 AND revoked = FALSE`,
                [existing.user_id, existing.family_id]
            );
            return { ok: false, code: 'REFRESH_REUSED' };
        }
        if (existing.deleted_at || !existing.email_verified
            || new Date(existing.expires_at) <= new Date()) {
            await trx.query(
                `UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW(),
                        revoke_reason = 'account_or_token_invalid'
                 WHERE id = $1`, [existing.id]
            );
            return { ok: false, code: 'REFRESH_INVALID' };
        }
        const user = {
            id: existing.user_id,
            email: existing.email,
            username: existing.username,
            full_name: existing.full_name,
            role: existing.role,
            email_verified: existing.email_verified,
            session_version: existing.session_version,
        };
        const next = await createRefreshSession(user, meta, trx, existing.family_id);
        await trx.query(
            `UPDATE refresh_tokens
             SET revoked = TRUE, revoked_at = NOW(), revoke_reason = 'rotated',
                 replaced_by_token_id = $2, last_used_at = NOW()
             WHERE id = $1`,
            [existing.id, next.row.id]
        );
        return { ok: true, user, session: next, accessToken: signAccessToken(user) };
    });
}

export async function revokeRefreshToken(rawToken, reason = 'logout') {
    if (!rawToken) return;
    await db.query(
        `UPDATE refresh_tokens SET revoked = TRUE, revoked_at = COALESCE(revoked_at, NOW()),
                revoke_reason = COALESCE(revoke_reason, $2)
         WHERE token_hash = $1`,
        [hashToken(rawToken), reason]
    );
}

export async function revokeAllUserSessions(userId, reason, trx = null) {
    const query = trx ? trx.query.bind(trx) : db.query.bind(db);
    await query(
        `UPDATE refresh_tokens SET revoked = TRUE, revoked_at = COALESCE(revoked_at, NOW()),
                revoke_reason = COALESCE(revoke_reason, $2)
         WHERE user_id = $1 AND revoked = FALSE`,
        [userId, reason]
    );
}

const sameSite = env.COOKIE_SAME_SITE;
const secure = env.NODE_ENV === 'production' || sameSite === 'none';
const refreshCookieOptions = {
    httpOnly: true, secure, sameSite, path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_EXPIRY_DAYS * 86_400_000,
};
const csrfCookieOptions = {
    httpOnly: false, secure, sameSite, path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_EXPIRY_DAYS * 86_400_000,
};

export function setSessionCookies(res, session) {
    res.cookie(REFRESH_COOKIE, session.rawToken, refreshCookieOptions);
    res.cookie(CSRF_COOKIE, session.csrfToken, csrfCookieOptions);
}

export function clearSessionCookies(res) {
    const { maxAge: _refreshMaxAge, ...refreshClearOptions } = refreshCookieOptions;
    const { maxAge: _csrfMaxAge, ...csrfClearOptions } = csrfCookieOptions;
    res.clearCookie(REFRESH_COOKIE, refreshClearOptions);
    res.clearCookie(CSRF_COOKIE, csrfClearOptions);
}

export function requireCsrf(req, res, next) {
    const cookieToken = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.get('x-csrf-token');
    if (!cookieToken || !headerToken) {
        return res.status(403).json({ error: 'CSRF validation failed.', code: 'CSRF_INVALID' });
    }
    const left = Buffer.from(cookieToken);
    const right = Buffer.from(headerToken);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
        return res.status(403).json({ error: 'CSRF validation failed.', code: 'CSRF_INVALID' });
    }
    next();
}
