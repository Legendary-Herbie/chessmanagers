import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { consumeTestEmails } from '../services/EmailService.js';
import { linkGoogleIdentity } from '../services/GoogleAuthService.js';
import { hashToken, randomToken } from '../services/SessionService.js';
import { createClub, createUser } from '../test/factories.js';

const account = (suffix = 'one') => ({
    email: `${suffix}@example.test`,
    username: `user_${suffix}`,
    fullName: `User ${suffix}`,
    password: 'CorrectHorse123!',
});

function cookie(response, name) {
    const raw = response.headers['set-cookie']?.find(value => value.startsWith(`${name}=`));
    return raw?.split(';')[0].slice(name.length + 1);
}

async function registerAndVerify(agent, values, ip) {
    const registered = await agent.post('/api/v1/auth/register')
        .set('X-Forwarded-For', ip).send(values).expect(201);
    const email = consumeTestEmails().find(message => message.type === 'verification');
    const verifyRes = await agent.post('/api/v1/auth/verify-email').set('X-Forwarded-For', ip)
        .send({ token: email.token }).expect(200);
    expect(verifyRes.body).toEqual({
        ok: true,
        alreadyVerified: false,
        message: 'Email verified successfully',
    });
    expect(verifyRes.headers['set-cookie']).toBeUndefined();
    expect(verifyRes.body).not.toHaveProperty('accessToken');
    expect(verifyRes.body).not.toHaveProperty('user');
    return { registered, verificationToken: email.token };
}

