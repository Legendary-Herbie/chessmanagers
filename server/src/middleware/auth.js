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
        if (decoded.type && decoded.type !== 'access') {
            return res.status(401).json({ error: 'Invalid token.' });
        }
        const user = await UserModel.findById(decoded.id);
        if (!user) return res.status(401).json({ error: 'User not found.' });
        if (!user.email_verified) {
            return res.status(403).json({
                error: 'Verify your email before continuing.',
                code: 'EMAIL_VERIFICATION_REQUIRED',
            });
        }
        if (decoded.sv !== undefined && decoded.sv !== user.session_version) {
            return res.status(401).json({ error: 'Session expired. Please log in again.' });
        }
        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
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
        if (decoded.type && decoded.type !== 'access') throw new Error('Invalid token type');
        const user = await UserModel.findById(decoded.id);
        const active = user?.email_verified
            && (decoded.sv === undefined || decoded.sv === user.session_version);
        req.user = active ? {
            id: user.id,
            email: user.email,
            role: user.role,
        } : null;
    } catch {
        req.user = null;
    }

    next();
}
