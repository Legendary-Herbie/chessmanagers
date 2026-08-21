import db from '../database/database.js';
import { createNotification, notifyClubAdmins } from '../services/NotificationService.js';

const failure = (code) => ({ ok: false, code });

async function lockClaimKeys(trx, clubId, userId, playerId) {
    const keys = [`${clubId}:player:${playerId}`, `${clubId}:user:${userId}`].sort();
    for (const key of keys) {
        await trx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
    }
}

async function recordLinkEvent(trx, {
    clubId, playerId, userId, linkId, actorUserId, eventType, fromStatus = null, toStatus, payload = {},
}) {
    await trx.query(
        `INSERT INTO player_link_events (
            club_id, player_id, user_id, link_id, actor_user_id,
            event_type, from_status, to_status, payload_json
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB)`,
        [clubId, playerId, userId, linkId, actorUserId, eventType, fromStatus, toStatus, JSON.stringify(payload)]
    );
}

async function notify(trx, club, userId, eventType, payload, dedupeKey) {
    await createNotification({
        trx,
        userId,
        clubId: club.id,
        eventType,
        payload,
        dedupeKey,
    });
}

async function lockedContext(trx, clubId, userId, playerId) {
    await lockClaimKeys(trx, clubId, userId, playerId);
    const club = await trx.query(
        'SELECT id, status, deleted_at, settings_json FROM clubs WHERE id = $1 FOR SHARE',
        [clubId]
    ).then(result => result.first);
    const membership = await trx.query(
        `SELECT user_id, club_id, role, status FROM user_clubs
         WHERE club_id = $1 AND user_id = $2 FOR UPDATE`,
        [clubId, userId]
    ).then(result => result.first);
    const player = await trx.query(
        'SELECT id, club_id, name, status, deleted_at FROM players WHERE club_id = $1 AND id = $2 FOR UPDATE',
        [clubId, playerId]
    ).then(result => result.first);
    return { club, membership, player };
}

async function activeConflict(trx, clubId, userId, playerId, exceptLinkId = null) {
    return trx.query(
        `SELECT id, user_id, player_id, status
         FROM player_links
         WHERE club_id = $1 AND status IN ('pending', 'approved')
           AND (user_id = $2 OR player_id = $3)
           AND ($4::TEXT IS NULL OR id <> $4)
         FOR UPDATE`,
        [clubId, userId, playerId, exceptLinkId]
    ).then(result => result.first);
}

