import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const DEV_FRONTEND_URL = process.env.FRONTEND_URL_DEV || 'http://localhost:3000';
const PROD_FRONTEND_URL = process.env.FRONTEND_URL_PROD;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultFrontendUrl = process.env.NODE_ENV === 'production' ? PROD_FRONTEND_URL : DEV_FRONTEND_URL;
const sanitizeUrl = (url) => url ? url.trim().replace(/\/$/, '') : url;

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const parseCsvList = (value) => value
    .split(',')
    .map(item => sanitizeUrl(item))
    .filter(Boolean);

const buildCorsOriginInput = () => {
    const configured = parseCsvList(process.env.CORS_ORIGIN || '');
    const frontend = sanitizeUrl(process.env.FRONTEND_URL || defaultFrontendUrl);
    const defaults = process.env.NODE_ENV === 'production'
        ? [PROD_FRONTEND_URL]
        : [DEV_FRONTEND_URL];

    const deduped = [...new Set([...configured, frontend, ...defaults].filter(Boolean))];
    return deduped.join(',');
};

const envSchema = z.object({
    PORT: z.string().transform(Number).default(process.env.PORT || '5000'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    CORS_ORIGIN: z
        .string()
        .default('https://chess-club-manager-blush.vercel.app')
        .transform(parseCsvList)
        .refine(origins => origins.length > 0, 'CORS_ORIGIN must include at least one origin'),
    FRONTEND_URL: z.string().default(defaultFrontendUrl),
    SERVE_FRONTEND: z
        .preprocess(
            val => (typeof val === 'string' ? val.toLowerCase() === 'true' : Boolean(val)),
            z.boolean()
        )
        .default(false),
    MAX_CLUBS_PER_USER: z.string().transform(Number).default(process.env.MAX_CLUBS_PER_USER || '2'),
    REFRESH_TOKEN_EXPIRY_DAYS: z.string().transform(Number).default('30'),
    DB_TYPE: z.enum(['sqlite', 'postgres']).default('sqlite'),
    DATABASE_URL: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().transform(Number).default('587'),
    SMTP_SECURE: z
        .preprocess(
            val => (typeof val === 'string' ? val.toLowerCase() === 'true' : Boolean(val)),
            z.boolean()
        )
        .default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional()
});

const envInput = {
    ...process.env,
    FRONTEND_URL: process.env.FRONTEND_URL || defaultFrontendUrl,
    CORS_ORIGIN: buildCorsOriginInput()
};

const result = envSchema.safeParse(envInput);

if (!result.success) {
    console.error('\n\x1b[31m[CRITICAL ERROR] Invalid environment variables:\x1b[0m');
    const formatted = result.error.format();
    for (const [key, value] of Object.entries(formatted)) {
        if (key !== '_errors') {
            console.error(`  - ${key}: ${value._errors.join(', ')}`);
        }
    }
    console.error('\n\n');
    process.exit(1);
}

export const env = result.data;
export default env;