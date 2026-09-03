import { z } from 'zod';
import db from '../database/database.js';
import { sendNotificationEmail } from './EmailService.js';

const nullableReason = z.string().max(500).nullable().optional();
const playerDecisionPayload = z.object({
    playerId: z.string().min(1),
    playerName: z.string().min(1).max(200).nullable().optional(),
    reason: nullableReason,
}).strict();
const matchPayload = z.object({
    matchId: z.string().min(1),
    whitePlayerId: z.string().min(1),
    whitePlayerName: z.string().min(1).max(200),
    blackPlayerId: z.string().min(1),
    blackPlayerName: z.string().min(1).max(200),
    result: z.enum(['white', 'black', 'draw']),
    ratingCategory: z.enum(['blitz', 'rapid', 'classical']),
    playedAt: z.string().datetime(),
}).strict();
const tournamentPayload = z.object({
    tournamentId: z.string().min(1),
    tournamentName: z.string().min(1).max(200),
    playerId: z.string().min(1).optional(),
    roundNumber: z.number().int().positive().optional(),
    pairingId: z.string().min(1).optional(),
    status: z.enum(['upcoming', 'active', 'completed']).optional(),
    result: z.enum(['white', 'black', 'draw', 'bye']).optional(),
}).strict();
const pendingMembershipPayload = z.object({
    requestId: z.string().min(1),
    applicantName: z.string().min(1).max(200),
}).strict();
const pendingClaimPayload = z.object({
    linkId: z.string().min(1),
    playerId: z.string().min(1),
    playerName: z.string().min(1).max(200),
    applicantName: z.string().min(1).max(200),
}).strict();

const EVENT_POLICIES = {
    'membership.request_pending': { setting: 'membershipEvents', schema: pendingMembershipPayload },
    'join_request.approved': {
        setting: 'membershipEvents',
        schema: z.object({ membershipStatus: z.literal('ACTIVE_MEMBER') }).strict(),
    },
    'join_request.rejected': {
        setting: 'membershipEvents',
        allowRejectedMembership: true,
        schema: z.object({
            membershipStatus: z.literal('REJECTED'),
            eligibleAt: z.string().datetime(),
        }).strict(),
    },
    'player_claim.approved': { setting: 'playerClaimEvents', schema: playerDecisionPayload },
    'player_claim.pending': { setting: 'playerClaimEvents', schema: pendingClaimPayload },
    'player_claim.rejected': { setting: 'playerClaimEvents', schema: playerDecisionPayload },
    'player_link.unlinked': { setting: 'playerClaimEvents', schema: playerDecisionPayload },
    'match.recorded': { setting: 'matchEvents', schema: matchPayload },
    'match.corrected': { setting: 'matchEvents', schema: matchPayload },
    'match.voided': { setting: 'matchEvents', schema: matchPayload },
    'match.deleted': { setting: 'matchEvents', schema: matchPayload },
    'tournament.registered': { setting: 'tournamentEvents', schema: tournamentPayload },
    'tournament.removed': { setting: 'tournamentEvents', schema: tournamentPayload },
    'tournament.withdrawn': { setting: 'tournamentEvents', schema: tournamentPayload },
    'tournament.pairing': { setting: 'tournamentEvents', schema: tournamentPayload },
    'tournament.result': { setting: 'tournamentEvents', schema: tournamentPayload },
    'tournament.status': { setting: 'tournamentEvents', schema: tournamentPayload },
    'announcement.published': {
        setting: 'announcementEvents',
        schema: z.object({
            announcementId: z.string().min(1),
            title: z.string().min(1).max(200),
        }).strict(),
    },
};

function queryFor(trx) {
    return trx ? trx.query.bind(trx) : db.query.bind(db);
}

function eventPolicy(eventType) {
    const policy = EVENT_POLICIES[eventType];
    if (!policy) throw new Error(`Unsupported notification event type: ${eventType}`);
    return policy;
}

async function eligibleContext(query, userId, clubId, eventType) {
    const policy = eventPolicy(eventType);
    const row = await query(
        `SELECT users.id AS user_id, users.email, users.deleted_at AS user_deleted_at,
                clubs.id AS club_id, clubs.name AS club_name, clubs.status AS club_status,
                clubs.deleted_at AS club_deleted_at, clubs.settings_json,
                membership.status AS membership_status
         FROM users
         JOIN clubs ON clubs.id = $2
         LEFT JOIN user_clubs membership
           ON membership.user_id = users.id AND membership.club_id = clubs.id
         WHERE users.id = $1`,
        [userId, clubId]
    ).then(result => result.first);
    if (!row || row.user_deleted_at || row.club_deleted_at) return null;
    const membershipEligible = row.membership_status === 'ACTIVE_MEMBER'
        || (policy.allowRejectedMembership && row.membership_status === 'REJECTED');
    if (!membershipEligible) return null;
    return row;
}

function settingEnabled(context, eventType) {
    return context.settings_json?.notifications?.[eventPolicy(eventType).setting] !== false;
}

export function validateNotificationPayload(eventType, payload) {
    return eventPolicy(eventType).schema.parse(payload);
}

