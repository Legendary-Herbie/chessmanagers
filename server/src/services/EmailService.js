import nodemailer from 'nodemailer';
import env from '../config/env.js';

const testEmails = [];

function frontendUrl(path) {
    const origin = env.FRONTEND_URL || env.CORS_ORIGIN[0];
    return `${origin}${path}`;
}

async function deliver({ to, subject, text, html, type, token }) {
    if (env.NODE_ENV === 'test') {
        testEmails.push({ to, subject, text, html, type, token });
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
    await transport.sendMail({ from: env.SMTP_FROM, to, subject, text, html });
    return true;
}

export function sendVerificationEmail(user, token, continuation = '') {
    const params = new URLSearchParams({ token });
    if (continuation) params.set('continue', continuation);
    const url = frontendUrl(`/auth/verify?${params}`);
    return deliver({
        to: user.email,
        subject: 'Verify your Chess Managers email',
        text: `Welcome to Chess Managers. Verify your email: ${url}\n\nThis link expires in ${env.EMAIL_VERIFICATION_EXPIRY_HOURS} hours.`,
        html: `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:40px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe4ea;border-radius:16px"><tr><td style="padding:36px"><div style="font-size:22px;font-weight:800;color:#2f6fed">Chess Managers</div><h1 style="margin:28px 0 12px;font-size:28px;color:#172033">Verify your email</h1><p style="margin:0 0 26px;line-height:1.6;color:#526071">Confirm this address to finish creating your account and continue to your club.</p><a href="${url}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#2f6fed;color:#ffffff;text-decoration:none;font-weight:700">Verify email address</a><p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:#748094">This link expires in ${env.EMAIL_VERIFICATION_EXPIRY_HOURS} hours. If you did not create an account, you can ignore this email.</p></td></tr></table></td></tr></table></body></html>`,
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
