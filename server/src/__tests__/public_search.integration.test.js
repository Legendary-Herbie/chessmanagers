import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { PUBLIC_SEARCH_BOUNDARY_SQL } from '../database/migrations/1700000000008_public_search_boundary.js';
import {
    addClubMember, authorization, createClub, createMatch, createPlayer, createUser,
} from '../test/factories.js';

describe('public boundary and scoped search', () => {
    it('returns minimal private presentation while every public chess resource stays indistinguishable', async () => {
        const owner = await createUser();
        const admin = await createUser();
        const member = await createUser();
        const outsider = await createUser();
        const club = await createClub(owner, {
            isPublic: false, description: 'Private description', settings: { internalFlag: true },
        });
        await addClubMember(club, admin, 'admin');
        await addClubMember(club, member, 'member');
        const player = await createPlayer(club);

        for (const viewer of [null, outsider]) {
            const call = request(app).get(`/api/v1/clubs/${club.id}`);
            if (viewer) call.set('Authorization', authorization(viewer));
            const response = await call.expect(200);
            expect(response.body.club).toMatchObject({
                id: club.id, name: club.name, visibility: 'private', is_member: false,
            });
            expect(response.body.club).not.toHaveProperty('description');
            expect(response.body.club).not.toHaveProperty('settings_json');
        }

        for (const viewer of [member, admin, owner]) {
            const response = await request(app).get(`/api/v1/clubs/${club.id}`)
                .set('Authorization', authorization(viewer)).expect(200);
            expect(response.body.club.is_member).toBe(true);
            expect(response.body.club.description).toBe('Private description');
        }

        for (const viewer of [null, outsider, member, admin, owner]) {
            const call = request(app).get(`/api/v1/public/clubs/${club.id}/players/${player.public_id}`);
            if (viewer) call.set('Authorization', authorization(viewer));
            await call.expect(404, { error: 'Resource not found.' });
        }
    });

    it('keeps public discovery visibility-filtered and paginated', async () => {
        const owner = await createUser();
        await createClub(owner, { name: 'Visible Knights', isPublic: true });
        await createClub(owner, { name: 'Visible Bishops', isPublic: true });
        await createClub(owner, { name: 'Hidden Knights', isPublic: false });

        const response = await request(app).get('/api/v1/clubs?q=Knights&limit=1&offset=0').expect(200);
        expect(response.body.total).toBe(1);
        expect(response.body.clubs.map(club => club.name)).toEqual(['Visible Knights']);
        expect(response.body.clubs[0]).not.toHaveProperty('owner_id');
        expect(response.body.clubs[0]).not.toHaveProperty('settings_json');
    });

    it('searches players and matches only inside the authorized club with validated pagination', async () => {
        const ownerA = await createUser();
        const ownerB = await createUser();
        const clubA = await createClub(ownerA);
        const clubB = await createClub(ownerB);
        const alpha = await createPlayer(clubA, { name: 'Alpha Knight' });
        const beta = await createPlayer(clubA, { name: 'Beta Bishop' });
        const other = await createPlayer(clubB, { name: 'Alpha Other Club' });
        const otherB = await createPlayer(clubB, { name: 'Other Opponent' });
        await createMatch(clubA, alpha, beta, { notes: 'Championship board' });
        await createMatch(clubB, other, otherB, { notes: 'Championship board' });

        const players = await request(app)
            .get(`/api/v1/clubs/${clubA.id}/players?q=Alpha&limit=10&offset=0`)
            .set('Authorization', authorization(ownerA)).expect(200);
        expect(players.body.total).toBe(1);
        expect(players.body.players.map(player => player.id)).toEqual([alpha.id]);

        const matches = await request(app)
            .get(`/api/v1/clubs/${clubA.id}/matches?q=Championship&limit=10&offset=0`)
            .set('Authorization', authorization(ownerA)).expect(200);
        expect(matches.body.total).toBe(1);
        expect(matches.body.matches[0].clubId).toBe(clubA.id);

        await request(app).get(`/api/v1/clubs/${clubA.id}/players?q=x&limit=101`)
            .set('Authorization', authorization(ownerA)).expect(400);
        await request(app).get(`/api/v1/clubs/${clubB.id}/matches?q=Championship`)
            .set('Authorization', authorization(ownerA)).expect(403);

        await db.query(PUBLIC_SEARCH_BOUNDARY_SQL);
        const publicId = await db.query('SELECT public_id FROM players WHERE id = $1', [alpha.id]);
        expect(publicId.first.public_id).toMatch(/^public_player_/);
    });

    it('aggregates the full active roster independently for every rating category', async () => {
        const owner = await createUser();
        const outsider = await createUser();
        const club = await createClub(owner);
        const first = await createPlayer(club, { rating: 1400 });
        const second = await createPlayer(club, { rating: 1600 });

        await db.query(
            `UPDATE player_rating_state
             SET current_rating = CASE
                WHEN player_id = $2 AND category = 'blitz' THEN 1800
                WHEN player_id = $2 AND category = 'rapid' THEN 1700
                WHEN player_id = $2 AND category = 'classical' THEN 1600
                WHEN player_id = $3 AND category = 'blitz' THEN 1600
                WHEN player_id = $3 AND category = 'rapid' THEN 1500
                WHEN player_id = $3 AND category = 'classical' THEN 1400
                ELSE current_rating
             END
             WHERE club_id = $1 AND player_id IN ($2, $3)`,
            [club.id, first.id, second.id]
        );
        await db.query('UPDATE players SET games = 1 WHERE id = $1', [first.id]);

        const response = await request(app)
            .get(`/api/v1/clubs/${club.id}/players/summary`)
            .set('Authorization', authorization(owner)).expect(200);

        expect(response.body.summary).toEqual({
            totalPlayers: 2,
            activePlayers: 1,
            averageRatings: { blitz: 1700, rapid: 1600, classical: 1500 },
        });

        await request(app).get(`/api/v1/clubs/${club.id}/players/summary`)
            .set('Authorization', authorization(outsider)).expect(403);
    });
});
