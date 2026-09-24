import { expect, test } from '@playwright/test';
import process from 'node:process';

const mailpitUrl = process.env.MAILPIT_URL || 'http://127.0.0.1:8025';

async function emailLink(request, recipient, path) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        const listResponse = await request.get(`${mailpitUrl}/api/v1/messages`);
        if (listResponse.ok()) {
            const payload = await listResponse.json();
            const messages = payload.messages || payload.Messages || [];
            for (const item of messages) {
                const recipients = JSON.stringify(item.To || item.to || '');
                if (!recipients.includes(recipient)) continue;
                const id = item.ID || item.Id || item.id;
                const detailResponse = await request.get(`${mailpitUrl}/api/v1/message/${id}`);
                const detail = await detailResponse.json();
                const content = `${detail.Text || detail.text || ''}\n${detail.HTML || detail.html || ''}`;
                const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const match = content.match(new RegExp(`https?://[^\\s"'<>]+${escapedPath}[^\\s"'<>]+`));
                if (match) return match[0].replaceAll('&amp;', '&');
            }
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`No ${path} email arrived for ${recipient}`);
}

test('registration, SMTP verification, login, club persistence, and password reset', async ({ page, request }) => {
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `owner-${unique}@example.test`;
    const originalPassword = 'Launch-test-password-1';
    const newPassword = 'Launch-test-password-2';
    const clubName = `Launch Club ${unique}`;

    await page.goto('/auth/register');
    await page.getByLabel('Your name').fill('Launch Test Owner');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(originalPassword);
    await page.getByLabel('Confirm password').fill(originalPassword);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();

    await page.goto(await emailLink(request, email, '/auth/verify?'));
    await expect(page.getByRole('heading', { name: 'Verification complete' })).toBeVisible();
    await page.getByRole('link', { name: 'Continue to sign in' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(originalPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.goto('/create-club');
    await page.getByLabel('Name').fill(clubName);
    await page.getByLabel('Federation').selectOption('USCF');
    await page.getByRole('button', { name: 'Create Club' }).click();
    await expect(page.getByRole('status')).toContainText('Club created');
    await page.waitForURL('**/dashboard');
    await page.reload();
    await expect(page.getByLabel('Switch active club')).toContainText(clubName);

    await page.getByRole('button', { name: /Launch Test Owner/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await page.goto('/auth/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset email' }).click();
    await expect(page.getByRole('status')).toContainText('If an account exists');

    await page.goto(await emailLink(request, email, '/auth/reset-password?'));
    await page.getByLabel('New password').fill(newPassword);
    await page.getByLabel('Confirm password').fill(newPassword);
    await page.getByRole('button', { name: 'Reset password' }).click();
    await page.getByRole('link', { name: 'Sign in' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(newPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByLabel('Switch active club')).toContainText(clubName);
});
