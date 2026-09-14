import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { authorization, createClub, createUser, addClubMember, createPlayer } from '../test/factories.js';

async function setup() {
    const owner = await createUser();
    const member = await createUser();
    const club = await createClub(owner);
    await addClubMember(club, member);
    return { owner, member, club, base: `/api/v1/clubs/${club.id}/players/self-registrations` };
}
describe('self-registration', () => {
    it('respects disabled club player notifications without blocking registration', async () => {
        const { owner, member, club, base } = await setup();
        await db.query('UPDATE clubs SET settings_json=$2::jsonb WHERE id=$1', [club.id, JSON.stringify({ notifications: { playerClaimEvents: false } })]);
        const result = await request(app).post(base).set('Authorization', authorization(member)).send({ name: 'My name' }).expect(201);
        await request(app).patch(`${base}/${result.body.registration.id}`).set('Authorization', authorization(owner)).send({ decision: 'approved' }).expect(200);
        expect((await db.query("SELECT id FROM notifications WHERE club_id=$1 AND event_type LIKE 'player_registration.%'", [club.id])).rowCount).toBe(0);
    });
    it('creates nothing before approval, then atomically creates category ratings and the requester link', async () => {
        const { owner, member, club, base } = await setup();
        await db.query("UPDATE club_rating_settings SET initial_rating=1700 WHERE club_id=$1 AND category='rapid'", [club.id]);
        const submitted = await request(app).post(base).set('Authorization', authorization(member)).send({ name: ' My Profile ', bio: 'About me' }).expect(201);
        expect(submitted.body.registration).toMatchObject({ name: 'My Profile', user_id: member.id, status: 'pending' });
        const pendingAlerts = await db.query("SELECT user_id FROM notifications WHERE club_id=$1 AND event_type='player_registration.pending'", [club.id]);
        expect(pendingAlerts.rows).toEqual([{ user_id: owner.id }]);
        expect((await db.query('SELECT id FROM players WHERE club_id=$1', [club.id])).rowCount).toBe(0);
        await request(app).patch(`${base}/${submitted.body.registration.id}`).set('Authorization', authorization(member)).send({ decision: 'approved' }).expect(403);
        const approvals = await Promise.all([1, 2].map(() => request(app).patch(`${base}/${submitted.body.registration.id}`).set('Authorization', authorization(owner)).send({ decision: 'approved' })));
        expect(approvals.map(response => response.status).sort()).toEqual([200, 409]);
        const created = approvals.find(response => response.status === 200).body.registration;
        const approvalAlerts = await db.query("SELECT user_id,payload_json FROM notifications WHERE club_id=$1 AND event_type='player_registration.approved'", [club.id]);
        expect(approvalAlerts.rows).toHaveLength(1);
        expect(approvalAlerts.first).toMatchObject({ user_id: member.id, payload_json: { playerId: created.player_id } });
        const links = await db.query('SELECT * FROM player_links WHERE club_id=$1', [club.id]);
        expect(links.rows).toHaveLength(1);
        expect(links.first).toMatchObject({ user_id: member.id, player_id: created.player_id, status: 'approved' });
        const ratings = await db.query('SELECT category,start_rating FROM player_rating_state WHERE player_id=$1 ORDER BY category', [created.player_id]);
        expect(ratings.rows).toEqual([{ category: 'blitz', start_rating: 1500 }, { category: 'classical', start_rating: 1500 }, { category: 'rapid', start_rating: 1700 }]);
        await request(app).post(base).set('Authorization', authorization(member)).send({ name: 'Another' }).expect(409);
    });

    it('rejects identity/rating overrides, conflicting claims, and cross-club access', async () => {
        const { owner, member, club, base } = await setup();
        const stranger = await createUser();
        await request(app).get(base).set('Authorization', authorization(stranger)).expect(403);
        for (const fields of [{ userId: owner.id }, { startRatings: { rapid: 3000 } }, { rating: 3000 }]) {
            await request(app).post(base).set('Authorization', authorization(member)).send({ name: 'My profile', ...fields }).expect(400);
        }
        const submission = await request(app).post(base).set('Authorization', authorization(member)).send({ name: 'My profile' }).expect(201);
        await request(app).post(base).set('Authorization', authorization(member)).send({ name: 'Duplicate' }).expect(409);
        const player = await createPlayer(club);
        await request(app).post(`/api/v1/clubs/${club.id}/players/${player.id}/claim`).set('Authorization', authorization(member)).send({}).expect(409);
        const other = await createClub(stranger);
        await request(app).patch(`/api/v1/clubs/${other.id}/players/self-registrations/${submission.body.registration.id}`).set('Authorization', authorization(stranger)).send({ decision: 'approved' }).expect(404);
        const otherMember = await createUser();
        await addClubMember(club, otherMember);
        const privateList = await request(app).get(base).set('Authorization', authorization(otherMember)).expect(200);
        expect(privateList.body.registrations).toEqual([]);
    });

    it('allows rejection and resubmission without adding a player', async () => {
        const { owner, member, club, base } = await setup();
        const result = await request(app).post(base).set('Authorization', authorization(member)).send({ name: 'My name' }).expect(201);
        await request(app).patch(`${base}/${result.body.registration.id}`).set('Authorization', authorization(owner)).send({ decision: 'rejected', reason: 'Please use your full name.' }).expect(200);
        expect((await db.query('SELECT id FROM players WHERE club_id=$1', [club.id])).rowCount).toBe(0);
        const own = await request(app).get(base).set('Authorization', authorization(member)).expect(200);
        expect(own.body.registrations[0].review_reason).toBe('Please use your full name.');
        const rejected = await db.query("SELECT user_id,payload_json FROM notifications WHERE club_id=$1 AND event_type='player_registration.rejected'", [club.id]);
        expect(rejected.rows).toHaveLength(1);
        expect(rejected.first).toMatchObject({ user_id: member.id, payload_json: { reason: 'Please use your full name.' } });
        await request(app).post(base).set('Authorization', authorization(member)).send({ name: 'My full name' }).expect(201);
    });

    it('rolls back player and rating creation if linking fails', async () => {
        const { owner, member, club, base } = await setup();
        const result = await request(app).post(base).set('Authorization', authorization(member)).send({ name: 'My name' }).expect(201);
        await db.query(`CREATE FUNCTION reject_registration_link() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test link failure'; END; $$ LANGUAGE plpgsql;
            CREATE TRIGGER reject_registration_link BEFORE INSERT ON player_links FOR EACH ROW EXECUTE FUNCTION reject_registration_link();`);
        try {
            await request(app).patch(`${base}/${result.body.registration.id}`).set('Authorization', authorization(owner)).send({ decision: 'approved' }).expect(500);
            expect((await db.query('SELECT id FROM players WHERE club_id=$1', [club.id])).rowCount).toBe(0);
            expect((await db.query('SELECT player_id FROM player_rating_state WHERE club_id=$1', [club.id])).rowCount).toBe(0);
            expect((await db.query('SELECT status FROM player_registration_requests WHERE id=$1', [result.body.registration.id])).first.status).toBe('pending');
            expect((await db.query("SELECT id FROM notifications WHERE club_id=$1 AND event_type='player_registration.approved'", [club.id])).rowCount).toBe(0);
        } finally { await db.query('DROP TRIGGER reject_registration_link ON player_links; DROP FUNCTION reject_registration_link();'); }
    });
});
