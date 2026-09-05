import env from '../config/env.js';
import { UserModel } from '../models/User.js';
import {
    authenticatePassword,
    changeAccountPassword,
    deleteAccount,
    logoutAllSessions,
    registerAccount,
    requestPasswordReset,
    resendVerification,
    resetPassword,
    toAuthUser,
    verifyEmailToken,
} from '../services/AuthService.js';
import {
    completeGoogleOAuth,
    safeContinuation,
    startGoogleOAuth,
} from '../services/GoogleAuthService.js';
import {
    clearSessionCookies,
    CSRF_COOKIE,
    REFRESH_COOKIE,
    revokeRefreshToken,
    rotateRefreshSession,
    setSessionCookies,
} from '../services/SessionService.js';

const FAILURES = {
    EMAIL_ALREADY_EXISTS: [409, 'An account with that email already exists.'],
    USERNAME_ALREADY_EXISTS: [409, 'An account with that username already exists.'],
    INVALID_CREDENTIALS: [401, 'Invalid email or password.'],
    EMAIL_VERIFICATION_REQUIRED: [403, 'Verify your email before signing in.'],
    VERIFICATION_TOKEN_INVALID: [400, 'Invalid verification link'],
    VERIFICATION_TOKEN_EXPIRED: [400, 'Verification link expired'],
    PASSWORD_RESET_TOKEN_INVALID: [400, 'This password reset link is invalid or expired.'],
    CURRENT_PASSWORD_INVALID: [401, 'Current password is incorrect.'],
    ACCOUNT_NOT_FOUND: [404, 'Account not found.'],
    REFRESH_REQUIRED: [401, 'Session refresh is required.'],
    REFRESH_INVALID: [401, 'Session expired. Please sign in again.'],
    REFRESH_REUSED: [401, 'Session reuse was detected. Please sign in again.'],
    GOOGLE_OAUTH_NOT_CONFIGURED: [503, 'Google sign-in is not configured.'],
    GOOGLE_OAUTH_INVALID: [401, 'Google sign-in could not be completed.'],
    OAUTH_STATE_INVALID: [400, 'Google sign-in state is invalid or expired.'],
};

const meta = req => ({ ip: req.ip, userAgent: req.get('user-agent') ?? null });

function sendFailure(res, result) {
    const [status, message] = FAILURES[result.code] ?? [400, 'Authentication operation failed.'];
    return res.status(status).json({ error: message, code: result.code });
}

function sessionResponse(res, result, status = 200) {
    setSessionCookies(res, result.session);
    return res.status(status).json({
        accessToken: result.accessToken,
        csrfToken: result.session.csrfToken,
        user: toAuthUser(result.user),
    });
}

export function getCsrfToken(req, res) {
    res.set('Cache-Control', 'no-store');
    const csrfToken = req.cookies?.[CSRF_COOKIE];
    if (!req.cookies?.[REFRESH_COOKIE] || !csrfToken) {
        return res.json({ csrfToken: null });
    }
    return res.json({ csrfToken });
}

export async function register(req, res, next) {
    try {
        const result = await registerAccount(req.validated, meta(req));
        if (!result.ok) return sendFailure(res, result);
        res.status(201).json({
            user: toAuthUser(result.user),
            requiresVerification: true,
            message: 'Check your email to verify your account.',
        });
    } catch (error) {
        if (error.code === '23505') {
            const code = error.constraint?.includes('username')
                ? 'USERNAME_ALREADY_EXISTS' : 'EMAIL_ALREADY_EXISTS';
            return sendFailure(res, { code });
        }
        next(error);
    }
}

export async function verifyEmail(req, res, next) {
    try {
        const result = await verifyEmailToken(req.validated.token);
        if (!result.ok) return sendFailure(res, result);
        const alreadyVerified = Boolean(result.alreadyVerified);
        res.json({
            ok: true,
            alreadyVerified,
            message: alreadyVerified ? 'Email already verified' : 'Email verified successfully',
        });
    } catch (error) { next(error); }
}

export async function resendEmailVerification(req, res, next) {
    try {
        await resendVerification(
            req.validated.email, req.validated.continuation ?? '', meta(req)
        );
        res.json({ message: 'If the account needs verification, a new email has been sent.' });
    } catch (error) { next(error); }
}

