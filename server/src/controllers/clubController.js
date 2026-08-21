import { ClubModel } from '../models/Club.js';
import { scheduleRatingRecalculation } from '../services/RatingService.js';
import { MembershipModel } from '../models/Membership.js';
import { UserModel } from '../models/User.js';
import { signAccessToken } from '../services/SessionService.js';
import {
    toClubContextClub, toPublicClub, toPublicClubPresentation, toPrivateClubPresentation,
} from '../utils/publicDtos.js';
import { PublicClubAccessService } from '../services/PublicClubAccessService.js';
import { getClubCapabilities } from '../utils/clubCapabilities.js';
import { evaluateJoinEligibility, rejectionCooldownEndsAt } from '../utils/membershipPolicy.js';

// GET /api/v1/clubs/mine
// Returns all active and historical memberships. Singular fields remain as
// temporary compatibility for clients that have not adopted explicit context.
export async function getMyClub(req, res, next) {
    try {
        const rows = await ClubModel.findMembershipsByUserId(req.user.id);
        const clubs = rows.map(row => ({
            club: {
                id: row.id,
                name: row.name,
                slug: row.slug,
                federation: row.federation,
                description: row.description,
                logo: row.logo,
                visibility: row.visibility,
                status: row.status,
                created_at: row.created_at,
            },
            membership: {
                role: row.member_role,
                status: row.membership_status,
                joinedAt: row.membership_joined_at,
                rejectedAt: row.membership_rejected_at,
                revokedAt: row.membership_revoked_at,
            },
            linkedPlayer: row.linked_player_id
                ? { id: row.linked_player_id, name: row.linked_player_name }
                : null,
        }));
        const activeRow = rows.find(row => (
            row.membership_status === 'ACTIVE_MEMBER'
            && row.status === 'active'
            && !row.deleted_at
        ));
        const role = activeRow?.member_role ?? null;
        const ratingSettings = activeRow
            ? await ClubModel.getRatingSettings(activeRow.id)
            : [];

        res.json({
            clubs,
            club: activeRow ? toClubContextClub(activeRow, ratingSettings) : null,
            membership: activeRow ? { role } : null,
            linkedPlayer: activeRow?.linked_player_id
                ? { id: activeRow.linked_player_id, name: activeRow.linked_player_name }
                : null,
            capabilities: getClubCapabilities(role),
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs — public listing
export async function listClubs(req, res, next) {
    try {
        const { q, limit = 50, offset = 0 } = req.validatedQuery;
        const opts = { q, limit, offset };

        const rows = await ClubModel.listPublic(opts);
        res.json({
            clubs: rows.map(toPublicClubPresentation),
            total: rows[0]?.total_count ?? 0,
            limit,
            offset,
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId
export async function getClub(req, res, next) {
    try {
        const club = await PublicClubAccessService.getDirectPresentation(req.params.clubId);

        if (!club) {
            return res.status(404).json({ error: 'Club not found.' });
        }

        const membership = req.user
            ? await MembershipModel.find(club.id, req.user.id)
            : null;
        const activeMembership = membership?.status === 'ACTIVE_MEMBER';
        const eligibility = evaluateJoinEligibility(membership);
        const cooldownEndsAt = membership?.status === 'REJECTED'
            ? rejectionCooldownEndsAt(membership.rejected_at)?.toISOString() ?? null
            : null;

        res.json({
            club: {
                ...(club.visibility === 'private' && !activeMembership
                    ? toPrivateClubPresentation(club)
                    : toPublicClub(club)),
                is_member: activeMembership,
                member_role: activeMembership ? membership.role : null,
                membership: membership ? {
                    status: membership.status,
                    role: membership.role,
                    rejectedAt: membership.rejected_at,
                    revokedAt: membership.revoked_at,
                    cooldownEndsAt,
                } : null,
                join_request_pending: membership?.status === 'PENDING_APPROVAL',
                can_request_join: eligibility.allowed,
            },
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/v1/clubs — admin only
export async function createClub(req, res, next) {
    try {
        const input = req.validated ?? req.body;
        const {
            name, description, logo, contactInfo, federation, is_public,
            visibility, publicLeaderboard, settings, ratingSettings,
        } = input;

        if (!name) {
            return res.status(400).json({ error: 'Club name is required.' });
        }

        if (!federation) {
            return res.status(400).json({ error: 'Federation is required.' });
        }

        const club = await ClubModel.create({
            name,
            federation,
            ownerId: req.user.id,
            description,
            logo,
            contactInfo,
            visibility: visibility ?? (is_public ? 'public' : 'private'),
            publicLeaderboard: publicLeaderboard ?? true,
            settings,
            ratingSettings,
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

        const user = await UserModel.findById(req.user.id);
        const token = signAccessToken(user);
        const createdRatingSettings = await ClubModel.getRatingSettings(club.id);

        res.status(201).json({
            club: toClubContextClub(club, createdRatingSettings),
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.full_name,
                username: user.username,
                fullName: user.full_name,
                role: user.role,
            },
        });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId — admin only
export async function updateClub(req, res, next) {
    try {
        const changes = req.validated ?? req.body;
        const club = await ClubModel.updateManagementSettings(
            req.params.clubId,
            req.user.id,
            changes,
        );

        if (!club) {
            return res.status(404).json({ error: 'Club not found.' });
        }

        for (const category of Object.keys(changes.ratingSettings ?? {})) {
            scheduleRatingRecalculation(club.id, category);
        }

        const ratingSettings = await ClubModel.getRatingSettings(club.id);
        res.json({ club: toClubContextClub(club, ratingSettings) });
    } catch (err) {
        next(err);
    }
}

// Create invite (club admin only)
export async function createInvite(req, res, next) {
    try {
        const { clubId } = req.params;
        const { expiresAt } = req.validated;
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

// GET /api/v1/clubs/:clubId/members — admin only
export async function getMembers(req, res, next) {
    try {
        const rows = await ClubModel.getMembers(req.params.clubId);
        // Map DB snake_case to client-friendly camelCase and consistent keys
        const members = rows.map(r => ({
            userId: r.id,
            name: r.name,
            email: r.email,
            role: r.club_role,
            joinedAt: r.joined_at,
        }));
        res.json({ members });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/v1/clubs/:clubId/members/:userId/role — admin only
// Promotes/demotes a member between club-scoped 'member' and 'admin'.
export async function setMemberRole(req, res, next) {
    try {
        const { clubId, userId } = req.params;
        const { role } = req.validated ?? req.body;

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

export async function transferClubOwnership(req, res, next) {
    try {
        const { newOwnerUserId, previousOwnerRole } = req.validated ?? req.body;
        const club = await ClubModel.transferOwnership({
            clubId: req.params.clubId,
            currentOwnerId: req.user.id,
            newOwnerUserId,
            previousOwnerRole,
        });
        if (!club) {
            return res.status(409).json({
                error: 'Ownership can only be transferred to another active club member.',
            });
        }
        const ratingSettings = await ClubModel.getRatingSettings(club.id);
        res.json({ club: toClubContextClub(club, ratingSettings) });
    } catch (err) {
        next(err);
    }
}

async function changeClubLifecycle(req, res, next, action) {
    try {
        const { reason = null } = req.validated ?? req.body;
        const club = await ClubModel.setLifecycle({
            clubId: req.params.clubId,
            ownerId: req.user.id,
            action,
            reason,
        });
        if (!club) return res.status(409).json({ error: `Club cannot be ${action}d from its current state.` });
        res.json({ club: toClubContextClub(club) });
    } catch (err) {
        next(err);
    }
}

export const archiveClub = (req, res, next) => changeClubLifecycle(req, res, next, 'archive');
export const restoreClub = (req, res, next) => changeClubLifecycle(req, res, next, 'restore');
export const deleteClub = (req, res, next) => changeClubLifecycle(req, res, next, 'delete');

// GET /api/v1/clubs/:clubId/context
export async function getClubContext(req, res, next) {
    try {
        const { club, membership, linkedPlayer, capabilities } = req.clubContext;
        if (club.status !== 'active' || club.deleted_at) {
            return res.status(409).json({ error: 'This club is not active.' });
        }
        const ratingSettings = await ClubModel.getRatingSettings(club.id);
        res.json({
            club: toClubContextClub(club, ratingSettings),
            membership: {
                role: membership.role,
                status: membership.status,
                joinedAt: membership.joined_at,
            },
            linkedPlayer,
            capabilities,
        });
    } catch (err) {
        next(err);
    }
}
