import { ClubModel } from '../models/Club.js';

// Role hierarchy from the spec:
//   admin            — full control over club data
//   linked_player    — approved user linked to a player
//   member           — read-only club access
//
// Usage:
//   requireRole('admin')                    — admin only
//   requireRole('admin', 'linked_player')   — admin or linked player

export function requireRole(...allowedRoles) {
    return (req, res, next) => {
        // requireAuth must run before requireRole — req.user must exist.
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'You do not have permission to perform this action.' });
        }

        next();
    };
}

// Verifies the authenticated user belongs to the club in req.params.clubId.
// Use after requireAuth on any club-scoped route to prevent cross-club access.
//
// Usage: router.get('/:clubId/players', requireAuth, requireClubMember, getPlayers)
export async function requireClubMember(req, res, next) {
    try {
        const { clubId } = req.params;

        if (!clubId) {
            return res.status(400).json({ error: 'Club ID is required.' });
        }

        // Admins bypass the membership check — they may manage any club
        if (req.user.role === 'admin') return next();

        const club = await ClubModel.findByUserId(req.user.id);

        if (!club || club.id !== clubId) {
            return res.status(403).json({ error: 'You are not a member of this club.' });
        }

        // Attach club to request so downstream middleware and controllers can use it without an additional DB query.
        req.club = club;
        next();
    } catch (err) {
        next(err);
    }
}

// Ensures the authenticated linked player is operating on their own player record.
// Admins are always allowed through.
// Usage: router.patch('/:clubId/players/:playerId', requireAuth, requireSelfOrAdmin, updatePlayer)
export function requireSelfOrAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role === 'admin') return next();

    // req.user.playerId is set in the JWT payload when a user has an approved link
    const isOwnPlayer = req.user.playerId && req.user.playerId === req.params.playerId;

    if (!isOwnPlayer) {
        return res.status(403).json({ error: 'You can only modify your own player profile.' });
    }

    next();
}