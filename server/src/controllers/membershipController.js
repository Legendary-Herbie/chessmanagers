import { MembershipModel } from '../models/Membership.js';
import { rejectionCooldownEndsAt } from '../utils/membershipPolicy.js';

function membershipDto(membership) {
    if (!membership) return null;
    return {
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joined_at,
        activatedAt: membership.activated_at,
        rejectedAt: membership.rejected_at,
        revokedAt: membership.revoked_at,
        cooldownEndsAt: membership.status === 'REJECTED'
            ? rejectionCooldownEndsAt(membership.rejected_at)?.toISOString() ?? null
            : null,
    };
}

function sendFailure(res, result) {
    const responses = {
        CLUB_NOT_ACTIVE: [409, 'This club is not accepting membership changes.'],
        PRIVATE_REQUIRES_INVITE: [404, 'Club not found.'],
        ALREADY_MEMBER: [409, 'You are already an active member of this club.'],
        DUPLICATE_PENDING: [409, 'A join request is already pending.'],
        REJECTION_COOLDOWN: [409, 'You may request to join again after the rejection cooldown.'],
        REQUEST_NOT_FOUND: [404, 'Join request not found.'],
        REQUEST_NOT_PENDING: [409, 'This join request is no longer pending.'],
        INVALID_INVITE: [404, 'Invite not found, revoked, or expired.'],
        INVALID_JOIN_CODE: [404, 'Join code is invalid or inactive.'],
        NOT_ACTIVE_MEMBER: [409, 'The membership is not active.'],
        OWNER_MUST_TRANSFER: [409, 'The club owner must transfer ownership before leaving.'],
        USE_LEAVE_FLOW: [409, 'Use the leave-club action to revoke your own membership.'],
    };
    const [status, error] = responses[result.code] || [409, 'Membership transition is not allowed.'];
    return res.status(status).json({
        error,
        code: result.code,
        ...(result.eligibleAt ? { eligibleAt: result.eligibleAt } : {}),
    });
}

export async function requestMembership(req, res, next) {
    try {
        const result = await MembershipModel.requestJoin({
            clubId: req.params.clubId,
            userId: req.user.id,
            message: req.validated.message ?? null,
        });
        if (!result.ok) return sendFailure(res, result);
        res.status(202).json({
            membership: membershipDto(result.membership),
            request: {
                id: result.request.id,
                message: result.request.message,
                status: result.request.status,
                createdAt: result.request.created_at,
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function listMembershipRequests(req, res, next) {
    try {
        const rows = await MembershipModel.listPendingRequests(req.params.clubId);
        res.json({
            requests: rows.map(row => ({
                id: row.id,
                userId: row.user_id,
                name: row.name,
                email: row.email,
                message: row.message,
                createdAt: row.created_at,
            })),
        });
    } catch (error) {
        next(error);
    }
}

export async function approveMembershipRequest(req, res, next) {
    try {
        const result = await MembershipModel.approveRequest({
            clubId: req.params.clubId,
            requestId: req.params.requestId,
            actorUserId: req.user.id,
        });
        if (!result.ok) return sendFailure(res, result);
        res.json({ membership: membershipDto(result.membership) });
    } catch (error) {
        next(error);
    }
}

export async function rejectMembershipRequest(req, res, next) {
    try {
        const result = await MembershipModel.rejectRequest({
            clubId: req.params.clubId,
            requestId: req.params.requestId,
            actorUserId: req.user.id,
            reason: req.validated.reason ?? null,
        });
        if (!result.ok) return sendFailure(res, result);
        res.json({ membership: membershipDto(result.membership) });
    } catch (error) {
        next(error);
    }
}

export async function acceptInvite(req, res, next) {
    try {
        const result = await MembershipModel.acceptInvite({
            token: req.validated.token,
            userId: req.user.id,
        });
        if (!result.ok) return sendFailure(res, result);
        res.json({
            message: 'Joined via invite.',
            clubId: result.clubId,
            membership: membershipDto(result.membership),
        });
    } catch (error) {
        next(error);
    }
}

export async function getJoinCode(req, res, next) {
    try {
        const row = await MembershipModel.getJoinCodeStatus(req.params.clubId);
        res.json({ joinCode: row ? { active: true, createdAt: row.created_at } : { active: false } });
    } catch (error) {
        next(error);
    }
}

export async function rotateJoinCode(req, res, next) {
    try {
        const result = await MembershipModel.rotateJoinCode({
            clubId: req.params.clubId,
            actorUserId: req.user.id,
        });
        if (!result.ok) return sendFailure(res, result);
        res.status(201).json({
            joinCode: {
                active: true,
                code: result.code,
                createdAt: result.joinCode.created_at,
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function revokeJoinCode(req, res, next) {
    try {
        const row = await MembershipModel.revokeJoinCode({
            clubId: req.params.clubId,
            actorUserId: req.user.id,
        });
        if (!row) return res.status(404).json({ error: 'No active join code exists.' });
        res.json({ joinCode: { active: false } });
    } catch (error) {
        next(error);
    }
}

export async function joinWithCode(req, res, next) {
    try {
        const result = await MembershipModel.acceptJoinCode({
            code: req.validated.code,
            userId: req.user.id,
        });
        if (!result.ok) return sendFailure(res, result);
        res.json({
            message: 'Joined via join code.',
            clubId: result.clubId,
            membership: membershipDto(result.membership),
        });
    } catch (error) {
        next(error);
    }
}

export async function leaveClub(req, res, next) {
    try {
        const result = await MembershipModel.leave({
            clubId: req.params.clubId,
            userId: req.user.id,
            reason: req.validated.reason ?? null,
        });
        if (!result.ok) return sendFailure(res, result);
        res.json({ membership: membershipDto(result.membership) });
    } catch (error) {
        next(error);
    }
}

export async function revokeMembership(req, res, next) {
    try {
        const result = await MembershipModel.revoke({
            clubId: req.params.clubId,
            userId: req.params.userId,
            actorUserId: req.user.id,
            reason: req.validated.reason ?? null,
        });
        if (!result.ok) return sendFailure(res, result);
        res.json({ membership: membershipDto(result.membership) });
    } catch (error) {
        next(error);
    }
}
