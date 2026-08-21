import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import {
    addClubMember,
    authorization,
    createClub,
    createPlayer,
    createUser,
} from '../test/factories.js';

describe('mutation endpoint permissions', () => {
    it('rejects an ordinary member across every admin mutation family', async () => {
        const owner = await createUser();
        const member = await createUser();
        const targetMember = await createUser();
        const club = await createClub(owner, { id: 'club_member_mutation_matrix' });
        await addClubMember(club, member, 'member');
        await addClubMember(club, targetMember, 'member');
        const token = authorization(member);
        const base = `/api/v1/clubs/${club.id}`;

        const mutationRequests = [
            ['update club', () => request(app).patch(base).send({ name: 'Forbidden Rename' })],
            ['create invite', () => request(app).post(`${base}/invites`).send({})],
            ['revoke invite', () => request(app).delete(`${base}/invites/inv_missing`)],
            ['approve join request', () => request(app).patch(`${base}/join-requests/cjr_missing/approve`).send({})],
            ['reject join request', () => request(app).patch(`${base}/join-requests/cjr_missing/reject`).send({})],
            ['assign admin', () => request(app).patch(`${base}/members/${targetMember.id}/role`).send({ role: 'admin' })],
            ['remove member', () => request(app).delete(`${base}/members/${targetMember.id}`)],
            ['create player', () => request(app).post(`${base}/players`).send({ name: 'Forbidden Player' })],
            ['bulk create players', () => request(app).post(`${base}/players/bulk`).send({ players: [{ name: 'Forbidden Player' }] })],
            ['approve player link', () => request(app).patch(`${base}/players/links/plink_missing/approve`).send({})],
            ['reject player link', () => request(app).patch(`${base}/players/links/plink_missing/reject`).send({})],
            ['edit another player', () => request(app).patch(`${base}/players/player_missing`).send({ bio: 'Forbidden' })],
            ['delete player', () => request(app).delete(`${base}/players/player_missing`)],
            ['unlink player', () => request(app).delete(`${base}/players/player_missing/unlink`)],
            ['create match', () => request(app).post(`${base}/matches`).send({})],
            ['edit match', () => request(app).patch(`${base}/matches/match_missing`).send({ result: 'draw' })],
            ['void match', () => request(app).post(`${base}/matches/match_missing/void`).send({ reason: 'Forbidden' })],
            ['delete match', () => request(app).delete(`${base}/matches/match_missing`)],
            ['create tournament', () => request(app).post(`${base}/tournaments`).send({})],
            ['edit tournament', () => request(app).patch(`${base}/tournaments/tour_missing`).send({ name: 'Forbidden' })],
            ['change tournament status', () => request(app).patch(`${base}/tournaments/tour_missing/status`).send({ status: 'active' })],
            ['delete tournament', () => request(app).delete(`${base}/tournaments/tour_missing`)],
            ['add tournament player', () => request(app).post(`${base}/tournaments/tour_missing/players`).send({ playerId: 'player_missing' })],
            ['remove tournament player', () => request(app).delete(`${base}/tournaments/tour_missing/players/player_missing`)],
        ];

        for (const [name, makeRequest] of mutationRequests) {
            const response = await makeRequest()
                .set('Authorization', token)
                .expect(403);
            expect(response.body.error, name).toMatch(
                /You do not have permission|You can only modify your own player profile/,
            );
        }
    });

    it('allows a delegated club admin to manage club chess data', async () => {
        const owner = await createUser();
        const admin = await createUser({ role: 'member' });
        const club = await createClub(owner, { id: 'club_delegated_mutations' });
        await addClubMember(club, admin, 'admin');
        const token = authorization(admin);
        const base = `/api/v1/clubs/${club.id}`;

        await request(app)
            .patch(base)
            .set('Authorization', token)
            .send({ description: 'Managed by a delegated admin' })
            .expect(403);

        const white = await createPlayer(club, { id: 'player_delegated_white' });
        const black = await createPlayer(club, { id: 'player_delegated_black' });
        const matchResponse = await request(app)
            .post(`${base}/matches`)
            .set('Authorization', token)
            .send({
                whitePlayerId: white.id,
                blackPlayerId: black.id,
                result: 'white',
                isRated: false,
                ratingCategory: 'rapid',
                playedAt: '2026-05-01T18:00:00.000Z',
            })
            .expect(201);
        expect(matchResponse.body.match.club_id).toBe(club.id);

        const tournamentResponse = await request(app)
            .post(`${base}/tournaments`)
            .set('Authorization', token)
            .send({
                name: 'Delegated Admin Tournament',
                type: 'round_robin',
                startDate: '2026-06-01T12:00:00.000Z',
            })
            .expect(201);
        expect(tournamentResponse.body.tournament.club_id).toBe(club.id);
    });

    it('rejects guests and non-members before protected route-group data is returned', async () => {
        const owner = await createUser();
        const outsider = await createUser();
        const club = await createClub(owner, { id: 'club_route_group_guards' });
        const paths = [
            `/api/v1/clubs/${club.id}/players`,
            `/api/v1/clubs/${club.id}/matches`,
            `/api/v1/clubs/${club.id}/tournaments`,
            `/api/v1/clubs/${club.id}/leaderboard`,
        ];

        for (const path of paths) {
            await request(app).get(path).expect(401);
            const response = await request(app)
                .get(path)
                .set('Authorization', authorization(outsider))
                .expect(403);
            expect(response.body).toEqual({ error: 'You are not a member of this club.' });
        }
    });
});
