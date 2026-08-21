import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { PERSISTENT_NOTIFICATIONS_SQL } from '../database/migrations/1700000000011_persistent_notifications.js';
import {
    createNotification,
    processNotificationOutbox,
    validateNotificationPayload,
} from '../services/NotificationService.js';
import {
    addClubMember,
    authorization,
    createClub,
    createUser,
} from '../test/factories.js';

async function membershipNotification({ user, club, dedupeKey = 'decision:1' }) {
    return db.transaction(trx => createNotification({
        trx,
        userId: user.id,
        clubId: club.id,
        eventType: 'join_request.approved',
        payload: { membershipStatus: 'ACTIVE_MEMBER' },
        dedupeKey,
    }));
}

describe('persistent notifications and delivery outbox', () => {
    it('lists only the authenticated user notifications and persists read state', async () => {
        const owner = await createUser();
        const member = await createUser();
        const outsider = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member);
        const notification = await membershipNotification({ user: member, club });

        const listed = await request(app)
            .get('/api/v1/notifications?limit=10&offset=0')
            .set('Authorization', authorization(member))
            .expect(200);
        expect(listed.body).toMatchObject({ total: 1, limit: 10, offset: 0 });
        expect(listed.body.notifications[0]).toMatchObject({
            id: notification.id,
            clubId: club.id,
            clubName: club.name,
            eventType: 'join_request.approved',
            payload: { membershipStatus: 'ACTIVE_MEMBER' },
            readAt: null,
        });

        await request(app)
            .patch(`/api/v1/notifications/${notification.id}/read`)
            .set('Authorization', authorization(outsider))
            .send({})
            .expect(404);
        await request(app)
            .patch(`/api/v1/notifications/${notification.id}/read`)
            .set('Authorization', authorization(member))
            .send({})
            .expect(200);

        const unread = await request(app)
            .get('/api/v1/notifications/unread-count')
            .set('Authorization', authorization(member))
            .expect(200);
        expect(unread.body.count).toBe(0);
        expect(await db.query(
            'SELECT read_at FROM notifications WHERE id = $1', [notification.id]
        ).then(result => result.first.read_at)).toBeTruthy();
    });

    it('marks all notifications read independently by club', async () => {
        const owner = await createUser();
        const member = await createUser();
        const firstClub = await createClub(owner);
        const secondClub = await createClub(owner);
        await addClubMember(firstClub, member);
        await addClubMember(secondClub, member);
        await membershipNotification({ user: member, club: firstClub, dedupeKey: 'first' });
        await membershipNotification({ user: member, club: secondClub, dedupeKey: 'second' });

        await request(app)
            .patch('/api/v1/notifications/read')
            .set('Authorization', authorization(member))
            .send({ clubId: firstClub.id })
            .expect(200);

        const unread = await request(app)
            .get('/api/v1/notifications/unread-count')
            .set('Authorization', authorization(member))
            .expect(200);
        expect(unread.body.count).toBe(1);
    });

    it('enforces eligibility and event settings before creating private club records', async () => {
        const owner = await createUser();
        const formerMember = await createUser();
        const mutedMember = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, formerMember);
        await addClubMember(club, mutedMember);
        await db.query(
            `UPDATE user_clubs SET status = 'REVOKED', revoked_at = NOW()
             WHERE club_id = $1 AND user_id = $2`,
            [club.id, formerMember.id]
        );
        await db.query(
            `UPDATE clubs SET settings_json = '{"notifications":{"membershipEvents":false}}'::JSONB
             WHERE id = $1`,
            [club.id]
        );

        expect(await membershipNotification({ user: formerMember, club, dedupeKey: 'revoked' })).toBeNull();
        expect(await membershipNotification({ user: mutedMember, club, dedupeKey: 'muted' })).toBeNull();
        expect(await db.query('SELECT COUNT(*)::INTEGER AS count FROM notifications')
            .then(result => result.first.count)).toBe(0);
    });

    it('rejects non-allowlisted payload fields and deduplicates notification delivery', async () => {
        expect(() => validateNotificationPayload('player_claim.approved', {
            playerId: 'player_1',
            playerName: 'Allowed name',
            linkedUserEmail: 'private@example.test',
        })).toThrow();

        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member);
        const first = await membershipNotification({ user: member, club, dedupeKey: 'same-event' });
        const duplicate = await membershipNotification({ user: member, club, dedupeKey: 'same-event' });
        expect(first).toBeTruthy();
        expect(duplicate).toBeNull();
        expect(await db.query('SELECT COUNT(*)::INTEGER AS count FROM notification_outbox')
            .then(result => result.first.count)).toBe(1);
    });

    it('retries email separately without changing the in-app read state', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner, {
            settings: { notifications: { emailEnabled: true, membershipEvents: true } },
        });
        await addClubMember(club, member);
        const notification = await membershipNotification({ user: member, club });
        await request(app)
            .patch(`/api/v1/notifications/${notification.id}/read`)
            .set('Authorization', authorization(member))
            .send({})
            .expect(200);

        const failingDelivery = vi.fn().mockRejectedValue(new Error('SMTP unavailable'));
        await processNotificationOutbox({ deliver: failingDelivery });
        let outbox = await db.query(
            'SELECT status, attempts, last_error FROM notification_outbox WHERE notification_id = $1',
            [notification.id]
        ).then(result => result.first);
        expect(outbox).toMatchObject({ status: 'failed', attempts: 1, last_error: 'SMTP unavailable' });
        expect(await db.query('SELECT read_at FROM notifications WHERE id = $1', [notification.id])
            .then(result => result.first.read_at)).toBeTruthy();

        await db.query(
            `UPDATE notification_outbox SET available_at = NOW() - INTERVAL '1 second'
             WHERE notification_id = $1`,
            [notification.id]
        );
        const successfulDelivery = vi.fn().mockResolvedValue(true);
        await processNotificationOutbox({ deliver: successfulDelivery });
        await processNotificationOutbox({ deliver: successfulDelivery });
        outbox = await db.query(
            'SELECT status, attempts, delivered_at FROM notification_outbox WHERE notification_id = $1',
            [notification.id]
        ).then(result => result.first);
        expect(outbox.status).toBe('delivered');
        expect(outbox.attempts).toBe(2);
        expect(outbox.delivered_at).toBeTruthy();
        expect(successfulDelivery).toHaveBeenCalledTimes(1);
    });

    it('reapplies the additive notification migration safely', async () => {
        await expect(db.query(PERSISTENT_NOTIFICATIONS_SQL)).resolves.toBeTruthy();
        const tables = await db.query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'notification_outbox'`
        );
        expect(tables.rowCount).toBe(1);
    });
});
