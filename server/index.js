import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import env from './src/config/env.js';
import db from './src/database/database.js';

const app = express();
const { PORT, CORS_ORIGIN, NODE_ENV, SERVE_FRONTEND } = env;

// ─── CORS ─────────────────────────────────────────────────────────────────────

const escapeRegex = (value) => value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');

const createOriginMatcher = (origins) => {
    const exactOrigins = new Set();
    const wildcardPatterns = [];

    for (const origin of origins) {
        if (!origin) continue;
        if (origin === '*') {
            wildcardPatterns.push(/^https?:\/\/.+$/);
            continue;
        }
        if (origin.includes('*')) {
            const pattern = origin.split('*').map(part => escapeRegex(part)).join('.*');
            wildcardPatterns.push(new RegExp(`^${pattern}$`));
            continue;
        }
        exactOrigins.add(origin);
    }

    return (requestOrigin) => {
        if (!requestOrigin) return true;
        if (exactOrigins.has(requestOrigin)) return true;
        return wildcardPatterns.some(pattern => pattern.test(requestOrigin));
    };
};

const isOriginAllowed = createOriginMatcher(CORS_ORIGIN);

// ─── Core Middleware ───────────────────────────────────────────────────────────

// trust proxy: 1 assumes a single reverse proxy hop (Nginx, Railway, Heroku, etc.)
app.set('trust proxy', 1);

app.use(helmet());

app.use(cors({
    origin: (requestOrigin, callback) => {
        if (!requestOrigin) return callback(null, true);
        if (isOriginAllowed(requestOrigin)) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Blocked origin: ${requestOrigin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
    credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));

// ─── Rate Limiting ─────────────────────────────────────────────────────────────

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.',
});
app.use(globalLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (req, res) =>
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ─── Static Frontend (Production) ─────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '../dist');
const distIndexPath = path.join(distPath, 'index.html');
const shouldServeFrontend = NODE_ENV === 'production' && SERVE_FRONTEND && fs.existsSync(distIndexPath);

if (NODE_ENV === 'production' && SERVE_FRONTEND && !shouldServeFrontend) {
    console.warn('[WARN] SERVE_FRONTEND=true but dist/index.html not found; running in API-only mode.');
}

if (shouldServeFrontend) {
    app.use(express.static(distPath));

    app.get('*', (req, res, next) => {
        if (!req.path.startsWith('/api/') && req.path !== '/health') {
            return res.sendFile(distIndexPath);
        }
        next();
    });
} else {
    // Homepage — dev / API-only mode
    app.get('/', (req, res) => {
        res.json({
            status: 'ok',
            service: 'chess-club-manager-api',
            environment: NODE_ENV,
        });
    });
}

// ─── 404 ──────────────────────────────────────────────────────────────────────
// Catches all unmatched routes and returns a consistent JSON response.

app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// ─── Global Error Handler ──────────────────────────────────────────────────────
// Express requires exactly 4 arguments to identify an error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
    console.error('[ERROR] Unhandled:', err);

    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    const isProd = NODE_ENV === 'production';

    res.status(err.status || 500).json({
        error: isProd ? 'Internal Server Error' : (err.message || 'Internal Server Error'),
        details: isProd ? undefined : err.message,
        stack: isProd ? undefined : err.stack,
    });
});

// ─── Export (for testing) ──────────────────────────────────────────────────────

export default app;

// ─── Server Bootstrap ──────────────────────────────────────────────────────────
// Skipped in test mode so test runners can import `app` without side effects.

if (NODE_ENV !== 'test') {
    db.init()
        .then(() => {
            console.log(`[INFO] Allowed CORS origins: ${CORS_ORIGIN.join(', ')}`);

            const server = app.listen(PORT, () => {
                console.log(`[INFO] Server running on port ${PORT}`);
            });

            const gracefulShutdown = (signal) => {
                console.log(`\n[INFO] ${signal} received — shutting down gracefully...`);
                server.close(() => {
                    console.log('[INFO] Server closed');
                    process.exit(0);
                });
                setTimeout(() => {
                    console.error('[ERROR] Forced shutdown after timeout');
                    process.exit(1);
                }, 10_000);
            };

            process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
            process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        })
        .catch(err => {
            console.error('[FATAL] Database initialisation failed:', err);
            process.exit(1);
        });
}