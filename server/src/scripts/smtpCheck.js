import process from 'node:process';
import nodemailer from 'nodemailer';
import env from '../config/env.js';

const recipient = process.env.SMTP_TEST_RECIPIENT?.trim();
if (!recipient) {
    console.error('Set SMTP_TEST_RECIPIENT to an inbox you can inspect.');
    process.exit(1);
}
if (!env.SMTP_HOST || !env.SMTP_FROM) {
    console.error('SMTP_HOST and SMTP_FROM must be configured.');
    process.exit(1);
}

const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    disableFileAccess: true,
    disableUrlAccess: true,
});

await transport.verify();
const result = await transport.sendMail({
    from: env.SMTP_FROM,
    to: recipient,
    subject: '1chessclub production SMTP check',
    text: `SMTP delivery check sent at ${new Date().toISOString()}.`,
});
console.log(`SMTP accepted the test message: ${result.messageId}`);
console.log('Confirm inbox receipt and inspect SPF, DKIM and DMARC results before launch.');
transport.close();
