import { ClubModel } from '../models/Club.js';
import db from '../database/database.js';
import crypto from 'crypto';

// GET /api/v1/clubs/mine
// Returns the club associated with the authenticated user.
// Called by ClubProvider in providers.jsx on mount.
export async function getMyClub(req, res, next) {
    try {
            const club = await ClubModel.findByUserId(req.user.id);

        if (!club) {
            return res.status(404).json({ error: 'No club found for this account.' });
        }

            // Include the user's membership role
            const membership = await ClubModel.getMembership(club.id, req.user.id);
            club.member_role = membership ? membership.role : null;

            res.json({ club });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId
export async function getClub(req, res, next) {
    try {
        const club = await ClubModel.findById(req.params.clubId);

        if (!club) {
            return res.status(404).json({ error: 'Club not found.' });
        }

        // If user is authenticated, include membership info
        if (req.user) {
            const membership = await ClubModel.getMembership(club.id, req.user.id);
            club.is_member = !!membership;
            club.member_role = membership ? membership.role : null;
        }

        res.json({ club });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/clubs — admin only
export async function createClub(req, res, next) {
    try {
        const { name, description, logo, contactInfo } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Club name is required.' });
        }

        const club = await ClubModel.create({
            name,
            ownerId: req.user.id,
            description,
            logo,
            contactInfo,
        });

        // Add the creating user as the owner member in user_clubs
        await ClubModel.addMember(club.id, req.user.id, 'owner');

        res.status(201).json({ club });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId — admin only
export async function updateClub(req, res, next) {
    try {
        const { name, description, logo, contactInfo } = req.body;
        const club = await ClubModel.update(req.params.clubId, {
            name, description, logo, contactInfo,
        });

        if (!club) {
            return res.status(404).json({ error: 'Club not found.' });
        }

        res.json({ club });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/members — admin only
export async function getMembers(req, res, next) {
    try {
        const members = await ClubModel.getMembers(req.params.clubId);
        res.json({ members });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/clubs/:clubId/invites — create a tokenized invite (club admin)
export async function createInvite(req, res, next) {
    try {
        const { clubId } = req.params;
        // Generate a random token
        const token = 'tkn_' + crypto.randomBytes(16).toString('hex');
        const createdBy = req.user.id;

        const result = await db.query(
            `INSERT INTO club_invites (club_id, token, created_by, created_at, revoked)
             VALUES ($1, $2, $3, NOW(), false)
             RETURNING id, token, created_at`,
            [clubId, token, createdBy]
        );

        res.status(201).json({ invite: result.first });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/invites
export async function listInvites(req, res, next) {
    try {
        const { clubId } = req.params;
        const result = await db.query(
            `SELECT id, token, created_by, created_at, expires_at, revoked
             FROM club_invites WHERE club_id = $1 ORDER BY created_at DESC`,
            [clubId]
        );
        res.json({ invites: result.rows });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/v1/clubs/:clubId/invites/:inviteId
export async function revokeInvite(req, res, next) {
    try {
        const { clubId, inviteId } = req.params;
        const result = await db.query(
            `UPDATE club_invites SET revoked = true WHERE id = $1 AND club_id = $2 RETURNING id`,
            [inviteId, clubId]
        );
        if (!result.first) return res.status(404).json({ error: 'Invite not found' });
        res.json({ revoked: true });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/clubs/join-by-token — accept an invite token (authenticated user)
export async function joinByToken(req, res, next) {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ error: 'Token is required.' });

        const inv = await db.query(`SELECT * FROM club_invites WHERE token = $1 AND revoked = false`, [token]);
        if (!inv.first) return res.status(404).json({ error: 'Invite not found or revoked.' });

        const clubId = inv.first.club_id;
        // Add user to club with default role 'member'
        await ClubModel.addMember(clubId, req.user.id, 'member');

        res.json({ joined: true, clubId });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/v1/clubs/:clubId/members/:userId — admin only
export async function removeMember(req, res, next) {
    try {
        const { clubId, userId } = req.params;
        const removed = await ClubModel.removeMember(clubId, userId);

        if (!removed) {
            return res.status(404).json({ error: 'Member not found.' });
        }

        res.json({ message: 'Member removed.' });
    } catch (err) {
        next(err);
    }
}
