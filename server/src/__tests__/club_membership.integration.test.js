import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { MEMBERSHIP_LIFECYCLE_SQL } from '../database/migrations/1700000000004_membership_lifecycle.js';
import {
    addClubMember,
    authorization,
    createClub,
    createInvite,
    createJoinRequest,
    createMatch,
    createPlayer,
    createPlayerLink,
    createUser,
} from '../test/factories.js';

describe('club membership lifecycle', () => {
    it('creates one pending request and approves it with history and notification', async () => {
        const owner = await createUser();
        const applicant = await createUser();
        const club = await createClub(owner);

        const requested = await request(app)
            .post(`/api/v1/clubs/${club.id}/join`)
            .set('Authorization', authorization(applicant))
            .send({ message: 'I would like to join.' })
            .expect(202);
        expect(requested.body.membership.status).toBe('PENDING_APPROVAL');

        const duplicate = await request(app)
            .post(`/api/v1/clubs/${club.id}/join`)
            .set('Authorization', authorization(applicant))
            .send({})
            .expect(409);
        expect(duplicate.body.code).toBe('DUPLICATE_PENDING');

        await request(app)
            .patch(`/api/v1/clubs/${club.id}/join-requests/${requested.body.request.id}/approve`)
            .set('Authorization', authorization(owner))
            .send({})
            .expect(200);

        const state = await db.query(
            'SELECT role, status, activated_at FROM user_clubs WHERE club_id = $1 AND user_id = $2',
            [club.id, applicant.id]
        );
        expect(state.first).toMatchObject({ role: 'member', status: 'ACTIVE_MEMBER' });
        expect(state.first.activated_at).toBeTruthy();

        const events = await db.query(
            'SELECT event_type FROM club_membership_events WHERE club_id = $1 AND user_id = $2 ORDER BY created_at',
            [club.id, applicant.id]
        );
        expect(events.rows.map(row => row.event_type)).toEqual([
            'membership.request_submitted',
            'membership.request_approved',
        ]);
        const notification = await db.query(
            'SELECT event_type, payload_json FROM notifications WHERE club_id = $1 AND user_id = $2',
            [club.id, applicant.id]
        );
        expect(notification.first).toMatchObject({
            event_type: 'join_request.approved',
            payload_json: { membershipStatus: 'ACTIVE_MEMBER' },
        });
    });

    it('enforces rejection cooldown for requests, invites, and join codes', async () => {
        const owner = await createUser();
        const applicant = await createUser();
        const club = await createClub(owner);
        const token = authorization(applicant);

        const pending = await request(app)
            .post(`/api/v1/clubs/${club.id}/join`)
            .set('Authorization', token)
            .send({})
            .expect(202);
        const rejected = await request(app)
            .patch(`/api/v1/clubs/${club.id}/join-requests/${pending.body.request.id}/reject`)
            .set('Authorization', authorization(owner))
            .send({ reason: 'Roster is full.' })
            .expect(200);
        expect(rejected.body.membership.status).toBe('REJECTED');
        expect(rejected.body.membership.cooldownEndsAt).toBeTruthy();

        const retry = await request(app)
            .post(`/api/v1/clubs/${club.id}/join`)
            .set('Authorization', token)
            .send({})
            .expect(409);
        expect(retry.body).toMatchObject({ code: 'REJECTION_COOLDOWN' });
        expect(retry.body.eligibleAt).toBeTruthy();

        const invite = await createInvite(club, owner);
        const invited = await request(app)
            .post('/api/v1/clubs/join-by-token')
            .set('Authorization', token)
            .send({ token: invite.token })
            .expect(409);
        expect(invited.body.code).toBe('REJECTION_COOLDOWN');

        const rotated = await request(app)
            .post(`/api/v1/clubs/${club.id}/join-code/rotate`)
            .set('Authorization', authorization(owner))
            .send({})
            .expect(201);
        const coded = await request(app)
            .post('/api/v1/clubs/join-by-code')
            .set('Authorization', token)
            .send({ code: rotated.body.joinCode.code })
            .expect(409);
        expect(coded.body.code).toBe('REJECTION_COOLDOWN');

        await db.query(
            `UPDATE user_clubs SET rejected_at = NOW() - INTERVAL '7 days 1 minute'
             WHERE club_id = $1 AND user_id = $2`,
            [club.id, applicant.id]
        );
        await request(app)
            .post(`/api/v1/clubs/${club.id}/join`)
            .set('Authorization', token)
            .send({ message: 'Reapplying after cooldown.' })
            .expect(202);
    });

    it('respects disabled membership notification settings', async () => {
        const owner = await createUser();
        const applicant = await createUser();
        const club = await createClub(owner, {
            settings: { notifications: { membershipEvents: false } },
        });
        const pending = await request(app)
            .post(`/api/v1/clubs/${club.id}/join`)
            .set('Authorization', authorization(applicant))
            .send({})
            .expect(202);
        await request(app)
            .patch(`/api/v1/clubs/${club.id}/join-requests/${pending.body.request.id}/approve`)
            .set('Authorization', authorization(owner))
            .send({})
            .expect(200);

        const notifications = await db.query(
            'SELECT COUNT(*)::int AS count FROM notifications WHERE club_id = $1 AND user_id = $2',
            [club.id, applicant.id]
        );
        expect(notifications.first.count).toBe(0);
    });

    it('preserves chess identity and history when a member leaves and rejoins', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member, 'admin');
        const memberPlayer = await createPlayer(club);
        const opponent = await createPlayer(club);
        await createPlayerLink(member, memberPlayer, { status: 'approved', reviewedAt: new Date() });
        const match = await createMatch(club, memberPlayer, opponent);

        await request(app)
            .post(`/api/v1/clubs/${club.id}/leave`)
            .set('Authorization', authorization(member))
            .send({ reason: 'Taking a break.' })
            .expect(200);
        const revoked = await db.query(
            'SELECT role, status, revoked_at FROM user_clubs WHERE club_id = $1 AND user_id = $2',
            [club.id, member.id]
        );
        expect(revoked.first).toMatchObject({ role: 'member', status: 'REVOKED' });
        expect(revoked.first.revoked_at).toBeTruthy();

        const retained = await db.query(
            `SELECT
                (SELECT COUNT(*)::int FROM players WHERE id = $1) AS players,
                (SELECT COUNT(*)::int FROM player_links WHERE player_id = $1 AND user_id = $2) AS links,
                (SELECT COUNT(*)::int FROM matches WHERE id = $3) AS matches`,
            [memberPlayer.id, member.id, match.id]
        );
        expect(retained.first).toEqual({ players: 1, links: 1, matches: 1 });

        const invite = await createInvite(club, owner);
        await request(app)
            .post('/api/v1/clubs/join-by-token')
            .set('Authorization', authorization(member))
            .send({ token: invite.token })
            .expect(200);
        const rejoined = await db.query(
            'SELECT role, status FROM user_clubs WHERE club_id = $1 AND user_id = $2',
            [club.id, member.id]
        );
        expect(rejoined.first).toEqual({ role: 'member', status: 'ACTIVE_MEMBER' });

        await request(app)
            .post(`/api/v1/clubs/${club.id}/leave`)
            .set('Authorization', authorization(owner))
            .send({})
            .expect(409);
    });

    it('supports revocation and request-based rejoining without deleting membership history', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member);

        await request(app)
            .delete(`/api/v1/clubs/${club.id}/members/${member.id}`)
            .set('Authorization', authorization(owner))
            .send({ reason: 'Membership ended.' })
            .expect(200);
        await request(app)
            .post(`/api/v1/clubs/${club.id}/join`)
            .set('Authorization', authorization(member))
            .send({ message: 'Requesting to return.' })
            .expect(202);

        const events = await db.query(
            `SELECT event_type FROM club_membership_events
             WHERE club_id = $1 AND user_id = $2 ORDER BY created_at`,
            [club.id, member.id]
        );
        expect(events.rows.map(row => row.event_type)).toEqual([
            'membership.revoked',
            'membership.request_submitted',
        ]);
    });

    it('rotates and revokes hashed six-digit join codes for private clubs', async () => {
        const owner = await createUser();
        const firstUser = await createUser();
        const secondUser = await createUser();
        const club = await createClub(owner, { isPublic: false });

        await request(app)
            .post(`/api/v1/clubs/${club.id}/join`)
            .set('Authorization', authorization(firstUser))
            .send({})
            .expect(404);
        await request(app)
            .get(`/api/v1/clubs/${club.id}`)
            .set('Authorization', authorization(firstUser))
            .expect(200)
            .expect(response => {
                expect(response.body.club).toMatchObject({
                    id: club.id, name: club.name, visibility: 'private', is_member: false,
                });
                expect(response.body.club).not.toHaveProperty('description');
            });

        const firstRotation = await request(app)
            .post(`/api/v1/clubs/${club.id}/join-code/rotate`)
            .set('Authorization', authorization(owner))
            .send({})
            .expect(201);
        expect(firstRotation.body.joinCode.code).toMatch(/^\d{6}$/);
        const stored = await db.query(
            'SELECT code_digest FROM club_join_codes WHERE club_id = $1 AND revoked_at IS NULL',
            [club.id]
        );
        expect(stored.first.code_digest).not.toBe(firstRotation.body.joinCode.code);

        const secondRotation = await request(app)
            .post(`/api/v1/clubs/${club.id}/join-code/rotate`)
            .set('Authorization', authorization(owner))
            .send({})
            .expect(201);
        await request(app)
            .post('/api/v1/clubs/join-by-code')
            .set('Authorization', authorization(firstUser))
            .send({ code: firstRotation.body.joinCode.code })
            .expect(404);
        await request(app)
            .post('/api/v1/clubs/join-by-code')
            .set('Authorization', authorization(firstUser))
            .send({ code: secondRotation.body.joinCode.code })
            .expect(200);
        await request(app)
            .get(`/api/v1/clubs/${club.id}`)
            .set('Authorization', authorization(firstUser))
            .expect(200);

        await request(app)
            .delete(`/api/v1/clubs/${club.id}/join-code`)
            .set('Authorization', authorization(owner))
            .send({})
            .expect(200);
        await request(app)
            .post('/api/v1/clubs/join-by-code')
            .set('Authorization', authorization(secondUser))
            .send({ code: secondRotation.body.joinCode.code })
            .expect(404);
    });

    it('rejects expired and revoked invite tokens without changing membership', async () => {
        const owner = await createUser();
        const user = await createUser();
        const club = await createClub(owner);
        const expired = await createInvite(club, owner, { expiresAt: new Date('2020-01-01') });
        const revoked = await createInvite(club, owner, { revoked: true });

        for (const invite of [expired, revoked]) {
            await request(app)
                .post('/api/v1/clubs/join-by-token')
                .set('Authorization', authorization(user))
                .send({ token: invite.token })
                .expect(404);
        }
        const membership = await db.query(
            'SELECT 1 FROM user_clubs WHERE club_id = $1 AND user_id = $2',
            [club.id, user.id]
        );
        expect(membership.rowCount).toBe(0);
    });

    it('scopes guessed request and invite IDs to the administering club', async () => {
        const ownerA = await createUser();
        const ownerB = await createUser();
        const applicant = await createUser();
        const invitee = await createUser();
        const clubA = await createClub(ownerA);
        const clubB = await createClub(ownerB);
        const pendingB = await createJoinRequest(clubB, applicant);
        await db.query(
            `INSERT INTO user_clubs (club_id, user_id, role, status)
             VALUES ($1, $2, 'member', 'PENDING_APPROVAL')`,
            [clubB.id, applicant.id]
        );
        const inviteB = await createInvite(clubB, ownerB);

        await request(app)
            .patch(`/api/v1/clubs/${clubA.id}/join-requests/${pendingB.id}/approve`)
            .set('Authorization', authorization(ownerA))
            .send({})
            .expect(404);
        await request(app)
            .delete(`/api/v1/clubs/${clubA.id}/invites/${inviteB.id}`)
            .set('Authorization', authorization(ownerA))
            .expect(404);
        await request(app)
            .post('/api/v1/clubs/join-by-token')
            .set('Authorization', authorization(invitee))
            .send({ token: inviteB.token })
            .expect(200);
    });

    it('serializes concurrent approval and rejection of the same request', async () => {
        const owner = await createUser();
        const applicant = await createUser();
        const club = await createClub(owner);
        const pending = await request(app)
            .post(`/api/v1/clubs/${club.id}/join`)
            .set('Authorization', authorization(applicant))
            .send({})
            .expect(202);
        const ownerToken = authorization(owner);

        const responses = await Promise.all([
            request(app)
                .patch(`/api/v1/clubs/${club.id}/join-requests/${pending.body.request.id}/approve`)
                .set('Authorization', ownerToken)
                .send({}),
            request(app)
                .patch(`/api/v1/clubs/${club.id}/join-requests/${pending.body.request.id}/reject`)
                .set('Authorization', ownerToken)
                .send({ reason: 'Concurrent decision.' }),
        ]);
        expect(responses.map(response => response.status).sort()).toEqual([200, 409]);

        const membership = await db.query(
            'SELECT status FROM user_clubs WHERE club_id = $1 AND user_id = $2',
            [club.id, applicant.id]
        );
        expect(['ACTIVE_MEMBER', 'REJECTED']).toContain(membership.first.status);
    });

    it('keeps concurrent approval and revocation in a valid serialized state', async () => {
        const owner = await createUser();
        const applicant = await createUser();
        const club = await createClub(owner);
        const pending = await request(app)
            .post(`/api/v1/clubs/${club.id}/join`)
            .set('Authorization', authorization(applicant))
            .send({})
            .expect(202);
        const ownerToken = authorization(owner);

        const [approval, revocation] = await Promise.all([
            request(app)
                .patch(`/api/v1/clubs/${club.id}/join-requests/${pending.body.request.id}/approve`)
                .set('Authorization', ownerToken)
                .send({}),
            request(app)
                .delete(`/api/v1/clubs/${club.id}/members/${applicant.id}`)
                .set('Authorization', ownerToken)
                .send({ reason: 'Concurrent revocation.' }),
        ]);
        expect(approval.status).toBe(200);
        expect([200, 409]).toContain(revocation.status);

        const membership = await db.query(
            'SELECT status FROM user_clubs WHERE club_id = $1 AND user_id = $2',
            [club.id, applicant.id]
        );
        expect(['ACTIVE_MEMBER', 'REVOKED']).toContain(membership.first.status);
    });

    it('rate-limits repeated join-code guesses per authenticated account', async () => {
        const attacker = await createUser();
        const token = authorization(attacker);
        for (let attempt = 0; attempt < 10; attempt += 1) {
            await request(app)
                .post('/api/v1/clubs/join-by-code')
                .set('Authorization', token)
                .send({ code: String(attempt).padStart(6, '0') })
                .expect(404);
        }
        await request(app)
            .post('/api/v1/clubs/join-by-code')
            .set('Authorization', token)
            .send({ code: '999999' })
            .expect(429);
    });

    it('reapplies the additive membership migration safely', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        await db.query(MEMBERSHIP_LIFECYCLE_SQL);

        const columns = await db.query(
            `SELECT COUNT(*)::int AS count
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND (table_name, column_name) IN (
                   ('user_clubs', 'activated_at'),
                   ('club_join_requests', 'processed_by')
               )`
        );
        const codes = await db.query(
            'SELECT COUNT(*)::int AS count FROM club_join_codes WHERE club_id = $1',
            [club.id]
        );
        expect(columns.first.count).toBe(2);
        expect(codes.first.count).toBe(0);
    });
});
