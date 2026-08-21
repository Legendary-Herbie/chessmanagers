import { OAuth2Client } from 'google-auth-library';
import db from '../database/database.js';
import env from '../config/env.js';
import { UserModel } from '../models/User.js';
import { createRefreshSession, hashToken, randomToken, signAccessToken } from './SessionService.js';

const failure = (code, details = {}) => ({ ok: false, code, ...details });

function client() {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) return null;
    return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

export const googleOAuthConfigured = () => Boolean(client());

export function safeContinuation(value) {
    if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
    return value.slice(0, 1000);
}

export async function startGoogleOAuth(continuation, meta = {}) {
    const oauth = client();
    if (!oauth) return failure('GOOGLE_OAUTH_NOT_CONFIGURED');
    const state = randomToken(32);
    await db.query(
        `INSERT INTO oauth_states
            (state_hash, provider, continuation, expires_at, request_ip, user_agent)
         VALUES ($1, 'google', $2, NOW() + INTERVAL '10 minutes', $3, $4)`,
        [hashToken(state), safeContinuation(continuation), meta.ip ?? null, meta.userAgent ?? null]
    );
    const url = oauth.generateAuthUrl({
        access_type: 'offline',
        scope: ['openid', 'email', 'profile'],
        state,
        prompt: 'select_account',
    });
    return { ok: true, state, url };
}

async function availableUsername(seed, trx) {
    const base = (seed || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '').slice(0, 24) || 'user';
    for (let index = 0; index < 100; index += 1) {
        const candidate = index === 0 ? base : `${base}_${index + 1}`;
        if (!await UserModel.findByUsername(candidate, { includeDeleted: true, trx })) return candidate;
    }
    return `${base}_${randomToken(6).toLowerCase()}`.slice(0, 30);
}

export async function completeGoogleOAuth({ code, state, meta = {} }) {
    const oauth = client();
    if (!oauth) return failure('GOOGLE_OAUTH_NOT_CONFIGURED');
    let payload;
    try {
        const { tokens } = await oauth.getToken(code);
        const ticket = await oauth.verifyIdToken({
            idToken: tokens.id_token,
            audience: env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
    } catch {
        return failure('GOOGLE_OAUTH_INVALID');
    }
    if (!payload?.sub || !payload.email || !payload.email_verified) {
        return failure('GOOGLE_OAUTH_INVALID');
    }

    return linkGoogleIdentity({ payload, state, meta });
}

export async function linkGoogleIdentity({ payload, state, meta = {} }) {
    if (!payload?.sub || !payload.email || !payload.email_verified) {
        return failure('GOOGLE_OAUTH_INVALID');
    }
    return db.transaction(async trx => {
        const stateRow = await trx.query(
            `SELECT * FROM oauth_states
             WHERE state_hash = $1 AND provider = 'google' FOR UPDATE`,
            [hashToken(state)]
        ).then(result => result.first);
        if (!stateRow || stateRow.used_at || new Date(stateRow.expires_at) <= new Date()) {
            return failure('OAUTH_STATE_INVALID');
        }
        await trx.query('UPDATE oauth_states SET used_at = NOW() WHERE id = $1', [stateRow.id]);
        await trx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`google:${payload.sub}`]);

        let user = await trx.query(
            `SELECT account.* FROM oauth_identities identity
             JOIN users account ON account.id = identity.user_id
             WHERE identity.provider = 'google' AND identity.provider_subject = $1`,
            [payload.sub]
        ).then(result => result.first);
        if (user?.deleted_at) return failure('INVALID_CREDENTIALS');
        if (!user) {
            user = await UserModel.findByEmail(payload.email, { includeDeleted: true, trx });
            if (user?.deleted_at) return failure('INVALID_CREDENTIALS');
            if (!user) {
                const username = await availableUsername(payload.email.split('@')[0], trx);
                user = await UserModel.create({
                    email: payload.email,
                    username,
                    fullName: payload.name || username,
                    passwordHash: null,
                    emailVerified: true,
                }, trx);
            } else if (!user.email_verified) {
                user = await UserModel.verifyEmail(user.id, trx);
            }
            await trx.query(
                `INSERT INTO oauth_identities
                    (user_id, provider, provider_subject, provider_email)
                 VALUES ($1, 'google', $2, LOWER($3))
                 ON CONFLICT (provider, provider_subject) DO NOTHING`,
                [user.id, payload.sub, payload.email]
            );
        }
        const session = await createRefreshSession(user, meta, trx);
        return {
            ok: true,
            user,
            session,
            accessToken: signAccessToken(user),
            continuation: safeContinuation(stateRow.continuation),
        };
    });
}
