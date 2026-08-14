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

        // listAll() ignores public_leaderboard/is_public entirely and returns
        // every club (including ones a user deliberately marked "Private
        // (invite-only)" in CreateClub.jsx) to whoever asks. This route has
        // no requireAuth in front of it, so ?all=1 must never be trusted from
        // an anonymous or regular caller — only a genuine system admin
        // (req.user.role === 'admin', set via optionalAuth) may request it.
        // Everyone else — including logged-out visitors and ordinary
        // members — gets the public-only listing regardless of the `all`
        // query param.
        const wantsAll = all === '1' && req.user?.role === 'admin';
        const clubs = wantsAll ? await ClubModel.listAll(opts) : await ClubModel.listPublic(opts);
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

        // Only relevant for authenticated non-members — tells the UI whether
        // "Request to join" should stay disabled after a prior request.
        const pendingJoinRequest = (req.user && !membership)
            ? await ClubModel.getPendingJoinRequest(club.id, req.user.id)
            : null;

        res.json({
            club: {
                ...club,
                is_member: Boolean(membership),
                member_role: membership?.role ?? null,
                join_request_pending: Boolean(pendingJoinRequest),
            },
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/clubs — admin only
export async function createClub(req, res, next) {
    try {
        const { name, description, logo, contactInfo, federation, is_public } = req.body;

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
            is_public: Boolean(is_public),
        });

        // IMPORTANT: ClubModel.create() already inserts the creator into
        // user_clubs with role 'owner' as part of its own transaction.
        // Do NOT call ClubModel.addMember() here — addMember() upserts with
        // `ON CONFLICT ... DO UPDATE SET role = EXCLUDED.role`, and its
        // default role is 'member'. Calling it a second time would silently
        // overwrite the owner's 'owner' role with 'member', which then hides
        // the invite panel, join-request queue, and club-edit controls from
        // the very person who just created the club (see requireClubAdmin
        // and ClubPage.jsx's isClubAdmin check, both of which key off this
        // user_clubs.role value).

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

// PATCH /api/v1/clubs/:clubId/members/:userId/role — admin only
// Promotes/demotes a member between 'member' and 'admin'. This is the
// club-scoped role used by requireClubAdmin (distinct from the global
// users.role JWT claim used by requireRole('admin') elsewhere). Before
// this endpoint existed, the only way to become a club admin was to be
// the club's creator — there was no permission-granting path at all.
export async function setMemberRole(req, res, next) {
    try {
        const { clubId, userId } = req.params;
        const { role } = req.body;

        const club = await ClubModel.findById(clubId);
        if (!club) return res.status(404).json({ error: 'Club not found.' });

        if (club.owner_id === userId) {
            return res.status(400).json({ error: "The owner's role cannot be changed here." });
        }

        const membership = await ClubModel.getMembership(clubId, userId);
        if (!membership) {
            return res.status(404).json({ error: 'That user is not a member of this club.' });
        }

        const updated = await ClubModel.setMemberRole(clubId, userId, role);
        if (!updated) return res.status(404).json({ error: 'Member not found.' });

        res.json({ member: { userId, role: updated.role } });
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