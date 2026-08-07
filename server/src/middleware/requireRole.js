import { ClubModel } from '../models/Club.js';

// Global/system-level role check (e.g. 'admin')
export function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'You do not have permission to perform this action.' });
        }
        next();
    };
}

// Verifies the authenticated user belongs to the club in req.params.clubId.
// This is a strict club-level membership check. System-level admins do not bypass this here.
export async function requireClubMember(req, res, next) {
    try {
        const { clubId } = req.params;
        if (!clubId) return res.status(400).json({ error: 'Club ID is required.' });
        if (!req.user) return res.status(401).json({ error: 'Authentication required.' });

        const membership = await ClubModel.getMembership(clubId, req.user.id);
        if (!membership) return res.status(403).json({ error: 'You are not a member of this club.' });

        req.clubMembership = membership;
        req.club = await ClubModel.findById(clubId);
        next();
    } catch (err) {
        next(err);
    }
}

// Ensures the authenticated user is a club admin or owner for the club in req.params.clubId.
export async function requireClubAdmin(req, res, next) {
    try {
        const { clubId } = req.params;
        if (!clubId) return res.status(400).json({ error: 'Club ID is required.' });
        if (!req.user) return res.status(401).json({ error: 'Authentication required.' });

        const membership = await ClubModel.getMembership(clubId, req.user.id);
        if (!membership) return res.status(403).json({ error: 'You are not a member of this club.' });

        if (!['admin', 'owner'].includes(membership.role)) {
            return res.status(403).json({ error: 'Club admin rights required.' });
        }

        req.clubMembership = membership;
        req.club = await ClubModel.findById(clubId);
        next();
    } catch (err) {
        next(err);
    }
}

// Ensures the authenticated linked player is operating on their own player record.
export function requireSelfOrAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (req.user.role === 'admin') return next();
    const isOwnPlayer = req.user.playerId && req.user.playerId === req.params.playerId;
    if (!isOwnPlayer) return res.status(403).json({ error: 'You can only modify your own player profile.' });
    next();
}