describe('authentication lifecycle', () => {
    it('returns a quiet, uncacheable bootstrap response for anonymous visitors', async () => {
        const response = await request(app).get('/api/v1/auth/csrf').expect(200);
        expect(response.body).toEqual({ csrfToken: null });
        expect(response.headers['cache-control']).toBe('no-store');
        await request(app).post('/api/v1/auth/refresh').send({}).expect(403);
    });
    beforeEach(() => { consumeTestEmails(); });

    it('creates the required internal username when registration only asks for a full name', async () => {
        const response = await request(app).post('/api/v1/auth/register')
            .set('X-Forwarded-For', '198.51.100.8')
            .send({ email: 'friendly-signup@example.test', fullName: 'Friendly Player', password: 'CorrectHorse123!' })
            .expect(201);
        expect(response.body.user).toMatchObject({ fullName: 'Friendly Player' });
        expect(response.body.user.username).toMatch(/^Friendly_Player_[A-Za-z0-9]{8}$/);
        const message = consumeTestEmails().find(email => email.type === 'verification');
        expect(message.html).toContain('Verify email address');
        expect(message.html).toContain('href=');
    });

    it('accepts Google callback metadata while still validating code and state', async () => {
        const response = await request(app).get('/api/v1/auth/google/callback')
            .query({
                code: 'google-authorization-code',
                state: 'google-oauth-state',
                iss: 'https://accounts.google.com',
                scope: 'openid email profile',
                authuser: '0',
                prompt: 'consent',
            })
            .expect(302);
        expect(response.headers.location).toContain('/auth/oauth/callback?error=oauth_cancelled');
    });

    it('rejects external authentication continuations before account creation', async () => {
        await request(app).post('/api/v1/auth/register').set('X-Forwarded-For', '198.51.100.9')
            .send({ ...account('unsafe-continuation'), continuation: 'https://evil.example/steal' })
            .expect(400);
        await request(app).post('/api/v1/auth/forgot-password').set('X-Forwarded-For', '198.51.100.9')
            .send({ email: 'missing@example.test', continuation: '//evil.example/steal' })
            .expect(400);
    });

    it('registers separate account identity, verifies once, and rotates a hashed session', async () => {
        const agent = request.agent(app);
        const values = account('rotate');
        const { registered, verificationToken } = await registerAndVerify(agent, values, '198.51.100.10');
        expect(registered.body).toMatchObject({ requiresVerification: true });
        expect(registered.body).not.toHaveProperty('accessToken');
        expect(registered.body.user).toMatchObject({
            username: values.username, fullName: values.fullName, emailVerified: false,
        });
        expect(JSON.stringify(registered.body)).not.toContain('password_hash');

        // Re-verifying the same token returns alreadyVerified = true idempotently
        const reVerify = await agent.post('/api/v1/auth/verify-email').set('X-Forwarded-For', '198.51.100.10')
            .send({ token: verificationToken }).expect(200);
        expect(reVerify.body).toEqual({
            ok: true,
            alreadyVerified: true,
            message: 'Email already verified',
        });

        const login = await agent.post('/api/v1/auth/login').set('X-Forwarded-For', '198.51.100.10')
            .send({ email: values.email, password: values.password }).expect(200);
        expect(login.body.accessToken).toBeTruthy();
        expect(login.headers['set-cookie'].some(value => value.startsWith('cm_refresh=') && value.includes('HttpOnly'))).toBe(true);
        const csrf = cookie(login, 'cm_csrf');
        expect(login.body.csrfToken).toBe(csrf);
        const originalRefresh = cookie(login, 'cm_refresh');
        const csrfBootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
        expect(csrfBootstrap.body).toEqual({ csrfToken: csrf });
        expect(csrfBootstrap.headers['cache-control']).toBe('no-store');
        await agent.post('/api/v1/auth/refresh').send({}).expect(403);
        const refreshed = await agent.post('/api/v1/auth/refresh')
            .set('x-csrf-token', csrf).send({}).expect(200);
        expect(refreshed.body.accessToken).not.toBe(login.body.accessToken);
        const rotatedCsrf = cookie(refreshed, 'cm_csrf');
        expect(refreshed.body.csrfToken).toBe(rotatedCsrf);
        await request(app).post('/api/v1/auth/refresh')
            .set('Cookie', [`cm_refresh=${originalRefresh}`, `cm_csrf=${csrf}`])
            .set('x-csrf-token', csrf).send({}).expect(401);
        await agent.post('/api/v1/auth/refresh')
            .set('x-csrf-token', rotatedCsrf).send({}).expect(401);
        expect((await db.query('SELECT COUNT(*)::INTEGER AS count FROM refresh_tokens')).first.count).toBe(2);
        expect((await db.query(
            `SELECT COUNT(*)::INTEGER AS count FROM refresh_tokens
             WHERE token_hash LIKE '%CorrectHorse%'`
        )).first.count).toBe(0);
    });

    it('handles duplicate email/username and rejects unverified or invalid credentials', async () => {
        const first = account('duplicate');
        await request(app).post('/api/v1/auth/register').set('X-Forwarded-For', '198.51.100.11')
            .send(first).expect(201);
        consumeTestEmails();
        await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '198.51.100.11')
            .send({ email: first.email, password: first.password }).expect(403);
        await request(app).post('/api/v1/auth/register').set('X-Forwarded-For', '198.51.100.11')
            .send({ ...account('other'), email: first.email.toUpperCase() }).expect(409);
        await request(app).post('/api/v1/auth/register').set('X-Forwarded-For', '198.51.100.11')
            .send({ ...account('third'), username: first.username.toUpperCase() }).expect(409);
        await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '198.51.100.11')
            .send({ email: 'missing@example.test', password: 'WrongPassword!' }).expect(401);
    });

    it('uses generic reset requests, rejects reuse, and revokes every prior session', async () => {
        const agent = request.agent(app);
        const values = account('reset');
        await registerAndVerify(agent, values, '198.51.100.12');
        const login = await agent.post('/api/v1/auth/login').set('X-Forwarded-For', '198.51.100.12')
            .send({ email: values.email, password: values.password }).expect(200);
        const oldRefresh = cookie(login, 'cm_refresh');
        const csrf = cookie(login, 'cm_csrf');
        const generic = await request(app).post('/api/v1/auth/forgot-password')
            .set('X-Forwarded-For', '198.51.100.12')
            .send({ email: 'missing@example.test' }).expect(200);
        await request(app).post('/api/v1/auth/forgot-password')
            .set('X-Forwarded-For', '198.51.100.12').send({ email: values.email }).expect(200);
        expect(generic.body.message).toMatch(/eligible account/i);
        const reset = consumeTestEmails().find(message => message.type === 'password-reset');
        await request(app).post('/api/v1/auth/reset-password').set('X-Forwarded-For', '198.51.100.12')
            .send({ token: reset.token, password: 'NewPassword123!' }).expect(200);
        await request(app).post('/api/v1/auth/reset-password').set('X-Forwarded-For', '198.51.100.12')
            .send({ token: reset.token, password: 'AnotherPassword123!' }).expect(400);
        await request(app).post('/api/v1/auth/refresh')
            .set('Cookie', [`cm_refresh=${oldRefresh}`, `cm_csrf=${csrf}`])
            .set('x-csrf-token', csrf).send({}).expect(401);
        await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '198.51.100.12')
            .send({ email: values.email, password: 'NewPassword123!' }).expect(200);
    });

    it('soft-deletes the account, revokes access, and preserves club history', async () => {
        const agent = request.agent(app);
        const values = account('deleted');
        await registerAndVerify(agent, values, '198.51.100.13');
        const user = await db.query('SELECT * FROM users WHERE email = $1', [values.email]).then(result => result.first);
        const club = await createClub(user);
        const login = await agent.post('/api/v1/auth/login').set('X-Forwarded-For', '198.51.100.13')
            .send({ email: values.email, password: values.password }).expect(200);
        const csrf = cookie(login, 'cm_csrf');
        await agent.delete('/api/v1/auth/account')
            .set('Authorization', `Bearer ${login.body.accessToken}`)
            .set('x-csrf-token', csrf)
            .send({ confirmation: 'DELETE', currentPassword: values.password }).expect(200);
        expect((await db.query('SELECT deleted_at FROM users WHERE id = $1', [user.id])).first.deleted_at).toBeTruthy();
        expect((await db.query('SELECT id FROM clubs WHERE id = $1', [club.id])).first.id).toBe(club.id);
        await request(app).get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${login.body.accessToken}`).expect(401);
        await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '198.51.100.13')
            .send({ email: values.email, password: values.password }).expect(401);
    });

    it('links a verified Google identity separately from the global account and club data', async () => {
        const user = await createUser({ email: 'google@example.test' });
        const state = randomToken();
        await db.query(
            `INSERT INTO oauth_states (state_hash, provider, expires_at)
             VALUES ($1, 'google', NOW() + INTERVAL '10 minutes')`, [hashToken(state)]
        );
        const result = await linkGoogleIdentity({
            state,
            payload: { sub: 'google-subject-1', email: user.email, email_verified: true, name: 'Google User' },
        });
        expect(result.ok).toBe(true);
        expect(result.user.id).toBe(user.id);
        expect((await db.query(
            `SELECT provider, provider_subject, user_id FROM oauth_identities
             WHERE provider = 'google'`
        )).first).toEqual({ provider: 'google', provider_subject: 'google-subject-1', user_id: user.id });
        expect((await db.query('SELECT COUNT(*)::INTEGER AS count FROM user_clubs WHERE user_id = $1', [user.id])).first.count).toBe(0);
    });

    it('creates a verified global account for a new Google identity without creating club data', async () => {
        const state = randomToken();
        await db.query(
            `INSERT INTO oauth_states (state_hash, provider, continuation, expires_at)
             VALUES ($1, 'google', '/clubs/club_public', NOW() + INTERVAL '10 minutes')`,
            [hashToken(state)]
        );

        const result = await linkGoogleIdentity({
            state,
            payload: {
                sub: 'google-new-account-subject',
                email: 'New.Google.Account@Example.test',
                email_verified: true,
                name: 'New Google Account',
            },
        });

        expect(result).toMatchObject({
            ok: true,
            continuation: '/clubs/club_public',
            user: {
                email: 'new.google.account@example.test',
                full_name: 'New Google Account',
                email_verified: true,
            },
        });
        expect(result.accessToken).toBeTruthy();
        expect((await db.query(
            `SELECT COUNT(*)::INTEGER AS count FROM oauth_identities
             WHERE user_id = $1 AND provider = 'google'`, [result.user.id]
        )).first.count).toBe(1);
        expect((await db.query(
            'SELECT COUNT(*)::INTEGER AS count FROM user_clubs WHERE user_id = $1',
            [result.user.id]
        )).first.count).toBe(0);
    });

    it('rejects expired verification tokens with specific error message and invalidates access on logout-all', async () => {
        const expiredUser = await createUser({ email: 'expired@example.test', emailVerified: false });
        const expiredToken = randomToken();
        await db.query(
            `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
             VALUES ($1, $2, NOW() - INTERVAL '1 minute')`,
            [expiredUser.id, hashToken(expiredToken)]
        );
        const expiredRes = await request(app).post('/api/v1/auth/verify-email').set('X-Forwarded-For', '198.51.100.14')
            .send({ token: expiredToken }).expect(400);
        expect(expiredRes.body).toEqual({
            code: 'VERIFICATION_TOKEN_EXPIRED',
            error: 'Verification link expired',
        });

        const invalidRes = await request(app).post('/api/v1/auth/verify-email').set('X-Forwarded-For', '198.51.100.14')
            .send({ token: 'invalid_token_which_does_not_exist_at_all' }).expect(400);
        expect(invalidRes.body).toEqual({
            code: 'VERIFICATION_TOKEN_INVALID',
            error: 'Invalid verification link',
        });

        const agent = request.agent(app);
        const values = account('logoutall');
        await registerAndVerify(agent, values, '198.51.100.14');
        const login = await agent.post('/api/v1/auth/login').set('X-Forwarded-For', '198.51.100.14')
            .send({ email: values.email, password: values.password }).expect(200);
        const csrf = cookie(login, 'cm_csrf');
        await agent.post('/api/v1/auth/logout-all')
            .set('Authorization', `Bearer ${login.body.accessToken}`)
            .set('x-csrf-token', csrf).send({}).expect(200);
        await request(app).get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${login.body.accessToken}`).expect(401);
    });

    it('handles concurrent verification requests safely and idempotently', async () => {
        const agent = request.agent(app);
        const values = account('concurrent');
        await agent.post('/api/v1/auth/register')
            .set('X-Forwarded-For', '198.51.100.15').send(values).expect(201);
        const email = consumeTestEmails().find(message => message.type === 'verification');
        const token = email.token;

        const [res1, res2] = await Promise.all([
            agent.post('/api/v1/auth/verify-email').set('X-Forwarded-For', '198.51.100.15').send({ token }),
            agent.post('/api/v1/auth/verify-email').set('X-Forwarded-For', '198.51.100.15').send({ token }),
        ]);

        expect(res1.status).toBe(200);
        expect(res2.status).toBe(200);
        const messages = [res1.body.message, res2.body.message];
        expect(messages).toContain('Email verified successfully');
        expect(messages).toContain('Email already verified');

        const dbUser = await db.query('SELECT email_verified, email_verified_at FROM users WHERE email = $1', [values.email]).then(r => r.first);
        expect(dbUser.email_verified).toBe(true);
        expect(dbUser.email_verified_at).toBeTruthy();
    });

    it('returns already verified when an older unused token is opened for an already verified account without modifying token', async () => {
        const agent = request.agent(app);
        const values = account('oldtoken');
        await agent.post('/api/v1/auth/register')
            .set('X-Forwarded-For', '198.51.100.16').send(values).expect(201);
        const token1 = consumeTestEmails().find(message => message.type === 'verification').token;

        // Resend to get token2
        await agent.post('/api/v1/auth/resend-verification')
            .set('X-Forwarded-For', '198.51.100.16').send({ email: values.email }).expect(200);
        const token2 = consumeTestEmails().find(message => message.type === 'verification').token;

        // Verify with token2
        const verifyRes = await agent.post('/api/v1/auth/verify-email')
            .set('X-Forwarded-For', '198.51.100.16').send({ token: token2 }).expect(200);
        expect(verifyRes.body.message).toBe('Email verified successfully');

        // Now user clicks token1 (which was superseded when token2 was issued)
        const oldTokenRes = await agent.post('/api/v1/auth/verify-email')
            .set('X-Forwarded-For', '198.51.100.16').send({ token: token1 }).expect(200);
        expect(oldTokenRes.body).toEqual({
            ok: true,
            alreadyVerified: true,
            message: 'Email already verified',
        });
    });

    it('rate-limits repeated login attempts independently from the global limiter', async () => {
        for (let index = 0; index < 10; index += 1) {
            await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '198.51.100.99')
                .send({ email: 'missing@example.test', password: 'WrongPassword!' }).expect(401);
        }
        await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '198.51.100.99')
            .send({ email: 'missing@example.test', password: 'WrongPassword!' }).expect(429);
    });
});