export async function createNotification({ trx = null, userId, clubId, eventType, payload, dedupeKey }) {
    const query = queryFor(trx);
    const safePayload = validateNotificationPayload(eventType, payload);
    const context = await eligibleContext(query, userId, clubId, eventType);
    if (!context || !settingEnabled(context, eventType)) return null;

    const notification = await query(
        `INSERT INTO notifications (user_id, club_id, event_type, payload_json, dedupe_key)
         VALUES ($1, $2, $3, $4::JSONB, $5)
         ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
         RETURNING *`,
        [userId, clubId, eventType, JSON.stringify(safePayload), dedupeKey]
    ).then(result => result.first);
    if (!notification) return null;

    await query(
        `INSERT INTO notification_outbox (notification_id, channel)
         VALUES ($1, 'email') ON CONFLICT (notification_id, channel) DO NOTHING`,
        [notification.id]
    );
    return notification;
}

export async function linkedUsersForPlayers(trx, clubId, playerIds) {
    if (!playerIds.length) return [];
    return trx.query(
        `SELECT DISTINCT link.user_id
         FROM player_links link
         JOIN user_clubs membership
           ON membership.club_id = link.club_id AND membership.user_id = link.user_id
          AND membership.status = 'ACTIVE_MEMBER'
         JOIN users ON users.id = link.user_id AND users.deleted_at IS NULL
         WHERE link.club_id = $1 AND link.player_id = ANY($2::TEXT[])
           AND link.status = 'approved'`,
        [clubId, playerIds]
    ).then(result => result.rows.map(row => row.user_id));
}

export async function notifyLinkedPlayers({ trx, clubId, playerIds, eventType, payload, dedupeKey }) {
    const userIds = await linkedUsersForPlayers(trx, clubId, playerIds);
    for (const userId of userIds) {
        await createNotification({ trx, userId, clubId, eventType, payload, dedupeKey });
    }
}

export async function notifyClubAdmins({ trx, clubId, eventType, payload, dedupeKey }) {
    const userIds = await trx.query(
        `SELECT membership.user_id
         FROM user_clubs membership
         JOIN users ON users.id = membership.user_id AND users.deleted_at IS NULL
         WHERE membership.club_id = $1 AND membership.status = 'ACTIVE_MEMBER'
           AND membership.role IN ('owner', 'admin')`,
        [clubId]
    ).then(result => result.rows.map(row => row.user_id));
    for (const userId of userIds) {
        await createNotification({ trx, userId, clubId, eventType, payload, dedupeKey });
    }
}

export async function notifyClubMembers({ trx, clubId, eventType, payload, dedupeKey }) {
    const userIds = await trx.query(
        `SELECT membership.user_id
         FROM user_clubs membership
         JOIN users ON users.id = membership.user_id AND users.deleted_at IS NULL
         WHERE membership.club_id = $1 AND membership.status = 'ACTIVE_MEMBER'`,
        [clubId]
    ).then(result => result.rows.map(row => row.user_id));
    for (const userId of userIds) {
        await createNotification({ trx, userId, clubId, eventType, payload, dedupeKey });
    }
}

function notificationDto(row) {
    return {
        id: row.id,
        clubId: row.club_id,
        clubName: row.club_name,
        eventType: row.event_type,
        payload: row.payload_json,
        readAt: row.read_at,
        createdAt: row.created_at,
    };
}

const visibilitySql = `(
    notification.club_id IS NULL
    OR (club.deleted_at IS NULL AND (
        membership.status = 'ACTIVE_MEMBER'
        OR (notification.event_type = 'join_request.rejected' AND membership.status = 'REJECTED')
    ))
)`;

export async function listNotifications(userId, { clubId = null, unreadOnly = false, limit = 20, offset = 0 }) {
    const result = await db.query(
        `SELECT notification.*, club.name AS club_name,
                COUNT(*) OVER ()::INTEGER AS total_count
         FROM notifications notification
         LEFT JOIN clubs club ON club.id = notification.club_id
         LEFT JOIN user_clubs membership
           ON membership.club_id = notification.club_id AND membership.user_id = notification.user_id
         WHERE notification.user_id = $1
           AND notification.dismissed_at IS NULL
           AND ($2::TEXT IS NULL OR notification.club_id = $2)
           AND (NOT $3::BOOLEAN OR notification.read_at IS NULL)
           AND ${visibilitySql}
         ORDER BY notification.created_at DESC, notification.id DESC
         LIMIT $4 OFFSET $5`,
        [userId, clubId, unreadOnly, limit, offset]
    );
    return {
        notifications: result.rows.map(notificationDto),
        total: result.first?.total_count ?? 0,
        limit,
        offset,
    };
}