export const PlayerLinkModel = {
    requestClaim: async ({ clubId, userId, playerId }) => db.transaction(async (trx) => {
        const { club, membership, player } = await lockedContext(trx, clubId, userId, playerId);
        if (!club || club.status !== 'active' || club.deleted_at) return failure('CLUB_NOT_ACTIVE');
        if (!membership || membership.status !== 'ACTIVE_MEMBER') return failure('NOT_ACTIVE_MEMBER');
        if (!player) return failure('PLAYER_NOT_FOUND');
        if (player.status !== 'active' || player.deleted_at) return failure('PLAYER_NOT_ACTIVE');
        if (await activeConflict(trx, clubId, userId, playerId)) return failure('CLAIM_CONFLICT');

        const link = await trx.query(
            `INSERT INTO player_links (user_id, player_id, club_id, status)
             VALUES ($1, $2, $3, 'pending') RETURNING *`,
            [userId, playerId, clubId]
        ).then(result => result.first);
        await recordLinkEvent(trx, {
            clubId, playerId, userId, linkId: link.id, actorUserId: userId,
            eventType: 'player_claim.submitted', toStatus: 'pending',
        });
        const applicant = await trx.query(
            'SELECT COALESCE(full_name, name, username, email) AS name FROM users WHERE id = $1',
            [userId]
        ).then(result => result.first);
        await notifyClubAdmins({
            trx,
            clubId,
            eventType: 'player_claim.pending',
            dedupeKey: `player-link:${link.id}:pending`,
            payload: {
                linkId: link.id,
                playerId,
                playerName: player.name,
                applicantName: applicant.name,
            },
        });
        return { ok: true, link };
    }),

    findByPlayer: async (playerId) => db.query(
        `SELECT pl.id, pl.club_id, pl.player_id, pl.user_id, pl.status,
                pl.reviewed_at, pl.review_reason, pl.unlinked_at, pl.created_at, u.email AS user_email
         FROM player_links pl JOIN users u ON u.id = pl.user_id
         WHERE pl.player_id = $1 ORDER BY pl.created_at DESC`,
        [playerId]
    ).then(result => result.rows),

    findByUser: async (userId, clubId = null) => db.query(
        `SELECT pl.id, pl.club_id, pl.player_id, pl.user_id, pl.status, p.name AS player_name
         FROM player_links pl JOIN players p ON p.id = pl.player_id AND p.club_id = pl.club_id
         WHERE pl.user_id = $1 AND ($2::TEXT IS NULL OR pl.club_id = $2)
           AND pl.status IN ('pending', 'approved')
         ORDER BY pl.created_at DESC LIMIT 1`,
        [userId, clubId]
    ).then(result => result.first),

    findById: async (linkId) => db.query(
        `SELECT id, club_id, player_id, user_id, status, reviewed_at, review_reason,
                unlinked_at, created_at, updated_at
         FROM player_links WHERE id = $1`,
        [linkId]
    ).then(result => result.first),

    countApprovedByUser: async (userId) => db.query(
        `SELECT COUNT(*)::int AS count FROM player_links WHERE user_id = $1 AND status = 'approved'`,
        [userId]
    ).then(result => result.first?.count || 0),

    findPendingByClub: async (clubId) => db.query(
        `SELECT pl.id, pl.club_id, pl.player_id, pl.user_id, pl.created_at,
                u.email AS user_email, p.name AS player_name
         FROM player_links pl
         JOIN players p ON p.id = pl.player_id AND p.club_id = pl.club_id
         JOIN users u ON u.id = pl.user_id
         JOIN user_clubs membership ON membership.club_id = pl.club_id AND membership.user_id = pl.user_id
         WHERE pl.club_id = $1 AND pl.status = 'pending'
           AND p.status = 'active' AND p.deleted_at IS NULL
           AND membership.status = 'ACTIVE_MEMBER'
         ORDER BY pl.created_at ASC`,
        [clubId]
    ).then(result => result.rows),

    approve: async ({ clubId, linkId, actorUserId }) => db.transaction(async (trx) => {
        const snapshot = await trx.query(
            'SELECT player_id, user_id FROM player_links WHERE id = $1 AND club_id = $2',
            [linkId, clubId]
        ).then(result => result.first);
        if (!snapshot) return failure('LINK_NOT_FOUND');
        const { club, membership, player } = await lockedContext(
            trx, clubId, snapshot.user_id, snapshot.player_id
        );
        const link = await trx.query(
            'SELECT * FROM player_links WHERE id = $1 AND club_id = $2 FOR UPDATE',
            [linkId, clubId]
        ).then(result => result.first);
        if (!club || club.status !== 'active' || club.deleted_at) return failure('CLUB_NOT_ACTIVE');
        if (!link || link.status !== 'pending') return failure('LINK_NOT_PENDING');
        if (!membership || membership.status !== 'ACTIVE_MEMBER') return failure('NOT_ACTIVE_MEMBER');
        if (!player || player.status !== 'active' || player.deleted_at) return failure('PLAYER_NOT_ACTIVE');
        if (await activeConflict(trx, clubId, link.user_id, link.player_id, link.id)) {
            return failure('CLAIM_CONFLICT');
        }

        const updated = await trx.query(
            `UPDATE player_links SET status = 'approved', reviewed_at = NOW(), reviewed_by = $2,
                    review_reason = NULL, updated_at = NOW()
             WHERE id = $1 RETURNING *`,
            [linkId, actorUserId]
        ).then(result => result.first);
        await recordLinkEvent(trx, {
            clubId, playerId: link.player_id, userId: link.user_id, linkId,
            actorUserId, eventType: 'player_claim.approved', fromStatus: 'pending', toStatus: 'approved',
        });
        await notify(trx, club, link.user_id, 'player_claim.approved', {
            playerId: link.player_id, playerName: player.name,
        }, `player-link:${link.id}:approved`);
        return { ok: true, link: updated };
    }),

    reject: async ({ clubId, linkId, actorUserId, reason = null }) => db.transaction(async (trx) => {
        const snapshot = await trx.query(
            'SELECT player_id, user_id FROM player_links WHERE id = $1 AND club_id = $2',
            [linkId, clubId]
        ).then(result => result.first);
        if (!snapshot) return failure('LINK_NOT_FOUND');
        await lockClaimKeys(trx, clubId, snapshot.user_id, snapshot.player_id);
        const link = await trx.query(
            `SELECT pl.*, p.name AS player_name, p.status AS player_status, p.deleted_at AS player_deleted_at
             FROM player_links pl JOIN players p ON p.id = pl.player_id AND p.club_id = pl.club_id
             WHERE pl.id = $1 AND pl.club_id = $2 FOR UPDATE OF pl`,
            [linkId, clubId]
        ).then(result => result.first);
        if (!link) return failure('LINK_NOT_FOUND');
        if (link.status !== 'pending') return failure('LINK_NOT_PENDING');
        const club = await trx.query(
            'SELECT id, settings_json FROM clubs WHERE id = $1 FOR SHARE',
            [clubId]
        ).then(result => result.first);
        const updated = await trx.query(
            `UPDATE player_links SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $2,
                    review_reason = $3, updated_at = NOW()
             WHERE id = $1 RETURNING *`,
            [linkId, actorUserId, reason]
        ).then(result => result.first);
        await recordLinkEvent(trx, {
            clubId, playerId: link.player_id, userId: link.user_id, linkId,
            actorUserId, eventType: 'player_claim.rejected', fromStatus: 'pending', toStatus: 'rejected',
            payload: { reason },
        });
        await notify(trx, club, link.user_id, 'player_claim.rejected', {
            playerId: link.player_id, playerName: link.player_name, reason,
        }, `player-link:${link.id}:rejected`);
        return { ok: true, link: updated };
    }),

    unlink: async ({ clubId, playerId, actorUserId, actorIsAdmin, reason = null }) => db.transaction(async (trx) => {
        const snapshot = await trx.query(
            `SELECT user_id FROM player_links
             WHERE club_id = $1 AND player_id = $2 AND status = 'approved'`,
            [clubId, playerId]
        ).then(result => result.first);
        if (!snapshot) return failure('LINK_NOT_FOUND');
        const { club, player } = await lockedContext(trx, clubId, snapshot.user_id, playerId);
        const link = await trx.query(
            `SELECT * FROM player_links
             WHERE club_id = $1 AND player_id = $2 AND user_id = $3 AND status = 'approved'
             FOR UPDATE`,
            [clubId, playerId, snapshot.user_id]
        ).then(result => result.first);
        if (!link) return failure('LINK_NOT_FOUND');
        if (!actorIsAdmin && link.user_id !== actorUserId) return failure('NOT_LINK_OWNER');
        const updated = await trx.query(
            `UPDATE player_links SET status = 'unlinked', unlinked_at = NOW(), unlinked_by = $2,
                    unlink_reason = $3, updated_at = NOW()
             WHERE id = $1 RETURNING *`,
            [link.id, actorUserId, reason]
        ).then(result => result.first);
        await recordLinkEvent(trx, {
            clubId, playerId, userId: link.user_id, linkId: link.id,
            actorUserId, eventType: 'player_link.unlinked', fromStatus: 'approved', toStatus: 'unlinked',
            payload: { reason },
        });
        await notify(trx, club, link.user_id, 'player_link.unlinked', {
            playerId, playerName: player?.name ?? null, reason,
        }, `player-link:${link.id}:unlinked`);
        return { ok: true, link: updated };
    }),
};