export async function login(req, res, next) {
    try {
        const result = await authenticatePassword(req.validated.email, req.validated.password, meta(req));
        if (!result.ok) return sendFailure(res, result);
        return sessionResponse(res, result);
    } catch (error) { next(error); }
}

export async function refresh(req, res, next) {
    try {
        const result = await rotateRefreshSession(req.cookies?.[REFRESH_COOKIE], meta(req));
        if (!result.ok) {
            clearSessionCookies(res);
            return sendFailure(res, result);
        }
        return sessionResponse(res, result);
    } catch (error) { next(error); }
}

export async function logout(req, res, next) {
    try {
        await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
        clearSessionCookies(res);
        res.json({ message: 'Signed out.' });
    } catch (error) { next(error); }
}

export async function logoutAll(req, res, next) {
    try {
        await logoutAllSessions(req.user.id);
        clearSessionCookies(res);
        res.json({ message: 'Signed out on all devices.' });
    } catch (error) { next(error); }
}

export async function getMe(req, res, next) {
    try {
        const user = await UserModel.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found.' });
        res.json({ user: toAuthUser(user) });
    } catch (error) { next(error); }
}

export async function changePassword(req, res, next) {
    try {
        const result = await changeAccountPassword(
            req.user.id, req.validated.currentPassword, req.validated.newPassword
        );
        if (!result.ok) return sendFailure(res, result);
        clearSessionCookies(res);
        res.json({ message: 'Password updated. Sign in again on this and other devices.' });
    } catch (error) { next(error); }
}

export async function forgotPassword(req, res, next) {
    try {
        await requestPasswordReset(
            req.validated.email, req.validated.continuation ?? '', meta(req)
        );
        res.json({ message: 'If an eligible account exists, a reset email has been sent.' });
    } catch (error) { next(error); }
}

export async function completePasswordReset(req, res, next) {
    try {
        const result = await resetPassword(req.validated.token, req.validated.password);
        if (!result.ok) return sendFailure(res, result);
        clearSessionCookies(res);
        res.json({ message: 'Password reset. Sign in with your new password.' });
    } catch (error) { next(error); }
}

export async function softDeleteAccount(req, res, next) {
    try {
        const result = await deleteAccount(req.user.id, req.validated);
        if (!result.ok) return sendFailure(res, result);
        clearSessionCookies(res);
        res.json({ message: 'Account deleted.' });
    } catch (error) { next(error); }
}

const oauthCookie = {
    httpOnly: true,
    secure: env.NODE_ENV === 'production' || env.COOKIE_SAME_SITE === 'none',
    sameSite: env.COOKIE_SAME_SITE,
    path: '/api/v1/auth/google/callback',
    maxAge: 10 * 60 * 1000,
};
const { maxAge: _oauthMaxAge, ...oauthClearCookie } = oauthCookie;

function oauthFrontendRedirect(params) {
    const frontend = env.FRONTEND_URL || env.CORS_ORIGIN.find(origin => !origin.includes('*'));
    if (!frontend) throw Object.assign(new Error('FRONTEND_URL is required for Google OAuth.'), { status: 503 });
    const url = new URL('/auth/oauth/callback', frontend);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
}

export async function googleStart(req, res, next) {
    try {
        const result = await startGoogleOAuth(req.validatedQuery.continuation, meta(req));
        if (!result.ok) return sendFailure(res, result);
        res.cookie('cm_oauth_state', result.state, oauthCookie);
        res.redirect(302, result.url);
    } catch (error) { next(error); }
}

export async function googleCallback(req, res, next) {
    try {
        if (req.validatedQuery.error || !req.cookies?.cm_oauth_state
            || req.cookies.cm_oauth_state !== req.validatedQuery.state) {
            res.clearCookie('cm_oauth_state', oauthClearCookie);
            return res.redirect(302, oauthFrontendRedirect({ error: 'oauth_cancelled' }));
        }
        const result = await completeGoogleOAuth({
            code: req.validatedQuery.code,
            state: req.validatedQuery.state,
            meta: meta(req),
        });
        res.clearCookie('cm_oauth_state', oauthClearCookie);
        if (!result.ok) {
            return res.redirect(302, oauthFrontendRedirect({ error: result.code }));
        }
        setSessionCookies(res, result.session);
        return res.redirect(302, oauthFrontendRedirect({
            continuation: safeContinuation(result.continuation),
        }));
    } catch (error) {
        res.clearCookie('cm_oauth_state', oauthClearCookie);
        next(error);
    }
}