export async function getUnreadCount(userId, clubId = null) {
    return db.query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM notifications notification
         LEFT JOIN clubs club ON club.id = notification.club_id
         LEFT JOIN user_clubs membership
           ON membership.club_id = notification.club_id AND membership.user_id = notification.user_id
         WHERE notification.user_id = $1 AND notification.read_at IS NULL
           AND notification.dismissed_at IS NULL
           AND ($2::TEXT IS NULL OR notification.club_id = $2)
           AND ${visibilitySql}`,
        [userId, clubId]
    ).then(result => result.first?.count ?? 0);
}

export async function markNotificationRead(userId, notificationId) {
    return db.query(
        `UPDATE notifications SET read_at = COALESCE(read_at, NOW()), updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND dismissed_at IS NULL
           AND (
               club_id IS NULL OR EXISTS (
                   SELECT 1 FROM clubs club
                   JOIN user_clubs membership ON membership.club_id = club.id
                   WHERE club.id = notifications.club_id AND club.deleted_at IS NULL
                     AND membership.user_id = notifications.user_id
                     AND (
                         membership.status = 'ACTIVE_MEMBER'
                         OR (notifications.event_type = 'join_request.rejected'
                             AND membership.status = 'REJECTED')
                     )
               )
           )
         RETURNING id, read_at`,
        [notificationId, userId]
    ).then(result => result.first);
}

export async function markAllNotificationsRead(userId, clubId = null) {
    return db.query(
         `UPDATE notifications SET read_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND read_at IS NULL AND dismissed_at IS NULL
           AND ($2::TEXT IS NULL OR club_id = $2)
           AND (
               club_id IS NULL OR EXISTS (
                   SELECT 1 FROM clubs club
                   JOIN user_clubs membership ON membership.club_id = club.id
                   WHERE club.id = notifications.club_id AND club.deleted_at IS NULL
                     AND membership.user_id = notifications.user_id
                     AND (
                         membership.status = 'ACTIVE_MEMBER'
                         OR (notifications.event_type = 'join_request.rejected'
                             AND membership.status = 'REJECTED')
                     )
               )
           )`,
        [userId, clubId]
    ).then(result => result.rowCount);
}

export async function dismissNotification(userId, notificationId) {
    return db.query(
        `UPDATE notifications
         SET dismissed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND dismissed_at IS NULL
         RETURNING id, dismissed_at`,
        [notificationId, userId]
    ).then(result => result.first);
}

async function claimOutboxItem() {
    return db.transaction(async trx => trx.query(
        `WITH candidate AS (
            SELECT id FROM notification_outbox
            WHERE ((status IN ('pending', 'failed') AND available_at <= NOW())
                OR (status = 'processing' AND claimed_at <= NOW() - INTERVAL '5 minutes'))
            ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE notification_outbox outbox
         SET status = 'processing', claimed_at = NOW(), attempts = attempts + 1,
             updated_at = NOW(), last_error = NULL
         FROM candidate WHERE outbox.id = candidate.id RETURNING outbox.*`
    ).then(result => result.first));
}

async function deliveryContext(outboxId) {
    const row = await db.query(
        `SELECT outbox.id AS outbox_id, notification.user_id, notification.club_id,
                notification.event_type, notification.payload_json, users.email
         FROM notification_outbox outbox
         JOIN notifications notification ON notification.id = outbox.notification_id
         JOIN users ON users.id = notification.user_id
         WHERE outbox.id = $1`,
        [outboxId]
    ).then(result => result.first);
    if (!row) return null;
    const context = await eligibleContext(db.query.bind(db), row.user_id, row.club_id, row.event_type);
    return context ? { ...row, ...context } : null;
}

async function finishOutbox(id, status, lastError = null) {
    return db.query(
        `UPDATE notification_outbox
         SET status = $2,
             delivered_at = CASE WHEN $2 = 'delivered' THEN NOW() ELSE delivered_at END,
             last_error = $3,
             available_at = CASE WHEN $2 = 'failed'
                 THEN NOW() + LEAST(INTERVAL '1 hour', INTERVAL '1 minute' * POWER(2, attempts - 1))
                 ELSE available_at END,
             updated_at = NOW()
         WHERE id = $1`,
        [id, status, lastError]
    );
}

export async function processNotificationOutbox({ limit = 20, deliver = sendNotificationEmail } = {}) {
    let processed = 0;
    while (processed < limit) {
        const item = await claimOutboxItem();
        if (!item) break;
        processed += 1;
        const context = await deliveryContext(item.id);
        if (!context || !settingEnabled(context, context.event_type)
            || context.settings_json?.notifications?.emailEnabled !== true) {
            await finishOutbox(item.id, 'skipped');
            continue;
        }
        try {
            const delivered = await deliver({
                to: context.email,
                clubName: context.club_name,
                eventType: context.event_type,
                payload: context.payload_json,
            });
            await finishOutbox(item.id, delivered === false ? 'skipped' : 'delivered');
        } catch (error) {
            await finishOutbox(item.id, 'failed', String(error.message || error).slice(0, 1000));
        }
    }
    return processed;
}

let workerTimer = null;

export function startNotificationOutboxWorker(intervalMs = 15_000) {
    if (workerTimer) return workerTimer;
    const run = () => processNotificationOutbox().catch(error => {
        console.error('[Notification outbox] Processing failed', error);
    });
    workerTimer = setInterval(run, intervalMs);
    workerTimer.unref?.();
    run();
    return workerTimer;
}
