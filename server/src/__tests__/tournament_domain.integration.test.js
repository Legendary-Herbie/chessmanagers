import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import {
    authorization,
    createClub,
    createPlayer,
    createTournament,
    createUser,
} from '../test/factories.js';

async function registerPlayers(base, token, players) {
    for (const player of players) {
        await request(app).post(`${base}/players`).set('Authorization', token)
            .send({ playerId: player.id }).expect(201);
    }
}

describe('tournament domain lifecycle', () => {
    it('accepts only Swiss and Round-Robin tournaments and provides searchable pagination', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const token = authorization(owner);
        const base = `/api/v1/clubs/${club.id}/tournaments`;
        const payload = {
            name: 'Autumn Swiss',
            type: 'swiss',
            startDate: '2026-09-01T18:00:00.000Z',
            ratingCategory: 'rapid',
            isRated: false,
        };

        await request(app).post(base).set('Authorization', token)
            .send({ ...payload, type: 'knockout' }).expect(400);
        const created = await request(app).post(base).set('Authorization', token)
            .send(payload).expect(201);
        expect(created.body.tournament).toMatchObject({
            club_id: club.id,
            type: 'swiss',
            rating_category: 'rapid',
            is_rated: false,
        });
        const list = await request(app).get(`${base}?q=Autumn&limit=1&offset=0`)
            .set('Authorization', token).expect(200);
        expect(list.body).toMatchObject({ total: 1, limit: 1, offset: 0 });
        expect(list.body.tournaments[0].name).toBe('Autumn Swiss');
    });

    it('runs Swiss rounds atomically with edits, withdrawals, and late registration', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const players = await Promise.all([
            createPlayer(club, { name: 'Alpha', rating: 1800 }),
            createPlayer(club, { name: 'Bravo', rating: 1700 }),
            createPlayer(club, { name: 'Charlie', rating: 1600 }),
            createPlayer(club, { name: 'Delta', rating: 1500 }),
        ]);
        const late = await createPlayer(club, { name: 'Echo', rating: 1550 });
        const tournament = await createTournament(club, { type: 'swiss', status: 'active' });
        const token = authorization(owner);
        const base = `/api/v1/clubs/${club.id}/tournaments/${tournament.id}`;
        await registerPlayers(base, token, players);

        const first = await request(app).post(`${base}/rounds`).set('Authorization', token)
            .send({}).expect(201);
        expect(first.body.pairings).toHaveLength(2);
        expect(first.body.pairings.every(pairing => !pairing.isBye)).toBe(true);
        const retry = await request(app).post(`${base}/rounds`).set('Authorization', token)
            .send({}).expect(200);
        expect(retry.body).toMatchObject({ alreadyGenerated: true });
        expect(retry.body.round.id).toBe(first.body.round.id);

        for (const [index, pairing] of first.body.pairings.entries()) {
            const response = await request(app)
                .post(`${base}/pairings/${pairing.id}/result`)
                .set('Authorization', token)
                .send({
                    result: index === 0 ? 'white' : 'draw',
                    playedAt: `2026-09-01T1${index}:00:00.000Z`,
                }).expect(201);
            expect(response.body.match.tournament_id).toBe(tournament.id);
        }
        const persistedRound = await db.query(
            'SELECT status FROM tournament_rounds WHERE id = $1', [first.body.round.id]
        );
        expect(persistedRound.first.status).toBe('completed');
        expect((await db.query(
            `SELECT COUNT(*)::INTEGER AS count FROM matches
             WHERE tournament_id = $1 AND status = 'active'`, [tournament.id]
        )).first.count).toBe(2);

        const editedPairing = first.body.pairings[0];
        const edited = await request(app)
            .post(`${base}/pairings/${editedPairing.id}/result`)
            .set('Authorization', token)
            .send({ result: 'black', playedAt: '2026-09-01T10:00:00.000Z' })
            .expect(200);
        expect(edited.body.ratingStatus).toBe('recalculation_pending');
        expect((await db.query(
            'SELECT result, match_id, status FROM tournament_pairings WHERE id = $1',
            [editedPairing.id]
        )).first).toMatchObject({ result: 'black', status: 'completed' });

        const added = await request(app).post(`${base}/players`).set('Authorization', token)
            .send({ playerId: late.id }).expect(201);
        expect(added.body.entry.registration_round).toBe(2);
        await request(app).patch(`${base}/players/${players[3].id}/withdraw`)
            .set('Authorization', token).send({}).expect(200);
        const second = await request(app).post(`${base}/rounds`).set('Authorization', token)
            .send({}).expect(201);
        const pairedIds = new Set(second.body.pairings.flatMap(pairing => (
            [pairing.whitePlayerId, pairing.blackPlayerId].filter(Boolean)
        )));
        expect(pairedIds.has(late.id)).toBe(true);
        expect(pairedIds.has(players[3].id)).toBe(false);

        const detail = await request(app).get(base).set('Authorization', token).expect(200);
        expect(detail.body.rounds).toHaveLength(2);
        expect(detail.body.standings[0]).toHaveProperty('buchholz');
        expect(detail.body.participants.find(player => player.id === players[3].id).status)
            .toBe('withdrawn');
    });

    it('uses Berger pairings, stores byes without matches, and enforces club scope', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const otherClub = await createClub(owner);
        const players = await Promise.all([
            createPlayer(club, { name: 'One' }),
            createPlayer(club, { name: 'Two' }),
            createPlayer(club, { name: 'Three' }),
        ]);
        const tournament = await createTournament(club, {
            type: 'round_robin', status: 'active', isRated: false,
        });
        const token = authorization(owner);
        const base = `/api/v1/clubs/${club.id}/tournaments/${tournament.id}`;
        await registerPlayers(base, token, players);

        await request(app).get(`/api/v1/clubs/${otherClub.id}/tournaments/${tournament.id}`)
            .set('Authorization', token).expect(404);
        const round = await request(app).post(`${base}/rounds`).set('Authorization', token)
            .send({}).expect(201);
        expect(round.body.pairings.filter(pairing => pairing.isBye)).toHaveLength(1);
        expect(round.body.pairings.filter(pairing => !pairing.isBye)).toHaveLength(1);
        const bye = round.body.pairings.find(pairing => pairing.isBye);
        const game = round.body.pairings.find(pairing => !pairing.isBye);
        await request(app).post(`${base}/pairings/${bye.id}/result`)
            .set('Authorization', token)
            .send({ result: 'white', playedAt: '2026-09-02T18:00:00.000Z' })
            .expect(400);
        expect((await db.query(
            'SELECT COUNT(*)::INTEGER AS count FROM matches WHERE tournament_id = $1',
            [tournament.id]
        )).first.count).toBe(0);
        const recorded = await request(app).post(`${base}/pairings/${game.id}/result`)
            .set('Authorization', token)
            .send({ result: 'draw', playedAt: '2026-09-02T18:30:00.000Z' })
            .expect(201);
        expect(recorded.body.ratingStatus).toBe('unrated');
        expect((await db.query(
            'SELECT COUNT(*)::INTEGER AS count FROM rating_history WHERE match_id = $1',
            [recorded.body.match.id]
        )).first.count).toBe(0);
        expect((await db.query(
            `SELECT bye_count FROM tournament_players
             WHERE tournament_id = $1 AND player_id = $2`,
            [tournament.id, bye.whitePlayerId]
        )).first.bye_count).toBe(1);
    });

    it('rolls the match back if pairing persistence fails midway', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const players = await Promise.all([createPlayer(club), createPlayer(club)]);
        const tournament = await createTournament(club, { type: 'swiss', status: 'active' });
        const token = authorization(owner);
        const base = `/api/v1/clubs/${club.id}/tournaments/${tournament.id}`;
        await registerPlayers(base, token, players);
        const round = await request(app).post(`${base}/rounds`).set('Authorization', token)
            .send({}).expect(201);
        const pairing = round.body.pairings[0];

        await db.query(`
            CREATE OR REPLACE FUNCTION fail_pairing_update_for_test() RETURNS TRIGGER AS $$
            BEGIN RAISE EXCEPTION 'forced pairing failure'; END;
            $$ LANGUAGE plpgsql;
            CREATE TRIGGER fail_pairing_update_for_test
            BEFORE UPDATE ON tournament_pairings
            FOR EACH ROW EXECUTE FUNCTION fail_pairing_update_for_test();
        `);
        try {
            await request(app).post(`${base}/pairings/${pairing.id}/result`)
                .set('Authorization', token)
                .send({ result: 'white', playedAt: '2026-09-03T18:00:00.000Z' })
                .expect(500);
        } finally {
            await db.query(`
                DROP TRIGGER IF EXISTS fail_pairing_update_for_test ON tournament_pairings;
                DROP FUNCTION IF EXISTS fail_pairing_update_for_test();
            `);
        }
        expect((await db.query(
            'SELECT COUNT(*)::INTEGER AS count FROM matches WHERE tournament_id = $1',
            [tournament.id]
        )).first.count).toBe(0);
        expect((await db.query(
            'SELECT status, result, match_id FROM tournament_pairings WHERE id = $1', [pairing.id]
        )).first).toEqual({ status: 'scheduled', result: null, match_id: null });
    });
});
