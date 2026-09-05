import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

import env from './src/config/env.js';
import db from './src/database/database.js';
import { startRatingRecalculationWorker } from './src/services/RatingService.js';
import { startNotificationOutboxWorker } from './src/services/NotificationService.js';

// ─── Routes ───────────────────────────────────────────────────────────────────

import authRoutes        from './src/routes/authRoutes.js';
import clubRoutes        from './src/routes/clubRoutes.js';
import playerRoutes      from './src/routes/playerRoutes.js';
import playerLinkRoutes  from './src/routes/playerLinkRoutes.js';
import matchRoutes       from './src/routes/matchRoutes.js';
import tournamentRoutes  from './src/routes/tournamentRoutes.js';
import leaderboardRoutes from './src/routes/leaderboardRoutes.js';
import publicRoutes      from './src/routes/publicRoutes.js';
import notificationRoutes from './src/routes/notificationRoutes.js';
import announcementRoutes from './src/routes/announcementRoutes.js';
import dataExportRoutes from './src/routes/dataExportRoutes.js';

// ─── Error Handling Middleware ─────────────────────────────────────────────────

import { notFound, errorHandler } from './src/middleware/errorHandler.js';

const app = express();
const { PORT, CORS_ORIGIN, NODE_ENV, SERVE_FRONTEND } = env;

// ─── CORS ─────────────────────────────────────────────────────────────────────

const escapeRegex = (value) => value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');

const isLoopbackOrigin = (value) => {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol)
            && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch {
        return false;
    }
};

export const createOriginMatcher = (origins, { allowDevelopmentLoopback = false } = {}) => {
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
        if (allowDevelopmentLoopback && isLoopbackOrigin(requestOrigin)) return true;
        if (exactOrigins.has(requestOrigin)) return true;
        return wildcardPatterns.some(pattern => pattern.test(requestOrigin));
    };
};

if (NODE_ENV === 'production' && CORS_ORIGIN.includes('*')) {
    throw new Error('CORS_ORIGIN cannot be "*" when credentialed requests are enabled in production.');
}

const isOriginAllowed = createOriginMatcher(CORS_ORIGIN, {
    allowDevelopmentLoopback: NODE_ENV === 'development',
});

// ─── Core Middleware ───────────────────────────────────────────────────────────

app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            scriptSrc: ["'self'"],
            // React style props are still used in several existing components.
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            formAction: ["'self'"],
            // Do not upgrade local HTTP development requests to HTTPS.
            upgradeInsecureRequests: NODE_ENV === 'production' ? [] : null,
        },
    },
}));

app.use(cors({
    origin: (requestOrigin, callback) => {
        if (!requestOrigin) return callback(null, true);
        if (isOriginAllowed(requestOrigin)) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Blocked origin: ${requestOrigin}`);
            callback(Object.assign(new Error('Origin is not allowed by CORS.'), {
                status: 403,
                code: 'CORS_ORIGIN_DENIED',
            }));
        }
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
    credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ limit: '100kb', extended: true }));

// ─── Rate Limiting ─────────────────────────────────────────────────────────────

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.',
});
app.use(globalLimiter);

// ─── API Routes ───────────────────────────────────────────────────────────────

app.get('/health', (req, res) =>
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

app.use('/api/v1/auth',   authRoutes);
app.use('/api/v1/public', publicRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/clubs',  clubRoutes);

app.use('/api/v1/clubs/:clubId/players',      playerRoutes);
app.use('/api/v1/clubs/:clubId/player-links', playerLinkRoutes);
app.use('/api/v1/clubs/:clubId/matches',      matchRoutes);
app.use('/api/v1/clubs/:clubId/tournaments',  tournamentRoutes);
app.use('/api/v1/clubs/:clubId/leaderboard',  leaderboardRoutes);
app.use('/api/v1/clubs/:clubId/announcements', announcementRoutes);
app.use('/api/v1/clubs/:clubId/exports', dataExportRoutes);

// ─── Static Frontend (Production) ─────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '../dist');
const distIndexPath = path.join(distPath, 'index.html');
const shouldServeFrontend = NODE_ENV === 'production' && SERVE_FRONTEND && fs.existsSync(distIndexPath);

app.use('/uploads/images', (_req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
}, express.static(path.join(__dirname, 'uploads/images'), {
    fallthrough: false,
    immutable: true,
    maxAge: '1y',
}));

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
    app.get('/', (req, res) => {
        res.json({
            status: 'ok',
            service: 'chess-club-manager-api',
            environment: NODE_ENV,
        });
    });
}

// ─── Error Handling ───────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

// ─── Export (for testing) ──────────────────────────────────────────────────────

export default app;

// ─── Server Bootstrap ──────────────────────────────────────────────────────────
// process.exit() lives here — not inside the DB layer — so pg_database.js
// remains testable and reusable without side effects.

if (NODE_ENV !== 'test') {
    db.init()
        .then(() => {
            startRatingRecalculationWorker();
            startNotificationOutboxWorker();
            console.log(`[INFO] Allowed CORS origins: ${CORS_ORIGIN.join(', ')}`);
            const server = http.createServer({ maxHeaderSize: 64 * 1024 }, app);
            server.listen(PORT, () => {
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
            process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
        })
        .catch(err => {
            // pg_database.js attaches a friendlyMessage for known failure modes.
            const message = err.friendlyMessage ?? err.message;
            console.error(`\n\x1b[31m[FATAL] Database initialisation failed:\x1b[0m\n${message}\n`);
            process.exit(1);
        });
}
