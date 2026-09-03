import crypto from 'crypto';
import db from '../database/database.js';
import env from '../config/env.js';
import { evaluateJoinEligibility, rejectionCooldownEndsAt } from '../utils/membershipPolicy.js';
import { createNotification, notifyClubAdmins } from '../services/NotificationService.js';

function joinCodeDigest(code) {
    return crypto.createHmac('sha256', env.JWT_SECRET).update(`club-join-code:${code}`).digest('hex');
}

function failure(code, extra = {}) {
    return { ok: false, code, ...extra };
}

async function lockClubMembership(trx, clubId, userId) {
    await trx.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [clubId, userId]);
    const club = await trx.query(
        `SELECT id, name, visibility, status, deleted_at, settings_json, owner_id
         FROM clubs WHERE id = $1 FOR SHARE`,
        [clubId]
    ).then(result => result.first);
    const membership = await trx.query(
        `SELECT * FROM user_clubs
         WHERE club_id = $1 AND user_id = $2
         FOR UPDATE`,
        [clubId, userId]
    ).then(result => result.first);
    return { club, membership };
}

async function recordEvent(trx, {
    clubId, userId, actorUserId = null, eventType, fromStatus = null, toStatus, payload = {},
}) {
    await trx.query(
        `INSERT INTO club_membership_events (
            club_id, user_id, actor_user_id, event_type, from_status, to_status, payload_json
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB)`,
        [clubId, userId, actorUserId, eventType, fromStatus, toStatus, JSON.stringify(payload)]
    );
}

async function notifyMembershipResult(trx, club, userId, eventType, payload, dedupeKey) {
    await createNotification({
        trx,
        userId,
        clubId: club.id,
        eventType,
        payload,
        dedupeKey,
    });
}

async function activateMembership(trx, {
    club, membership, userId, actorUserId, source, payload = {},
}) {
    const fromStatus = membership?.status ?? null;
    const updated = membership
        ? await trx.query(
            `UPDATE user_clubs
             SET role = 'member', status = 'ACTIVE_MEMBER', activated_at = NOW(),
                 status_changed_by = $3, status_reason = $4
             WHERE club_id = $1 AND user_id = $2
             RETURNING *`,
            [club.id, userId, actorUserId, `Joined via ${source}`]
        ).then(result => result.first)
        : await trx.query(
            `INSERT INTO user_clubs (
                club_id, user_id, role, status, activated_at, status_changed_by, status_reason
             ) VALUES ($1, $2, 'member', 'ACTIVE_MEMBER', NOW(), $3, $4)
             RETURNING *`,
            [club.id, userId, actorUserId, `Joined via ${source}`]
        ).then(result => result.first);

    await trx.query(
        `UPDATE club_join_requests
         SET status = 'approved', processed_at = NOW(), processed_by = $3,
             processing_reason = $4
         WHERE club_id = $1 AND user_id = $2 AND status = 'pending'`,
        [club.id, userId, actorUserId, `Joined via ${source}`]
    );
    await recordEvent(trx, {
        clubId: club.id,
        userId,
        actorUserId,
        eventType: `membership.${source}_accepted`,
        fromStatus,
        toStatus: 'ACTIVE_MEMBER',
        payload,
    });
    return updated;
}

function eligibleOrFailure(membership, direct) {
    const eligibility = evaluateJoinEligibility(membership, { direct });
    if (eligibility.allowed) return null;
    return failure(eligibility.code, {
        eligibleAt: eligibility.eligibleAt?.toISOString() ?? null,
    });
}

