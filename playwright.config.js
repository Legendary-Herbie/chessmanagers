import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';

const databaseUrl = process.env.DATABASE_URL
    || 'postgres://postgres:postgres@127.0.0.1:5432/chessmanagers_e2e';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    reporter: process.env.CI
        ? [['line'], ['html', { open: 'never' }]]
        : [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: 'http://127.0.0.1:3000',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: [
        {
            command: 'npm run server',
            url: 'http://127.0.0.1:5000/health',
            timeout: 120_000,
            reuseExistingServer: !process.env.CI,
            env: {
                ...process.env,
                NODE_ENV: 'development',
                PORT: '5000',
                DATABASE_URL: databaseUrl,
                JWT_SECRET: process.env.JWT_SECRET || 'e2e-only-jwt-secret-at-least-thirty-two-characters',
                FRONTEND_URL: 'http://127.0.0.1:3000',
                CORS_ORIGIN: 'http://127.0.0.1:3000',
                SMTP_HOST: process.env.SMTP_HOST || '127.0.0.1',
                SMTP_PORT: process.env.SMTP_PORT || '1025',
                SMTP_SECURE: 'false',
                SMTP_FROM: '1chessclub E2E <noreply@e2e.invalid>',
            },
        },
        {
            command: 'npm run start -- --host 127.0.0.1',
            url: 'http://127.0.0.1:3000/auth/register',
            timeout: 120_000,
            reuseExistingServer: !process.env.CI,
        },
    ],
});
