import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { CLUB_MANAGEMENT_SQL } from '../database/migrations/1700000000003_club_management.js';
import {
    addClubMember,
    authorization,
    createClub,
    createMatch,
    createPlayer,
    createRatingHistory,
    createUser,
} from '../test/factories.js';

const ratingSettings = {
    blitz: {
        initialRating: 1600,
        ratingFloor: 600,
        establishedKFactor: 24,
        provisionalKFactor: 36,
        provisionalGames: 12,
    },
};

describe('club management', () => {
    it('creates duplicate club names with distinct slugs and default category settings', async () => {
        const owner = await createUser();
        const token = authorization(owner);
        const payload = { name: 'Shared Club Name', federation: 'TEST', visibility: 'public' };

        const first = await request(app).post('/api/v1/clubs').set('Authorization', token).send(payload).expect(201);
        const second = await request(app).post('/api/v1/clubs').set('Authorization', token).send(payload).expect(201);

        expect(first.body.club.slug).not.toBe(second.body.club.slug);
        expect(first.body.club.rating_settings).toEqual({
            blitz: expect.objectContaining({ initialRating: 1500, ratingFloor: 500 }),
            rapid: expect.objectContaining({ initialRating: 1500, ratingFloor: 500 }),
            classical: expect.objectContaining({ initialRating: 1500, ratingFloor: 500 }),
        });
    });

    it('rejects whitespace identity and malformed public contacts while trimming valid profile updates', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const token = authorization(owner);

        const whitespace = await request(app)
            .post('/api/v1/clubs')
            .set('Authorization', token)
            .send({ name: '   ', federation: 'TEST' })
            .expect(400);
        expect(whitespace.body.errors).toContainEqual({ field: 'name', message: 'Club name is required.' });

        const invalidContacts = await request(app)
            .patch(`/api/v1/clubs/${club.id}`)
            .set('Authorization', token)
            .send({
                settings: {
                    contacts: {
                        website: 'javascript:alert(1)',
                        email: 'not-an-email',
                    },
                },
            })
            .expect(400);
        expect(invalidContacts.body.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'settings.contacts.website' }),
            { field: 'settings.contacts.email', message: 'Enter a valid email address.' },
        ]));

        const updated = await request(app)
            .patch(`/api/v1/clubs/${club.id}`)
            .set('Authorization', token)
            .send({
                name: '  Trimmed Club Name  ',
                federation: '  FIDE  ',
                description: '  Weekly rated play  ',
                contactInfo: '  Contact the secretary  ',
            })
            .expect(200);
        expect(updated.body.club).toMatchObject({
            name: 'Trimmed Club Name',
            federation: 'FIDE',
            description: 'Weekly rated play',
            contact_info: 'Contact the secretary',
        });
    });

    it('stores independent starting ratings in both player projections and authoritative rating state', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const token = authorization(owner);

        const single = await request(app)
            .post(`/api/v1/clubs/${club.id}/players`)
            .set('Authorization', token)
            .send({
                name: 'Category Rated Player',
                startRatings: { blitz: 1625, rapid: 1725, classical: 1825 },
            })
            .expect(201);

        expect(single.body.player).toMatchObject({
            rating: 1625,
            start_rating: 1625,
            blitz_rating: 1625,
            rapid_rating: 1725,
            classical_rating: 1825,
        });
        const singleState = await db.query(
            `SELECT category, start_rating, current_rating
             FROM player_rating_state
             WHERE club_id = $1 AND player_id = $2
             ORDER BY category`,
            [club.id, single.body.player.id]
        );
        expect(singleState.rows).toEqual([
            { category: 'blitz', start_rating: 1625, current_rating: 1625 },
            { category: 'classical', start_rating: 1825, current_rating: 1825 },
            { category: 'rapid', start_rating: 1725, current_rating: 1725 },
        ]);

        const bulk = await request(app)
            .post(`/api/v1/clubs/${club.id}/players/bulk`)
            .set('Authorization', token)
            .send({
                players: [
                    { name: 'Bulk Category Player', startRatings: { blitz: 1400, rapid: 1500, classical: 1600 } },
                    { name: 'Legacy Compatible Player', rating: 1750 },
                ],
            })
            .expect(201);
        expect(bulk.body.players).toHaveLength(2);

        const bulkState = await db.query(
            `SELECT player_id, category, start_rating, current_rating
             FROM player_rating_state
             WHERE club_id = $1 AND player_id = ANY($2::TEXT[])
             ORDER BY player_id, category`,
            [club.id, bulk.body.players.map(player => player.id)]
        );
        const stateByPlayer = Object.fromEntries(bulk.body.players.map(player => [
            player.id,
            bulkState.rows.filter(row => row.player_id === player.id),
        ]));
        expect(stateByPlayer[bulk.body.players[0].id].map(({ category, start_rating, current_rating }) => ({ category, start_rating, current_rating }))).toEqual([
            { category: 'blitz', start_rating: 1400, current_rating: 1400 },
            { category: 'classical', start_rating: 1600, current_rating: 1600 },
            { category: 'rapid', start_rating: 1500, current_rating: 1500 },
        ]);
        expect(stateByPlayer[bulk.body.players[1].id].every(row => row.start_rating === 1750 && row.current_rating === 1750)).toBe(true);
    });

    it('rejects a category starting rating below the club floor without creating the player', async () => {
        const owner = await createUser();
        const club = await createClub(owner);

        const response = await request(app)
            .post(`/api/v1/clubs/${club.id}/players`)
            .set('Authorization', authorization(owner))
            .send({ name: 'Below Floor', startRatings: { rapid: 400 } })
            .expect(400);

        expect(response.body).toMatchObject({ code: 'START_RATING_BELOW_FLOOR' });
        const stored = await db.query(
            'SELECT id FROM players WHERE club_id = $1 AND name = $2',
            [club.id, 'Below Floor']
        );
        expect(stored.rows).toHaveLength(0);
    });

    it('keeps visibility, public leaderboard, structured settings, and ratings independent', async () => {
        const owner = await createUser();
        const club = await createClub(owner, { isPublic: true });

        const response = await request(app)
            .patch(`/api/v1/clubs/${club.id}`)
            .set('Authorization', authorization(owner))
            .send({
                visibility: 'public',
                publicLeaderboard: false,
                settings: {
                    contacts: { website: 'https://example.test', email: 'club@example.test' },
                    affiliation: 'Regional Federation',
                    presentation: { primaryColor: '#123456', locale: 'en-US' },
                    notifications: { emailEnabled: true, membershipEvents: true },
                },
                ratingSettings,
            })
            .expect(200);

        expect(response.body.club).toMatchObject({
            visibility: 'public',
            public_leaderboard: false,
            settings_json: {
                affiliation: 'Regional Federation',
                contacts: { website: 'https://example.test', email: 'club@example.test' },
            },
            rating_settings: { blitz: ratingSettings.blitz },
        });
        const createdPlayer = await request(app)
            .post(`/api/v1/clubs/${club.id}/players`)
            .set('Authorization', authorization(owner))
            .send({ name: 'Configured Initial Ratings' })
            .expect(201);
        expect(createdPlayer.body.player).toMatchObject({
            blitz_rating: 1600,
            rapid_rating: 1500,
            classical_rating: 1500,
        });
        await request(app).get(`/api/v1/public/clubs/${club.id}/leaderboard`).expect(404);

        const player = await createPlayer(club);
        await request(app).get(`/api/v1/public/clubs/${club.id}/players/${player.public_id}`).expect(200);
    });

    it('allows only the owner to change club settings', async () => {
        const owner = await createUser();
        const admin = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, admin, 'admin');

        await request(app)
            .patch(`/api/v1/clubs/${club.id}`)
            .set('Authorization', authorization(admin))
            .send({ description: 'Forbidden' })
            .expect(403);
        await request(app)
            .post(`/api/v1/clubs/${club.id}/archive`)
            .set('Authorization', authorization(admin))
            .send({})
            .expect(403);
        await request(app)
            .post(`/api/v1/clubs/${club.id}/ownership`)
            .set('Authorization', authorization(admin))
            .send({ newOwnerUserId: admin.id, previousOwnerRole: 'member' })
            .expect(403);
        await request(app)
            .delete(`/api/v1/clubs/${club.id}`)
            .set('Authorization', authorization(admin))
            .send({})
            .expect(403);
        await request(app)
            .patch(`/api/v1/clubs/${club.id}`)
            .set('Authorization', authorization(owner))
            .send({ description: 'Owner managed' })
            .expect(200);
    });

    it('lets an admin update public presentation fields without changing owner-only governance', async () => {
        const owner = await createUser();
        const admin = await createUser();
        const club = await createClub(owner, { isPublic: true });
        await addClubMember(club, admin, 'admin');
        const token = authorization(admin);

        const response = await request(app)
            .patch(`/api/v1/clubs/${club.id}/presentation`)
            .set('Authorization', token)
            .send({
                description: 'Weekly rated play for the whole city.',
                contactInfo: 'Doors open at 6:30 PM.',
                settings: {
                    contacts: {
                        website: 'https://club.example.test',
                        email: 'hello@club.example.test',
                        phone: '+1 555 0100',
                        address: '42 Knight Street',
                    },
                    affiliation: 'City Chess Association',
                    presentation: { primaryColor: '#123456' },
                },
            })
            .expect(200);

        expect(response.body.club).toMatchObject({
            description: 'Weekly rated play for the whole city.',
            settings_json: {
                contacts: { address: '42 Knight Street', email: 'hello@club.example.test' },
                affiliation: 'City Chess Association',
            },
        });

        await request(app)
            .patch(`/api/v1/clubs/${club.id}/presentation`)
            .set('Authorization', token)
            .send({ settings: { notifications: { emailEnabled: true } } })
            .expect(400);
        await request(app)
            .patch(`/api/v1/clubs/${club.id}`)
            .set('Authorization', token)
            .send({ visibility: 'private' })
            .expect(403);

        const publicResponse = await request(app).get(`/api/v1/clubs/${club.id}`).expect(200);
        expect(publicResponse.body.club).toMatchObject({
            contacts: { address: '42 Knight Street', email: 'hello@club.example.test' },
            affiliation: 'City Chess Association',
            metrics: {
                memberCount: 2,
                rosterPlayers: 0,
                totalGames: 0,
                averageRatings: {},
            },
        });
    });

    it('rejects invalid structured rating settings before they reach the database', async () => {
        const owner = await createUser();
        const club = await createClub(owner);

        const response = await request(app)
            .patch(`/api/v1/clubs/${club.id}`)
            .set('Authorization', authorization(owner))
            .send({
                ratingSettings: {
                    blitz: {
                        initialRating: 1200,
                        ratingFloor: 1500,
                        establishedKFactor: 32,
                        provisionalKFactor: 40,
                        provisionalGames: 10,
                    },
                },
            })
            .expect(400);

        expect(response.body.error).toBe('Validation failed.');
    });

    it('transfers ownership atomically and records an audit event', async () => {
        const owner = await createUser();
        const nextOwner = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, nextOwner, 'admin');

        await request(app)
            .post(`/api/v1/clubs/${club.id}/ownership`)
            .set('Authorization', authorization(owner))
            .send({ newOwnerUserId: nextOwner.id, previousOwnerRole: 'member' })
            .expect(200);

        const updatedClub = await db.query('SELECT owner_id FROM clubs WHERE id = $1', [club.id]);
        const roles = await db.query(
            'SELECT user_id, role FROM user_clubs WHERE club_id = $1 ORDER BY user_id',
            [club.id]
        );
        const audit = await db.query(
            `SELECT actor_user_id, event_type, payload_json FROM club_audit_events
             WHERE club_id = $1 AND event_type = 'club.ownership_transferred'`,
            [club.id]
        );
        expect(updatedClub.first.owner_id).toBe(nextOwner.id);
        expect(Object.fromEntries(roles.rows.map(row => [row.user_id, row.role]))).toEqual({
            [owner.id]: 'member',
            [nextOwner.id]: 'owner',
        });
        expect(audit.first).toMatchObject({
            actor_user_id: owner.id,
            event_type: 'club.ownership_transferred',
            payload_json: { newOwnerUserId: nextOwner.id, previousOwnerRole: 'member' },
        });

        await request(app)
            .patch(`/api/v1/clubs/${club.id}`)
            .set('Authorization', authorization(owner))
            .send({ description: 'Former owner attempt' })
            .expect(403);
        await request(app)
            .patch(`/api/v1/clubs/${club.id}`)
            .set('Authorization', authorization(nextOwner))
            .send({ description: 'New owner managed' })
            .expect(200);
    });

    it('serializes competing ownership transfers so only one succeeds', async () => {
        const owner = await createUser();
        const candidateA = await createUser();
        const candidateB = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, candidateA);
        await addClubMember(club, candidateB);
        const token = authorization(owner);

        const responses = await Promise.all([
            request(app).post(`/api/v1/clubs/${club.id}/ownership`).set('Authorization', token)
                .send({ newOwnerUserId: candidateA.id, previousOwnerRole: 'member' }),
            request(app).post(`/api/v1/clubs/${club.id}/ownership`).set('Authorization', token)
                .send({ newOwnerUserId: candidateB.id, previousOwnerRole: 'member' }),
        ]);

        expect(responses.map(response => response.status).filter(status => status === 200)).toHaveLength(1);
        expect(responses.map(response => response.status).filter(status => status === 403 || status === 409)).toHaveLength(1);
        const owners = await db.query(
            `SELECT COUNT(*)::int AS count FROM user_clubs WHERE club_id = $1 AND role = 'owner'`,
            [club.id]
        );
        expect(owners.first.count).toBe(1);
    });

    it('archives and restores without losing chess history', async () => {
        const owner = await createUser();
        const outsider = await createUser();
        const club = await createClub(owner, { isPublic: true });
        const white = await createPlayer(club);
        const black = await createPlayer(club);
        const match = await createMatch(club, white, black);
        await createRatingHistory(white, match);
        const token = authorization(owner);

        await request(app)
            .post(`/api/v1/clubs/${club.id}/archive`)
            .set('Authorization', token)
            .send({ reason: 'Season ended' })
            .expect(200);
        await request(app)
            .post(`/api/v1/clubs/${club.id}/players`)
            .set('Authorization', token)
            .send({ name: 'Blocked Player' })
            .expect(409);
        await request(app)
            .post(`/api/v1/clubs/${club.id}/join`)
            .set('Authorization', authorization(outsider))
            .send({})
            .expect(409);
        await request(app).get(`/api/v1/public/clubs/${club.id}/players/${white.id}`).expect(404);

        const history = await db.query(
            `SELECT
                (SELECT COUNT(*)::int FROM matches WHERE club_id = $1) AS matches,
                (SELECT COUNT(*)::int FROM rating_history WHERE match_id = $2) AS ratings`,
            [club.id, match.id]
        );
        expect(history.first).toEqual({ matches: 1, ratings: 1 });

        await request(app)
            .post(`/api/v1/clubs/${club.id}/restore`)
            .set('Authorization', token)
            .send({})
            .expect(200);
        await request(app)
            .post(`/api/v1/clubs/${club.id}/players`)
            .set('Authorization', token)
            .send({ name: 'Restored Player' })
            .expect(201);
    });

    it('soft-deletes a club while preserving memberships, matches, and ratings', async () => {
        const owner = await createUser();
        const club = await createClub(owner, { isPublic: true });
        const white = await createPlayer(club);
        const black = await createPlayer(club);
        const match = await createMatch(club, white, black);
        await createRatingHistory(white, match);

        await request(app)
            .delete(`/api/v1/clubs/${club.id}`)
            .set('Authorization', authorization(owner))
            .send({ reason: 'Club closed' })
            .expect(200);

        const retained = await db.query(
            `SELECT
                (SELECT status FROM clubs WHERE id = $1) AS status,
                (SELECT COUNT(*)::int FROM user_clubs WHERE club_id = $1) AS memberships,
                (SELECT COUNT(*)::int FROM matches WHERE club_id = $1) AS matches,
                (SELECT COUNT(*)::int FROM rating_history WHERE match_id = $2) AS ratings`,
            [club.id, match.id]
        );
        expect(retained.first).toEqual({ status: 'deleted', memberships: 1, matches: 1, ratings: 1 });
        await request(app).get(`/api/v1/clubs/${club.id}`).expect(404);
        await request(app).get(`/api/v1/public/clubs/${club.id}/leaderboard`).expect(404);
    });

    it('reapplies the club-management migration safely', async () => {
        const owner = await createUser();
        const club = await createClub(owner);

        await db.query(CLUB_MANAGEMENT_SQL);

        const settings = await db.query(
            'SELECT COUNT(*)::int AS count FROM club_rating_settings WHERE club_id = $1',
            [club.id]
        );
        expect(settings.first.count).toBe(3);
    });
});
