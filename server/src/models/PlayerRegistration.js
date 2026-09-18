import db from '../database/database.js';
import { PlayerModel } from './Player.js';
import { createNotification, notifyClubAdmins } from '../services/NotificationService.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

async function lockMember(trx, clubId, userId, requireActive = true) {
    // Share the claim workflow's user lock so approval cannot race with claiming an existing player.
    await trx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${clubId}:user:${userId}`]);
    const club = (await trx.query('SELECT status, deleted_at FROM clubs WHERE id=$1 FOR SHARE', [clubId])).first;
    if (!club || club.status !== 'active' || club.deleted_at) fail(409, 'This club is not active.');
    const member = (await trx.query('SELECT status FROM user_clubs WHERE club_id=$1 AND user_id=$2 FOR UPDATE', [clubId, userId])).first;
    if (requireActive && member?.status !== 'ACTIVE_MEMBER') fail(403, 'An active club membership is required.');
}

async function ensureUnlinked(trx, clubId, userId) {
    const links = await trx.query("SELECT id FROM player_links WHERE club_id=$1 AND user_id=$2 AND status IN ('pending','approved')", [clubId, userId]);
    if (links.rowCount) fail(409, 'You already have a player link or pending claim in this club.');
}

export const PlayerRegistrationModel = {
    list: async (clubId, userId, isAdmin) => (await db.query(
        `SELECT r.*, u.name AS applicant_name FROM player_registration_requests r
         JOIN users u ON u.id=r.user_id
         WHERE r.club_id=$1 AND (r.user_id=$2 OR ($3 AND r.status='pending'))
         ORDER BY r.created_at DESC`, [clubId, userId, isAdmin]
    )).rows,

    submit: ({ clubId, userId, name, bio = null, federationId = null }) => db.transaction(async trx => {
        await lockMember(trx, clubId, userId);
        await ensureUnlinked(trx, clubId, userId);
        const pending = await trx.query("SELECT id FROM player_registration_requests WHERE club_id=$1 AND user_id=$2 AND status='pending'", [clubId, userId]);
        if (pending.rowCount) fail(409, 'Your self-registration is already awaiting review.');
        const registration = (await trx.query(
            'INSERT INTO player_registration_requests(club_id,user_id,name,bio,federation_id) VALUES($1,$2,$3,$4,$5) RETURNING *',
            [clubId, userId, name, bio, federationId]
        )).first;
        await notifyClubAdmins({ trx, clubId, eventType: 'player_registration.pending',
            payload: { requestId: registration.id, playerName: name }, dedupeKey: `player_registration:${registration.id}:pending` });
        return registration;
    }),

    review: ({ clubId, requestId, actorUserId, decision, reason = null }) => db.transaction(async trx => {
        const snapshot = (await trx.query('SELECT user_id FROM player_registration_requests WHERE club_id=$1 AND id=$2', [clubId, requestId])).first;
        if (!snapshot) fail(404, 'Registration request not found in this club.');
        await lockMember(trx, clubId, snapshot.user_id, decision === 'approved');
        const actor = (await trx.query('SELECT role,status FROM user_clubs WHERE club_id=$1 AND user_id=$2 FOR SHARE', [clubId, actorUserId])).first;
        if (actor?.status !== 'ACTIVE_MEMBER' || !['owner','admin'].includes(actor.role)) fail(403, 'Only club owners and admins can review registrations.');
        const registration = (await trx.query('SELECT * FROM player_registration_requests WHERE club_id=$1 AND id=$2 FOR UPDATE', [clubId, requestId])).first;
        if (registration.status !== 'pending') fail(409, 'This registration has already been reviewed.');
        let player = null;
        if (decision === 'approved') {
            await ensureUnlinked(trx, clubId, snapshot.user_id);
            player = await PlayerModel.create({ clubId, actorUserId, name: registration.name, bio: registration.bio, federationId: registration.federation_id }, trx);
            const link = (await trx.query(
                `INSERT INTO player_links(club_id,user_id,player_id,status,reviewed_by,reviewed_at)
                 VALUES($1,$2,$3,'approved',$4,NOW()) RETURNING id`,
                [clubId, snapshot.user_id, player.id, actorUserId]
            )).first;
            await trx.query(
                `INSERT INTO player_link_events(club_id,player_id,user_id,link_id,actor_user_id,event_type,to_status,payload_json)
                 VALUES($1,$2,$3,$4,$5,'player_claim.approved','approved',$6::jsonb)`,
                [clubId, player.id, snapshot.user_id, link.id, actorUserId, JSON.stringify({ source: 'self_registration', requestId })]
            );
        }
        const reviewed = (await trx.query(
            `UPDATE player_registration_requests SET status=$3,player_id=$4,reviewed_by=$5,reviewed_at=NOW(),review_reason=$6
             WHERE club_id=$1 AND id=$2 RETURNING *`,
            [clubId, requestId, decision, player?.id ?? null, actorUserId, reason]
        )).first;
        await createNotification({ trx, clubId, userId: registration.user_id, eventType: `player_registration.${decision}`,
            payload: { requestId, playerName: registration.name, reason, ...(player ? { playerId: player.id } : {}) },
            dedupeKey: `player_registration:${requestId}:${decision}` });
        return reviewed;
    }),
};
