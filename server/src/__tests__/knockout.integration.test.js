import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { authorization, createClub, createPlayer, createUser } from '../test/factories.js';
import { knockoutPairings } from '../services/TournamentPairingService.js';

describe('single elimination tournaments', () => {
    it('does not pair an ineligible player in a drawn-game replay', () => {
        expect(() => knockoutPairings([{ id: 'a', name: 'A' }], [{
            whitePlayerId: 'a', blackPlayerId: 'b', result: 'draw', roundNumber: 1, board: 1, bracketSlot: 1, isPlayoff: false,
        }], 2)).toThrow(/no longer eligible/);
    });
    it.each([2, 3, 5, 6, 8, 12])('advances %i players exactly once through a stable bracket', count => {
        const players = Array.from({ length: count }, (_, seed) => ({ id: `p${seed}`, name: `P${seed}`, seed }));
        const history = [];
        let round = 1;
        let matches = 0;
        for (;;) {
            const games = knockoutPairings(players, history, round);
            if (!games.length) break;
            const ids = games.flatMap(game => [game.whitePlayerId, game.blackPlayerId].filter(Boolean));
            expect(new Set(ids).size).toBe(ids.length);
            expect(round).toBeLessThanOrEqual(Math.ceil(Math.log2(count)));
            if (round > 1) expect(games.some(game => game.isBye)).toBe(false);
            matches += games.filter(game => !game.isBye).length;
            history.push(...games.map((game, index) => ({ ...game, roundNumber: round, board: index + 1, result: game.isBye ? 'bye' : 'white' })));
            round += 1;
        }
        expect(matches).toBe(count - 1);
    });

    it('preserves draws and rated replays, freezes the roster and protects downstream results', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const token = authorization(owner);
        const players = await Promise.all(Array.from({ length: 3 }, () => createPlayer(club)));
        const created = await request(app).post(`/api/v1/clubs/${club.id}/tournaments`).set('Authorization', token).send({
            name: 'Club Knockout', type: 'knockout', startDate: '2026-09-01T12:00:00.000Z', ratingCategory: 'rapid', isRated: true,
        }).expect(201);
        const base = `/api/v1/clubs/${club.id}/tournaments/${created.body.tournament.id}`;
        for (const player of players) await request(app).post(`${base}/players`).set('Authorization', token).send({ playerId: player.id }).expect(201);
        await request(app).patch(`${base}/status`).set('Authorization', token).send({ status: 'active' }).expect(200);
        const generate = () => request(app).post(`${base}/rounds`).set('Authorization', token).send({});
        const record = (pairing, result, day) => request(app).post(`${base}/pairings/${pairing.id}/result`).set('Authorization', token)
            .send({ result, playedAt: `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z` });
        const first = (await generate().expect(201)).body.pairings;
        expect(first.filter(game => game.isBye)).toHaveLength(1);
        const game = first.find(value => !value.isBye);
        await request(app).patch(`${base}/players/${players[0].id}/withdraw`).set('Authorization', token).send({}).expect(409);
        const late = await createPlayer(club);
        await request(app).post(`${base}/players`).set('Authorization', token).send({ playerId: late.id }).expect(409);
        const drawn = await record(game, 'draw', 1).expect(201);
        await request(app).patch(`${base}/status`).set('Authorization', token).send({ status: 'completed' }).expect(409);
        const replay = (await generate().expect(201)).body.pairings;
        expect(replay).toHaveLength(1);
        expect(replay[0]).toMatchObject({ isPlayoff: true, whitePlayerId: game.blackPlayerId, blackPlayerId: game.whitePlayerId, ratingCategory: 'rapid' });
        await record(game, 'white', 1).expect(409);
        await request(app).delete(`/api/v1/clubs/${club.id}/matches/${drawn.body.match.id}`).set('Authorization', token).send({ reason: 'Cannot invalidate bracket' }).expect(409);
        await record(replay[0], 'draw', 2).expect(201);
        const replay2 = (await generate().expect(201)).body.pairings[0];
        expect(replay2.whitePlayerId).toBe(game.whitePlayerId);
        await record(replay2, 'white', 3).expect(201);
        const final = (await generate().expect(201)).body.pairings;
        expect(final).toHaveLength(1);
        expect(final[0].isPlayoff).toBe(false);
        expect([final[0].whitePlayerId, final[0].blackPlayerId]).toContain(first.find(value => value.isBye).whitePlayerId);
        await record(final[0], 'black', 4).expect(201);
        await generate().expect(409);
        const detail = (await request(app).get(base).set('Authorization', token).expect(200)).body;
        expect(detail.knockout.championId).toBe(final[0].blackPlayerId);
        expect(detail.standings[0]).toMatchObject({ playerId: final[0].blackPlayerId, rank: 1, knockoutStatus: 'Champion' });
        const matches = (await db.query('SELECT result, rating_category FROM matches WHERE tournament_id = $1 ORDER BY played_at', [created.body.tournament.id])).rows;
        expect(matches.map(match => match.result)).toEqual(['draw', 'draw', 'white', 'black']);
        expect(matches.every(match => match.rating_category === 'rapid')).toBe(true);
        await request(app).patch(`${base}/status`).set('Authorization', token).send({ status: 'completed' }).expect(200);
    });
});
