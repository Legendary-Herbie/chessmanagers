import { ClubModel } from '../models/Club.js';
import db from '../database/database.js';

// Checks whether the authenticated user is the owner/admin of the club (club-scoped admin).
// Note: Per-club admin roles are not yet implemented in the schema; for now the club owner
// is treated as the club admin. This prevents system-level 'admin' users from managing
// arbitrary clubs unless explicitly intended.
export async function requireClubAdmin(req, res, next) {
    try {
        const { clubId } = req.params;
        if (!clubId) return res.status(400).json({ error: 'Club ID is required.' });

        let club = req.club;
        if (!club) {
            club = await ClubModel.findById(clubId);
            if (!club) return res.status(404).json({ error: 'Club not found.' });
        }

        // Allow club owner or club-specific admin (user_clubs.role = 'admin')
            if (club.owner_id === req.user.id) {
                req.club = club;
                return next();
            }

            const isClubAdmin = await db.query(`SELECT role FROM user_clubs WHERE club_id = $1 AND user_id = $2 LIMIT 1`, [clubId, req.user.id]).then(r => r.first);
            if (isClubAdmin && isClubAdmin.role === 'admin') {
                req.club = club;
                return next();
            }

            return res.status(403).json({ error: 'Only the club owner or a club admin may perform this action.' });

            // ensure req.club is set for downstream handlers

    } catch (err) {
        next(err);
    }
}


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

        // Check membership in the explicit club_id — do not allow global system admins to bypass
        const club = await ClubModel.findById(clubId);

        if (!club) {
            return res.status(404).json({ error: 'Club not found.' });
        }

        // Verify user is a member of this club
        const member = await db.query(
            `SELECT 1 FROM user_clubs WHERE club_id = $1 AND user_id = $2 LIMIT 1`,
            [clubId, req.user.id]
        ).then(r => r.rowCount > 0);

        if (!member) {
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