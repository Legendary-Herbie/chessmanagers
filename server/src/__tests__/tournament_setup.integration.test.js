import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { authorization, createClub, createPlayer, createTournament, createUser, addClubMember } from '../test/factories.js';

describe('combined tournament setup', () => {
    it('registers all active players from only the selected club', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const other = await createClub(owner);
        const tournament = await createTournament(club, { status: 'upcoming' });
        const active = await createPlayer(club);
        const inactive = await createPlayer(club);
        await createPlayer(other);
        await db.query("UPDATE players SET status = 'inactive' WHERE id = $1", [inactive.id]);
        const base = `/api/v1/clubs/${club.id}/tournaments/${tournament.id}`;
        await request(app).post(`${base}/setup`).set('Authorization', authorization(owner))
            .send({ playerIds: [], allActivePlayers: true, start: false }).expect(200);
        const detail = await request(app).get(base).set('Authorization', authorization(owner)).expect(200);
        expect(detail.body.participants.map(player => player.id)).toEqual([active.id]);
    });
    it('registers selected players and pairs round one in one operation', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const tournament = await createTournament(club, { status: 'upcoming' });
        const players = await Promise.all([1, 2, 3].map(() => createPlayer(club)));
        const base = `/api/v1/clubs/${club.id}/tournaments/${tournament.id}`;
        await request(app).post(`${base}/setup`).set('Authorization', authorization(owner))
            .send({ playerIds: players.map(player => player.id), start: true }).expect(200);
        const detail = await request(app).get(base).set('Authorization', authorization(owner)).expect(200);
        expect(detail.body.tournament).toMatchObject({ status: 'active', current_round: 1 });
        expect(detail.body.participants).toHaveLength(3);
        expect(detail.body.rounds).toHaveLength(1);
        await request(app).post(`${base}/setup`).set('Authorization', authorization(owner))
            .send({ playerIds: [], start: true }).expect(409);
        expect((await db.query('SELECT * FROM tournament_rounds WHERE tournament_id = $1', [tournament.id])).rows).toHaveLength(1);
    });

    it('rolls back all registrations and status when pairing cannot start', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const tournament = await createTournament(club, { status: 'upcoming' });
        const player = await createPlayer(club);
        const base = `/api/v1/clubs/${club.id}/tournaments/${tournament.id}`;
        await request(app).post(`${base}/setup`).set('Authorization', authorization(owner))
            .send({ playerIds: [player.id], start: true }).expect(409);
        expect((await db.query('SELECT * FROM tournament_players WHERE tournament_id = $1', [tournament.id])).rows).toHaveLength(0);
        expect((await db.query('SELECT status FROM tournaments WHERE id = $1', [tournament.id])).first.status).toBe('upcoming');
        await request(app).post(`${base}/setup`).set('Authorization', authorization(owner))
            .send({ playerIds: [player.id], start: false }).expect(200);
        expect((await db.query('SELECT * FROM tournament_players WHERE tournament_id = $1', [tournament.id])).rows).toHaveLength(1);
    });

    it('rejects member access and cross-club players without partial registration', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member);
        const other = await createClub(member);
        const tournament = await createTournament(club, { status: 'upcoming' });
        const players = [await createPlayer(club), await createPlayer(other)];
        const base = `/api/v1/clubs/${club.id}/tournaments/${tournament.id}/setup`;
        await request(app).post(base).set('Authorization', authorization(member)).send({ playerIds: [], start: false }).expect(403);
        await request(app).post(base).set('Authorization', authorization(owner)).send({ playerIds: players.map(player => player.id), start: false }).expect(404);
        expect((await db.query('SELECT * FROM tournament_players WHERE tournament_id = $1', [tournament.id])).rows).toHaveLength(0);
    });
});
