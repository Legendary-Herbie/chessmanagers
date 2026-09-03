import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { removeImageAsset } from '../services/ImageAssetService.js';
import {
    addClubMember,
    authorization,
    createClub,
    createPlayer,
    createUser,
} from '../test/factories.js';

describe('player lifecycle and account linking', () => {
    it('supports claim approval, constrained self editing, self unlink, and persistent events', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member);
        const player = await createPlayer(club, { name: 'Claimable Player' });
        const base = `/api/v1/clubs/${club.id}`;

        const claim = await request(app)
            .post(`${base}/players/${player.id}/claim`)
            .set('Authorization', authorization(member))
            .send({})
            .expect(201);

        const roster = await request(app)
            .get(`${base}/players`)
            .set('Authorization', authorization(member))
            .expect(200);
        expect(roster.body.players[0]).not.toHaveProperty('linked_user_id');
        expect(roster.body.players[0]).toMatchObject({ link_status: 'pending', is_self: true });

        await request(app)
            .patch(`${base}/player-links/${claim.body.link.id}/approve`)
            .set('Authorization', authorization(owner))
            .send({})
            .expect(200);

        await request(app)
            .patch(`${base}/players/${player.id}/profile`)
            .set('Authorization', authorization(member))
            .send({ bio: 'Member-managed biography' })
            .expect(200);

        const photo = await request(app)
            .post(`${base}/players/${player.id}/photo`)
            .set('Authorization', authorization(member))
            .attach('image', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'), {
                filename: 'profile.png',
                contentType: 'image/png',
            })
            .expect(200);
        expect(photo.body.player.photo_url).toMatch(/^\/uploads\/images\/player-/);

        await request(app)
            .patch(`${base}/players/${player.id}/profile`)
            .set('Authorization', authorization(member))
            .send({ name: 'Unauthorized identity change' })
            .expect(400);

        await request(app)
            .delete(`${base}/players/${player.id}/unlink`)
            .set('Authorization', authorization(member))
            .send({ reason: 'Using a different club profile' })
            .expect(200);

        const link = await db.query('SELECT status, unlinked_by FROM player_links WHERE id = $1', [claim.body.link.id]);
        expect(link.first).toMatchObject({ status: 'unlinked', unlinked_by: member.id });
        const events = await db.query(
            'SELECT event_type FROM player_link_events WHERE link_id = $1 ORDER BY created_at',
            [claim.body.link.id]
        );
        expect(events.rows.map(row => row.event_type)).toEqual([
            'player_claim.submitted',
            'player_claim.approved',
            'player_link.unlinked',
        ]);
        const notifications = await db.query(
            'SELECT event_type FROM notifications WHERE user_id = $1 ORDER BY created_at',
            [member.id]
        );
        expect(notifications.rows.map(row => row.event_type)).toEqual([
            'player_claim.approved',
            'player_link.unlinked',
        ]);
        await removeImageAsset(photo.body.player.photo_url);
    });

    it('lets club owners and admins upload a club badge while blocking members', async () => {
        const owner = await createUser();
        const admin = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, admin, 'admin');
        await addClubMember(club, member);
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

        await request(app)
            .post(`/api/v1/clubs/${club.id}/badge`)
            .set('Authorization', authorization(member))
            .attach('image', png, { filename: 'badge.png', contentType: 'image/png' })
            .expect(403);

        await request(app)
            .post(`/api/v1/clubs/${club.id}/badge`)
            .set('Authorization', authorization(owner))
            .attach('image', Buffer.from('not an image'), { filename: 'badge.png', contentType: 'image/png' })
            .expect(400);

        const uploaded = await request(app)
            .post(`/api/v1/clubs/${club.id}/badge`)
            .set('Authorization', authorization(admin))
            .attach('image', png, { filename: 'badge.png', contentType: 'image/png' })
            .expect(200);
        expect(uploaded.body.club.logo).toMatch(/^\/uploads\/images\/club-/);
        const stored = await db.query('SELECT logo FROM clubs WHERE id = $1', [club.id]);
        expect(stored.first.logo).toBe(uploaded.body.club.logo);
        await removeImageAsset(uploaded.body.club.logo);
    });

    it('allows a rejected member to resubmit and links the same user independently across clubs', async () => {
        const ownerA = await createUser();
        const ownerB = await createUser();
        const member = await createUser();
        const clubA = await createClub(ownerA);
        const clubB = await createClub(ownerB);
        await addClubMember(clubA, member);
        await addClubMember(clubB, member);
        const playerA = await createPlayer(clubA);
        const playerB = await createPlayer(clubB);

        const first = await request(app)
            .post(`/api/v1/clubs/${clubA.id}/players/${playerA.id}/claim`)
            .set('Authorization', authorization(member))
            .send({})
            .expect(201);
        await request(app)
            .patch(`/api/v1/clubs/${clubA.id}/player-links/${first.body.link.id}/reject`)
            .set('Authorization', authorization(ownerA))
            .send({ reason: 'Please verify with an administrator' })
            .expect(200);

        const retried = await request(app)
            .post(`/api/v1/clubs/${clubA.id}/players/${playerA.id}/claim`)
            .set('Authorization', authorization(member))
            .send({})
            .expect(201);
        const otherClub = await request(app)
            .post(`/api/v1/clubs/${clubB.id}/players/${playerB.id}/claim`)
            .set('Authorization', authorization(member))
            .send({})
            .expect(201);

        await request(app)
            .patch(`/api/v1/clubs/${clubA.id}/player-links/${retried.body.link.id}/approve`)
            .set('Authorization', authorization(ownerA))
            .send({})
            .expect(200);
        await request(app)
            .patch(`/api/v1/clubs/${clubB.id}/player-links/${otherClub.body.link.id}/approve`)
            .set('Authorization', authorization(ownerB))
            .send({})
            .expect(200);

        const approved = await db.query(
            `SELECT club_id, player_id FROM player_links
             WHERE user_id = $1 AND status = 'approved' ORDER BY club_id`,
            [member.id]
        );
        expect(approved.rows).toHaveLength(2);
        expect(new Set(approved.rows.map(row => row.player_id))).toEqual(new Set([playerA.id, playerB.id]));
    });

    it('serializes competing approval attempts so exactly one succeeds', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member);
        const player = await createPlayer(club);
        const claim = await request(app)
            .post(`/api/v1/clubs/${club.id}/players/${player.id}/claim`)
            .set('Authorization', authorization(member))
            .send({})
            .expect(201);

        const approvals = await Promise.all([
            request(app).patch(`/api/v1/clubs/${club.id}/player-links/${claim.body.link.id}/approve`)
                .set('Authorization', authorization(owner)).send({}),
            request(app).patch(`/api/v1/clubs/${club.id}/player-links/${claim.body.link.id}/approve`)
                .set('Authorization', authorization(owner)).send({}),
        ]);
        expect(approvals.map(response => response.status).sort()).toEqual([200, 409]);

        const approved = await db.query(
            `SELECT COUNT(*)::int AS count FROM player_links
             WHERE id = $1 AND status = 'approved'`,
            [claim.body.link.id]
        );
        const notifications = await db.query(
            `SELECT COUNT(*)::int AS count FROM notifications
             WHERE user_id = $1 AND event_type = 'player_claim.approved'`,
            [member.id]
        );
        expect(approved.first.count).toBe(1);
        expect(notifications.first.count).toBe(1);
    });

    it('archives and soft-deletes players without exposing them to claims, matches, or rankings', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member);
        const archived = await createPlayer(club, { name: 'Archived Player' });
        const active = await createPlayer(club, { name: 'Active Player' });
        const base = `/api/v1/clubs/${club.id}`;

        await request(app)
            .patch(`${base}/players/${archived.id}/archive`)
            .set('Authorization', authorization(owner))
            .send({})
            .expect(200);

        const roster = await request(app).get(`${base}/players`)
            .set('Authorization', authorization(owner)).expect(200);
        const leaderboard = await request(app).get(`${base}/leaderboard`)
            .set('Authorization', authorization(owner)).expect(200);
        expect(roster.body.players.map(row => row.id)).not.toContain(archived.id);
        expect(leaderboard.body.players.map(row => row.id)).not.toContain(archived.id);

        await request(app).post(`${base}/players/${archived.id}/claim`)
            .set('Authorization', authorization(member)).send({}).expect(409);
        await request(app).post(`${base}/matches`)
            .set('Authorization', authorization(owner))
            .send({
                whitePlayerId: archived.id,
                blackPlayerId: active.id,
                result: 'draw',
                isRated: true,
                ratingCategory: 'rapid',
                playedAt: '2026-08-01T12:00:00.000Z',
            })
            .expect(404);

        await request(app).delete(`${base}/players/${archived.id}`)
            .set('Authorization', authorization(owner)).send({}).expect(200);
        const historicalProfile = await request(app).get(`${base}/players/${archived.id}`)
            .set('Authorization', authorization(owner)).expect(200);
        expect(historicalProfile.body.player.status).toBe('deleted');
        await request(app).post(`${base}/players/${archived.id}/claim`)
            .set('Authorization', authorization(member)).send({}).expect(409);
    });
});
