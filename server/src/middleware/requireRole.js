import db from '../database/database.js';
import { getClubCapabilities } from '../utils/clubCapabilities.js';

function missingClubContext(res) {
    return res.status(500).json({ error: 'Club context middleware is required.' });
}

export async function loadClubContext(req, res, next) {
    try {
        const { clubId } = req.params;
        if (!clubId) return res.status(400).json({ error: 'Club ID is required.' });

        const club = await db.query(
            `SELECT * FROM clubs
             WHERE id = $1 AND status <> 'deleted' AND deleted_at IS NULL`,
            [clubId]
        ).then(result => result.first);
        if (!club) return res.status(404).json({ error: 'Club not found.' });
        if (!['GET', 'HEAD'].includes(req.method) && club.status !== 'active' && !req.allowInactiveClubMutation) {
            return res.status(409).json({ error: 'Archived clubs are read-only.' });
        }

        const membership = req.user
            ? await db.query(
                `SELECT user_id, club_id, role, status, joined_at
                 FROM user_clubs
                 WHERE club_id = $1 AND user_id = $2 AND status = 'ACTIVE_MEMBER'`,
                [clubId, req.user.id]
            ).then(result => result.first)
            : null;

        const linkedPlayer = req.user
            ? await db.query(
                `SELECT p.id, p.name
                 FROM player_links pl
                 JOIN players p ON p.id = pl.player_id
                 WHERE pl.user_id = $1
                   AND pl.club_id = $2
                   AND pl.status = 'approved'
                   AND p.status = 'active'
                   AND p.deleted_at IS NULL
                 LIMIT 1`,
                [req.user.id, clubId]
            ).then(result => result.first)
            : null;

        const role = membership?.role ?? null;
        req.club = club;
        req.clubContext = {
            club,
            membership,
            linkedPlayer,
            capabilities: getClubCapabilities(role),
        };
        next();
    } catch (error) {
        next(error);
    }
}

export function allowInactiveClubMutation(req, _res, next) {
    req.allowInactiveClubMutation = true;
    next();
}

export function requireActiveClubMember(req, res, next) {
    if (!req.clubContext) return missingClubContext(res);
    if (!req.clubContext.membership) {
        return res.status(403).json({ error: 'You are not a member of this club.' });
    }
    next();
}

export function requireClubRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.clubContext) return missingClubContext(res);
        const role = req.clubContext.membership?.role;
        if (!role || !allowedRoles.includes(role)) {
            return res.status(403).json({ error: 'You do not have permission to perform this action.' });
        }
        next();
    };
}

export const requireClubOwner = requireClubRole('owner');
export const requireClubAdmin = requireClubRole('owner', 'admin');

export function requireLinkedPlayerForResource(req, res, next) {
    if (!req.clubContext) return missingClubContext(res);
    if (req.clubContext.linkedPlayer?.id !== req.params.playerId) {
        return res.status(403).json({ error: 'You can only modify your own player profile.' });
    }
    next();
}

export function requireSelfOrClubAdmin(req, res, next) {
    if (!req.clubContext) return missingClubContext(res);
    const role = req.clubContext.membership?.role;
    if (role === 'owner' || role === 'admin') return next();
    return requireLinkedPlayerForResource(req, res, next);
}

// Transitional aliases for route groups not yet migrated to the new names.
export const requireClubMember = requireActiveClubMember;
export const requireSelfOrAdmin = requireSelfOrClubAdmin;
