import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from server root, then parent — first file wins for any given key
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'),  quiet: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sanitizeUrl = (url) => (url ? url.trim().replace(/\/$/, '') : url);

const parseCsvList = (value) =>
    value
        .split(',')
        .map(item => sanitizeUrl(item))
        .filter(Boolean);

// Builds the deduplicated CORS origin list from all relevant env vars.
// No URLs are hardcoded here — everything must come from the environment.
const buildCorsOriginInput = () => {
    const configured = parseCsvList(process.env.CORS_ORIGIN || '');
    const frontendUrl = sanitizeUrl(process.env.FRONTEND_URL || '');
    const deduped = [...new Set([...configured, frontendUrl].filter(Boolean))];
    return deduped.join(',');
};

// Safely converts a string to a number, returning undefined for empty strings
// so Zod's .default() can take over instead of producing NaN or 0.
const toNumber = (val) => {
    if (val === '' || val === null || val === undefined) return undefined;
    const n = Number(val);
    return Number.isNaN(n) ? undefined : n;
};

// ─── Schema ───────────────────────────────────────────────────────────────────

const envSchema = z.object({

    // Server
    PORT: z
        .preprocess(toNumber, z.number().int().min(1).max(65535))
        .default(3000),
    NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('development'),

    // Auth
    JWT_SECRET: z
        .string()
        .min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z
        .string()
        .default('7d'),
    REFRESH_TOKEN_EXPIRY_DAYS: z
        .preprocess(toNumber, z.number().int().positive())
        .default(30),

    // CORS — all origins must be supplied via environment, none hardcoded
    CORS_ORIGIN: z
        .string()
        .min(1, 'CORS_ORIGIN must include at least one origin — set CORS_ORIGIN or FRONTEND_URL in .env')
        .transform(parseCsvList)
        .refine(origins => origins.length > 0, 'CORS_ORIGIN must include at least one valid origin'),

    FRONTEND_URL: z
        .string()
        .url('FRONTEND_URL must be a valid URL')
        .optional(),

    SERVE_FRONTEND: z
        .preprocess(
            val => (typeof val === 'string' ? val.toLowerCase() === 'true' : Boolean(val)),
            z.boolean()
        )
        .default(false),

    // Database — Postgres only
    DATABASE_URL: z
        .string()
        .min(1, 'DATABASE_URL is required'),

    // Club limits
    MAX_CLUBS_PER_USER: z
        .preprocess(toNumber, z.number().int().positive())
        .default(2),

    // SMTP — all optional; email features are disabled if not set
    SMTP_HOST:   z.string().optional(),
    SMTP_PORT:   z.preprocess(toNumber, z.number().int().positive()).default(587),
    SMTP_SECURE: z
        .preprocess(
            val => (typeof val === 'string' ? val.toLowerCase() === 'true' : Boolean(val)),
            z.boolean()
        )
        .default(false),
    SMTP_USER:   z.string().optional(),
    SMTP_PASS:   z.string().optional(),
    SMTP_FROM:   z.string().optional(),
});

// ─── Parse ────────────────────────────────────────────────────────────────────
const envInput = {
    ...process.env,
    CORS_ORIGIN: buildCorsOriginInput(),
};

const result = envSchema.safeParse(envInput);

if (!result.success) {
    console.error('\n\x1b[31m[FATAL] Invalid environment variables:\x1b[0m');
    const formatted = result.error.format();
    for (const [key, value] of Object.entries(formatted)) {
        if (key !== '_errors' && value._errors?.length) {
            console.error(`  ${key}: ${value._errors.join(', ')}`);
        }
    }
    console.error('\nCheck your .env file and try again.\n');
    process.exit(1);
}

export const env = result.data;
export default env;