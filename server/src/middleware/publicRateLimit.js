import rateLimit from 'express-rate-limit';

// Shared across discovery and public detail routes so switching routes cannot bypass the limit.
export const publicReadLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many public requests. Please try again shortly.' },
});
