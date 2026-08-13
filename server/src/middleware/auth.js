import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { UserModel } from '../models/User.js';

const { JWT_SECRET } = env;

// Verifies the JWT from the Authorization header and attaches the decoded
// Expected header: Authorization: Bearer <token>
export async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    const token = authHeader.slice(7); // strip 'Bearer '

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await UserModel.findById(decoded.id);
        if (!user) return res.status(401).json({ error: 'User not found.' });
        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            playerId: user.player_id ?? null,
            linkStatus: user.link_status ?? null,
        };
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
export async function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    const token = authHeader.slice(7);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await UserModel.findById(decoded.id);
        req.user = user ? {
            id: user.id,
            email: user.email,
            role: user.role,
            playerId: user.player_id ?? null,
            linkStatus: user.link_status ?? null,
        } : null;
    } catch {
        req.user = null;
    }

    next();
}