export const MembershipModel = {
    find: async (clubId, userId) => db.query(
        `SELECT * FROM user_clubs WHERE club_id = $1 AND user_id = $2`,
        [clubId, userId]
    ).then(result => result.first),

    requestJoin: async ({ clubId, userId, message = null }) => db.transaction(async (trx) => {
        let { club, membership } = await lockClubMembership(trx, clubId, userId);
        if (!club || club.status !== 'active' || club.deleted_at) return failure('CLUB_NOT_ACTIVE');
        if (club.visibility !== 'public') return failure('PRIVATE_REQUIRES_INVITE');

        const denied = eligibleOrFailure(membership, false);
        if (denied) return denied;
        const fromStatus = membership?.status ?? null;

        if (membership) {
            membership = await trx.query(
                `UPDATE user_clubs
                 SET role = 'member', status = 'PENDING_APPROVAL', status_changed_by = $3,
                     status_reason = NULL
                 WHERE club_id = $1 AND user_id = $2
                 RETURNING *`,
                [clubId, userId, userId]
            ).then(result => result.first);
        } else {
            membership = await trx.query(
                `INSERT INTO user_clubs (
                    club_id, user_id, role, status, status_changed_by
                 ) VALUES ($1, $2, 'member', 'PENDING_APPROVAL', $2)
                 RETURNING *`,
                [clubId, userId]
            ).then(result => result.first);
        }

        const request = await trx.query(
            `INSERT INTO club_join_requests (club_id, user_id, message, status, processed_at, processed_by, processing_reason)
             VALUES ($1, $2, $3, 'pending', NULL, NULL, NULL)
             ON CONFLICT (club_id, user_id) DO UPDATE
             SET message = EXCLUDED.message, status = 'pending', created_at = NOW(),
                 processed_at = NULL, processed_by = NULL, processing_reason = NULL
             RETURNING *`,
            [clubId, userId, message]
        ).then(result => result.first);

        await recordEvent(trx, {
            clubId,
            userId,
            actorUserId: userId,
            eventType: 'membership.request_submitted',
            fromStatus,
            toStatus: 'PENDING_APPROVAL',
        });
        const applicant = await trx.query(
            'SELECT COALESCE(full_name, name, username, email) AS name FROM users WHERE id = $1',
            [userId]
        ).then(result => result.first);
        await notifyClubAdmins({
            trx,
            clubId,
            eventType: 'membership.request_pending',
            dedupeKey: `join-request:${request.id}:pending:${new Date(request.created_at).toISOString()}`,
            payload: { requestId: request.id, applicantName: applicant.name },
        });
        return { ok: true, membership, request };
    }),

    listPendingRequests: async (clubId) => db.query(
        `SELECT request.id, request.user_id, request.message, request.created_at,
                account.email, COALESCE(account.full_name, account.name, account.username, account.email) AS name
         FROM club_join_requests request
         JOIN user_clubs membership
           ON membership.club_id = request.club_id
          AND membership.user_id = request.user_id
          AND membership.status = 'PENDING_APPROVAL'
         JOIN users account ON account.id = request.user_id
         WHERE request.club_id = $1 AND request.status = 'pending'
         ORDER BY request.created_at ASC`,
        [clubId]
    ).then(result => result.rows),

    approveRequest: async ({ clubId, requestId, actorUserId }) => db.transaction(async (trx) => {
        const requestSnapshot = await trx.query(
            `SELECT user_id FROM club_join_requests WHERE id = $1 AND club_id = $2`,
            [requestId, clubId]
        ).then(result => result.first);
        if (!requestSnapshot) return failure('REQUEST_NOT_FOUND');

        const { club, membership } = await lockClubMembership(trx, clubId, requestSnapshot.user_id);
        const request = await trx.query(
            `SELECT * FROM club_join_requests
             WHERE id = $1 AND club_id = $2
             FOR UPDATE`,
            [requestId, clubId]
        ).then(result => result.first);
        if (!club || club.status !== 'active' || club.deleted_at) return failure('CLUB_NOT_ACTIVE');
        if (!request || request.status !== 'pending' || membership?.status !== 'PENDING_APPROVAL') {
            return failure('REQUEST_NOT_PENDING');
        }

        const updated = await trx.query(
            `UPDATE user_clubs
             SET role = 'member', status = 'ACTIVE_MEMBER', activated_at = NOW(),
                 status_changed_by = $3, status_reason = NULL
             WHERE club_id = $1 AND user_id = $2
             RETURNING *`,
            [clubId, request.user_id, actorUserId]
        ).then(result => result.first);
        await trx.query(
            `UPDATE club_join_requests
             SET status = 'approved', processed_at = NOW(), processed_by = $2,
                 processing_reason = NULL
             WHERE id = $1`,
            [requestId, actorUserId]
        );
        await recordEvent(trx, {
            clubId,
            userId: request.user_id,
            actorUserId,
            eventType: 'membership.request_approved',
            fromStatus: 'PENDING_APPROVAL',
            toStatus: 'ACTIVE_MEMBER',
        });
        await notifyMembershipResult(trx, club, request.user_id, 'join_request.approved', {
            membershipStatus: 'ACTIVE_MEMBER',
        }, `join-request:${request.id}:approved`);
        return { ok: true, membership: updated };
    }),

    rejectRequest: async ({ clubId, requestId, actorUserId, reason = null }) => db.transaction(async (trx) => {
        const requestSnapshot = await trx.query(
            `SELECT user_id FROM club_join_requests WHERE id = $1 AND club_id = $2`,
            [requestId, clubId]
        ).then(result => result.first);
        if (!requestSnapshot) return failure('REQUEST_NOT_FOUND');

        const { club, membership } = await lockClubMembership(trx, clubId, requestSnapshot.user_id);
        const request = await trx.query(
            `SELECT * FROM club_join_requests
             WHERE id = $1 AND club_id = $2
             FOR UPDATE`,
            [requestId, clubId]
        ).then(result => result.first);
        if (!club || club.status !== 'active' || club.deleted_at) return failure('CLUB_NOT_ACTIVE');
        if (!request || request.status !== 'pending' || membership?.status !== 'PENDING_APPROVAL') {
            return failure('REQUEST_NOT_PENDING');
        }

        const updated = await trx.query(
            `UPDATE user_clubs
             SET role = 'member', status = 'REJECTED', rejected_at = NOW(),
                 status_changed_by = $3, status_reason = $4
             WHERE club_id = $1 AND user_id = $2
             RETURNING *`,
            [clubId, request.user_id, actorUserId, reason]
        ).then(result => result.first);
        await trx.query(
            `UPDATE club_join_requests
             SET status = 'rejected', processed_at = NOW(), processed_by = $2,
                 processing_reason = $3
             WHERE id = $1`,
            [requestId, actorUserId, reason]
        );
        await recordEvent(trx, {
            clubId,
            userId: request.user_id,
            actorUserId,
            eventType: 'membership.request_rejected',
            fromStatus: 'PENDING_APPROVAL',
            toStatus: 'REJECTED',
            payload: { reason },
        });
        await notifyMembershipResult(trx, club, request.user_id, 'join_request.rejected', {
            membershipStatus: 'REJECTED',
            eligibleAt: rejectionCooldownEndsAt(updated.rejected_at).toISOString(),
        }, `join-request:${request.id}:rejected`);
        return { ok: true, membership: updated };
    }),

    acceptInvite: async ({ token, userId }) => db.transaction(async (trx) => {
        const invite = await trx.query(
            `SELECT invite.*
             FROM club_invites invite
             WHERE invite.token = $1
             FOR UPDATE`,
            [token]
        ).then(result => result.first);
        if (!invite || invite.revoked || (invite.expires_at && new Date(invite.expires_at) <= new Date())) {
            return failure('INVALID_INVITE');
        }

        const { club, membership } = await lockClubMembership(trx, invite.club_id, userId);
        if (!club || club.status !== 'active' || club.deleted_at) return failure('INVALID_INVITE');
        const denied = eligibleOrFailure(membership, true);
        if (denied) return denied;

        const updated = await activateMembership(trx, {
            club,
            membership,
            userId,
            actorUserId: userId,
            source: 'invite',
            payload: { inviteId: invite.id, issuedByUserId: invite.created_by },
        });
        return { ok: true, membership: updated, clubId: club.id };
    }),

    rotateJoinCode: async ({ clubId, actorUserId }) => db.transaction(async (trx) => {
        const club = await trx.query(
            `SELECT id, status, deleted_at FROM clubs WHERE id = $1 FOR SHARE`,
            [clubId]
        ).then(result => result.first);
        if (!club || club.status !== 'active' || club.deleted_at) return failure('CLUB_NOT_ACTIVE');

        await trx.query("SELECT pg_advisory_xact_lock(hashtext('club_join_code_rotation'))");
        await trx.query(
            `UPDATE club_join_codes
             SET revoked_at = NOW(), revoked_by = $2
             WHERE club_id = $1 AND revoked_at IS NULL`,
            [clubId, actorUserId]
        );

        let code;
        let digest;
        for (let attempt = 0; attempt < 20; attempt += 1) {
            code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
            digest = joinCodeDigest(code);
            const exists = await trx.query(
                'SELECT 1 FROM club_join_codes WHERE code_digest = $1',
                [digest]
            ).then(result => result.first);
            if (!exists) break;
            code = null;
        }
        if (!code) throw new Error('Unable to generate a unique join code.');

        const row = await trx.query(
            `INSERT INTO club_join_codes (club_id, code_digest, created_by)
             VALUES ($1, $2, $3)
             RETURNING id, club_id, created_at`,
            [clubId, digest, actorUserId]
        ).then(result => result.first);
        return { ok: true, code, joinCode: row };
    }),

    getJoinCodeStatus: async (clubId) => db.query(
        `SELECT id, created_at
         FROM club_join_codes
         WHERE club_id = $1 AND revoked_at IS NULL
         LIMIT 1`,
        [clubId]
    ).then(result => result.first),

    revokeJoinCode: async ({ clubId, actorUserId }) => db.query(
        `UPDATE club_join_codes
         SET revoked_at = NOW(), revoked_by = $2
         WHERE club_id = $1 AND revoked_at IS NULL
         RETURNING id`,
        [clubId, actorUserId]
    ).then(result => result.first),

    acceptJoinCode: async ({ code, userId }) => db.transaction(async (trx) => {
        const digest = joinCodeDigest(code);
        const joinCode = await trx.query(
            `SELECT * FROM club_join_codes
             WHERE code_digest = $1 AND revoked_at IS NULL
             FOR UPDATE`,
            [digest]
        ).then(result => result.first);
        if (!joinCode) return failure('INVALID_JOIN_CODE');

        const { club, membership } = await lockClubMembership(trx, joinCode.club_id, userId);
        if (!club || club.status !== 'active' || club.deleted_at) return failure('INVALID_JOIN_CODE');
        const denied = eligibleOrFailure(membership, true);
        if (denied) return denied;

        const updated = await activateMembership(trx, {
            club,
            membership,
            userId,
            actorUserId: userId,
            source: 'join_code',
            payload: { joinCodeId: joinCode.id, issuedByUserId: joinCode.created_by },
        });
        return { ok: true, membership: updated, clubId: club.id };
    }),

    leave: async ({ clubId, userId, reason = null }) => db.transaction(async (trx) => {
        const { club, membership } = await lockClubMembership(trx, clubId, userId);
        if (!club || club.status !== 'active' || club.deleted_at) return failure('CLUB_NOT_ACTIVE');
        if (!membership || membership.status !== 'ACTIVE_MEMBER') return failure('NOT_ACTIVE_MEMBER');
        if (membership.role === 'owner' || club.owner_id === userId) return failure('OWNER_MUST_TRANSFER');

        const updated = await trx.query(
            `UPDATE user_clubs
             SET role = 'member', status = 'REVOKED', revoked_at = NOW(),
                 status_changed_by = $2, status_reason = $3
             WHERE club_id = $1 AND user_id = $2
             RETURNING *`,
            [clubId, userId, reason || 'Left club']
        ).then(result => result.first);
        await recordEvent(trx, {
            clubId,
            userId,
            actorUserId: userId,
            eventType: 'membership.left',
            fromStatus: 'ACTIVE_MEMBER',
            toStatus: 'REVOKED',
            payload: { reason },
        });
        return { ok: true, membership: updated };
    }),

    revoke: async ({ clubId, userId, actorUserId, reason = null }) => db.transaction(async (trx) => {
        const { club, membership } = await lockClubMembership(trx, clubId, userId);
        if (!club || club.status !== 'active' || club.deleted_at) return failure('CLUB_NOT_ACTIVE');
        if (!membership || membership.status !== 'ACTIVE_MEMBER') return failure('NOT_ACTIVE_MEMBER');
        if (membership.role === 'owner' || club.owner_id === userId) return failure('OWNER_MUST_TRANSFER');
        if (userId === actorUserId) return failure('USE_LEAVE_FLOW');

        const updated = await trx.query(
            `UPDATE user_clubs
             SET role = 'member', status = 'REVOKED', revoked_at = NOW(),
                 status_changed_by = $3, status_reason = $4
             WHERE club_id = $1 AND user_id = $2
             RETURNING *`,
            [clubId, userId, actorUserId, reason || 'Membership revoked']
        ).then(result => result.first);
        await recordEvent(trx, {
            clubId,
            userId,
            actorUserId,
            eventType: 'membership.revoked',
            fromStatus: 'ACTIVE_MEMBER',
            toStatus: 'REVOKED',
            payload: { reason },
        });
        return { ok: true, membership: updated };
    }),
};
