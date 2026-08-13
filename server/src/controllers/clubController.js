import { ClubModel } from '../models/Club.js';
import { UserModel } from '../models/User.js';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

const { JWT_SECRET, JWT_EXPIRES_IN = '7d' } = env;

// Re-signs a token after a role change so the client session stays in sync.
function signToken(user) {
    return jwt.sign(
        {
            id:         user.id,
            email:      user.email,
            role:       user.role,
            playerId:   user.player_id  ?? null,
            linkStatus: user.link_status ?? null,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// GET /api/v1/clubs/mine
// Returns the club associated with the authenticated user.
// Called by ClubProvider in providers.jsx on mount.
export async function getMyClub(req, res, next) {
    try {
        const club = await ClubModel.findByUserId(req.user.id);

        if (!club) {
            return res.status(404).json({ error: 'No club found for this account.' });
        }

        res.json({ club });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs — public listing
export async function listClubs(req, res, next) {
    try {
        const { q, limit, offset, all } = req.query;
        const opts = { q, limit: Number(limit) || 50, offset: Number(offset) || 0 };
        const clubs = all === '1' ? await ClubModel.listAll(opts) : await ClubModel.listPublic(opts);
        res.json({ clubs });
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

        const membership = req.user
            ? await ClubModel.getMembership(club.id, req.user.id)
            : null;
        res.json({
            club: {
                ...club,
                is_member: Boolean(membership),
                member_role: membership?.role ?? null,
            },
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/clubs — admin only
export async function createClub(req, res, next) {
    try {
        const { name, description, logo, contactInfo, federation } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Club name is required.' });
        }

        if (!federation) {
            return res.status(400).json({ error: 'Federation is required.' });
        }

        // Prevent creating a second club for the same user
        const existing = await ClubModel.findByUserId(req.user.id);
        if (existing) {
            return res.status(409).json({ error: 'User already belongs to a club.' });
        }

        const club = await ClubModel.create({
            name,
            federation,
            ownerId: req.user.id,
            description,
            logo,
            contactInfo,
        });

        // Add the creating user as the first member
        await ClubModel.addMember(club.id, req.user.id);

        // Promote the creator to admin so they can manage the club immediately.
        const updatedUser = await UserModel.updateRole(req.user.id, 'admin');

        // Issue a fresh token reflecting the new role so the client session
        // updates without requiring a logout/login cycle.
        const token = signToken(updatedUser);

        res.status(201).json({
            club,
            token,
            user: {
                id:         updatedUser.id,
                email:      updatedUser.email,
                name:       updatedUser.name,
                role:       updatedUser.role,
                playerId:   updatedUser.player_id  ?? null,
                linkStatus: updatedUser.link_status ?? null,
            },
        });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId — admin only
export async function updateClub(req, res, next) {
    try {
        const { name, description, logo, contactInfo, federation } = req.body;
        const club = await ClubModel.update(req.params.clubId, {
            name, description, logo, contactInfo, federation,
        });

        if (!club) {
            return res.status(404).json({ error: 'Club not found.' });
        }

        res.json({ club });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/clubs/:clubId/join
// Authenticated users request to join a club. If `invite=true` in body/query,
// the request is treated as an invite acceptance and the user is added immediately.
export async function requestJoinClub(req, res, next) {
    try {
        const { clubId } = req.params;
        const userId = req.user.id;
        const { message } = req.body || {};

        const club = await ClubModel.findById(clubId);
        if (!club) return res.status(404).json({ error: 'Club not found.' });

        if (await ClubModel.getMembership(clubId, userId)) {
            return res.status(409).json({ error: 'You are already a member of this club.' });
        }

        // Otherwise create a join request for admin approval
        const reqRow = await ClubModel.requestJoin(clubId, userId, message || null);
        res.status(202).json({ request: reqRow });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/clubs/join-by-token
export async function joinByToken(req, res, next) {
    try {
        const token = req.body?.token || req.query?.token;
        if (!token) return res.status(400).json({ error: 'Token is required.' });

        const inv = await ClubModel.verifyInviteToken(token);
        if (!inv) return res.status(404).json({ error: 'Invite not found or expired.' });

        // If the user is not authenticated, instruct client to register first
        if (!req.user) return res.status(401).json({ error: 'Authentication required to accept invite.' });

        const accepted = await ClubModel.acceptInviteToken(token, req.user.id);
        if (!accepted) return res.status(404).json({ error: 'Invite not found or expired.' });
        res.json({ message: 'Joined via invite token.', clubId: inv.club_id });
    } catch (err) {
        next(err);
    }
}

// Create invite (club admin only)
export async function createInvite(req, res, next) {
    try {
        const { clubId } = req.params;
        const { expiresAt } = req.body || {};
        const expiry = expiresAt ? new Date(expiresAt) : null;
        if (expiry && (Number.isNaN(expiry.valueOf()) || expiry <= new Date())) {
            return res.status(400).json({ error: 'Invite expiration must be a future date.' });
        }
        const invite = await ClubModel.createInvite(clubId, req.user.id, expiry);
        res.status(201).json({ invite });
    } catch (err) {
        next(err);
    }
}

export async function listInvites(req, res, next) {
    try {
        const { clubId } = req.params;
        const invites = await ClubModel.listInvites(clubId);
        res.json({ invites });
    } catch (err) {
        next(err);
    }
}

export async function revokeInvite(req, res, next) {
    try {
        const { clubId, inviteId } = req.params;
        const row = await ClubModel.revokeInvite(clubId, inviteId);
        if (!row) return res.status(404).json({ error: 'Invite not found.' });
        res.json({ message: 'Invite revoked.' });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/join-requests — admin only
export async function getJoinRequests(req, res, next) {
    try {
        const rows = await ClubModel.getJoinRequests(req.params.clubId);
        res.json({ requests: rows });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId/join-requests/:requestId/approve — admin only
export async function approveJoin(req, res, next) {
    try {
        const { clubId, requestId } = req.params;
        const result = await ClubModel.approveJoinRequest(clubId, requestId);
        if (!result) return res.status(404).json({ error: 'Join request not found.' });
        res.json({ message: 'Approved.' });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId/join-requests/:requestId/reject — admin only
export async function rejectJoin(req, res, next) {
    try {
        const { clubId, requestId } = req.params;
        const row = await ClubModel.rejectJoinRequest(clubId, requestId);
        if (!row) return res.status(404).json({ error: 'Join request not found.' });
        res.json({ message: 'Rejected.' });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/members — admin only
export async function getMembers(req, res, next) {
    try {
        const rows = await ClubModel.getMembers(req.params.clubId);
        // Map DB snake_case to client-friendly camelCase and consistent keys
        const members = rows.map(r => ({ userId: r.id, email: r.email, role: r.club_role, joinedAt: r.joined_at }));
        res.json({ members });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/v1/clubs/:clubId/members/:userId — admin only
export async function removeMember(req, res, next) {
    try {
        const { clubId, userId } = req.params;

        // Prevent accidental removal of owner or self
        const club = await ClubModel.findById(clubId);
        if (!club) return res.status(404).json({ error: 'Club not found.' });

        if (club.owner_id === userId) {
            return res.status(400).json({ error: 'Cannot remove the club owner.' });
        }

        if (req.user.id === userId) {
            return res.status(400).json({ error: 'Cannot remove yourself from the club.' });
        }

        const removed = await ClubModel.removeMember(clubId, userId);

        if (!removed) {
            return res.status(404).json({ error: 'Member not found.' });
        }

        res.json({ message: 'Member removed.' });
    } catch (err) {
        next(err);
    }
}
