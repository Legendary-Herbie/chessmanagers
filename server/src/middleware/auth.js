import jwt from 'jsonwebtoken';
import env from '../config/env.js';

const { JWT_SECRET } = env;

// Verifies the JWT from the Authorization header and attaches the decoded
// Expected header: Authorization: Bearer <token>
export function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    const token = authHeader.slice(7); // strip 'Bearer '

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // Attach the decoded payload as req.user so controllers and downstream
        // middleware can access id, email, and role without re-querying the DB.
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Session expired. Please log in again.' });
        }
        return res.status(401).json({ error: 'Invalid token.' });
    }
}

// Optional auth — attaches req.user if a valid token is present, but does not block the request if absent.
// Used for public endpoints that show extra data to authenticated users.
export function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    const token = authHeader.slice(7);

    try {
        req.user = jwt.verify(token, JWT_SECRET);
    } catch {
        req.user = null;
    }

    next();
}