import env from '../config/env.js';

const isProd = env.NODE_ENV === 'production';

// In production, internal details are never sent to the client.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
    // Log everything server-side regardless of environment
    console.error(`[ERROR] ${req.method} ${req.path}`, err);

    // ── Known error types ─────────────────────────────────────────────────────

    // Malformed JSON body
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ error: 'Invalid JSON payload.' });
    }

    // JWT errors (in case they bubble up outside auth middleware)
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid token.' });
    }
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    // Postgres unique constraint violation (error code 23505)
    if (err.code === '23505') {
        return res.status(409).json({
            error: isProd ? 'A record with that value already exists.' : err.detail,
        });
    }

    // Postgres foreign key violation (error code 23503)
    if (err.code === '23503') {
        return res.status(400).json({
            error: isProd ? 'Referenced record does not exist.' : err.detail,
        });
    }

    // Postgres not-null violation (error code 23502)
    if (err.code === '23502') {
        return res.status(400).json({
            error: isProd ? 'A required field is missing.' : `Column '${err.column}' cannot be null.`,
        });
    }

    // Explicit status set by application code (e.g. throw Object.assign(new Error(...), { status: 422 }))
    if (err.status && err.status < 500) {
        return res.status(err.status).json({ error: err.message });
    }

    // ── Fallback 500 ──────────────────────────────────────────────────────────
    res.status(500).json({
        error:   'Internal Server Error',
        // Never expose stack traces or internal messages in production
        message: isProd ? undefined : err.message,
        stack:   isProd ? undefined : err.stack,
    });
}

// ── 404 handler ───────────────────────────────────────────────────────────────
export function notFound(req, res) {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}