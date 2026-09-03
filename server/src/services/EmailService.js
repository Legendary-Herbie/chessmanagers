import nodemailer from 'nodemailer';
import env from '../config/env.js';

const testEmails = [];

function frontendUrl(path) {
    const origin = env.FRONTEND_URL || env.CORS_ORIGIN[0];
    return `${origin}${path}`;
}

async function deliver({ to, subject, text, type, token }) {
    if (env.NODE_ENV === 'test') {
        testEmails.push({ to, subject, text, type, token });
        return true;
    }
    if (!env.SMTP_HOST || !env.SMTP_FROM) {
        if (env.NODE_ENV === 'development') console.info(`[DEV EMAIL] ${subject}: ${text}`);
        return false;
    }
    const transport = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        disableFileAccess: true,
        disableUrlAccess: true,
    });
    await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
    return true;
}

export function sendVerificationEmail(user, token, continuation = '') {
    const params = new URLSearchParams({ token });
    if (continuation) params.set('continue', continuation);
    const url = frontendUrl(`/auth/verify?${params}`);
    return deliver({
        to: user.email,
        subject: 'Verify your Chess Managers email',
        text: `Verify your email by opening ${url}`,
        type: 'verification',
        token,
    });
}

export function sendPasswordResetEmail(user, token, continuation = '') {
    const params = new URLSearchParams({ token });
    if (continuation) params.set('continue', continuation);
    const url = frontendUrl(`/auth/reset-password?${params}`);
    return deliver({
        to: user.email,
        subject: 'Reset your Chess Managers password',
        text: `Reset your password by opening ${url}`,
        type: 'password-reset',
        token,
    });
}

export function sendNotificationEmail({ to, clubName, eventType }) {
    const readableEvent = eventType.replaceAll('.', ' ').replaceAll('_', ' ');
    return deliver({
        to,
        subject: `${clubName}: ${readableEvent}`,
        text: `You have a new ${readableEvent} notification from ${clubName}. Open Chess Managers to view it.`,
        type: 'notification',
        token: null,
    });
}

export function consumeTestEmails() {
    return testEmails.splice(0, testEmails.length);
}
