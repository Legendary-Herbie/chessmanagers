import { describe, expect, it, vi } from 'vitest';
import { pair as pairDutch } from '@echecs/swiss/dutch';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { generateNextRound } from '../services/TournamentService.js';
import { bergerSchedule } from '../services/TournamentPairingService.js';
import { authorization, createClub, createPlayer, createTournament, createUser } from '../test/factories.js';

vi.mock('@echecs/swiss/dutch', async importOriginal => {
    const actual = await importOriginal();
    return { ...actual, pair: vi.fn(actual.pair) };
});

async function setup() {
    const owner = await createUser();
    const club = await createClub(owner);
    const tournament = await createTournament(club, { status: 'active', type: 'round_robin', isRated: false });
    const players = await Promise.all(Array.from({ length: 4 }, () => createPlayer(club)));
    const token = authorization(owner);
    const base = `/api/v1/clubs/${club.id}/tournaments/${tournament.id}`;
    for (const player of players) await request(app).post(`${base}/players`).set('Authorization', token).send({ playerId: player.id }).expect(201);
    return { club, owner, tournament, players, token, base };
}

describe('tournament tenant integrity and lifecycle', () => {
    it('does not persist a Swiss round when the adapter returns incomplete output', async () => {
        const f = await setup();
        await db.query("UPDATE tournaments SET type = 'swiss' WHERE id = $1", [f.tournament.id]);
        pairDutch.mockReturnValueOnce({ pairings: [{ white: f.players[0].id, black: f.players[1].id }], byes: [] });
        expect((await request(app).post(`${f.base}/rounds`).set('Authorization', f.token).send({}).expect(409)).body.code).toBe('PAIRING_FAILED');
        expect((await db.query('SELECT current_round FROM tournaments WHERE id = $1', [f.tournament.id])).first.current_round).toBe(0);
        expect((await db.query('SELECT id FROM tournament_rounds WHERE tournament_id = $1', [f.tournament.id])).rows).toHaveLength(0);
        expect((await db.query('SELECT id FROM tournament_pairings WHERE tournament_id = $1', [f.tournament.id])).rows).toHaveLength(0);
    });
    it('rejects cross-club roster, round and pairing writes directly in PostgreSQL', async () => {
        const f = await setup();
        const other = await createClub(f.owner);
        const outsider = await createPlayer(other);
        await expect(db.query('INSERT INTO tournament_players (tournament_id, player_id, club_id) VALUES ($1,$2,$3)',
            [f.tournament.id, outsider.id, f.club.id])).rejects.toMatchObject({ code: '23503' });
        await expect(db.query('INSERT INTO tournament_players (tournament_id, player_id, club_id) VALUES ($1,$2,$3)',
            [f.tournament.id, outsider.id, other.id])).rejects.toMatchObject({ code: '23503' });
        await expect(db.query('UPDATE tournament_players SET player_id = $1 WHERE tournament_id = $2 AND player_id = $3',
            [outsider.id, f.tournament.id, f.players[0].id])).rejects.toMatchObject({ code: '23503' });
        await expect(db.query('INSERT INTO tournament_rounds (tournament_id, club_id, round_number) VALUES ($1,$2,1)',
            [f.tournament.id, other.id])).rejects.toMatchObject({ code: '23503' });
        const generated = await generateNextRound({ clubId: f.club.id, tournamentId: f.tournament.id });
        expect(generated.ok).toBe(true);
        for (const column of ['white_player_id', 'black_player_id']) {
            await expect(db.query(`UPDATE tournament_pairings SET ${column} = $1 WHERE id = $2`,
                [outsider.id, generated.pairings[0].id])).rejects.toMatchObject({ code: '23503' });
        }
        await expect(db.query(`INSERT INTO tournament_pairings (club_id,tournament_id,round_id,round_number,board,white_player_id,black_player_id,bracket_slot,rating_category)
            VALUES ($1,$2,$3,1,99,$4,$5,99,'rapid')`, [f.club.id, f.tournament.id, generated.round.id, f.players[0].id, outsider.id])).rejects.toMatchObject({ code: '23503' });
    });

    it('keeps one Berger table despite rating/name/seed changes and blocks late roster changes', async () => {
        const f = await setup();
        const expected = bergerSchedule(f.players.map((player, seed) => ({ ...player, seed })));
        for (let index = 0; index < expected.length; index++) {
            const response = await request(app).post(`${f.base}/rounds`).set('Authorization', f.token).send({}).expect(201);
            expect(response.body.pairings.map(({ whitePlayerId, blackPlayerId, isBye }) => ({ whitePlayerId, blackPlayerId, isBye }))).toEqual(expected[index]);
            for (const pairing of response.body.pairings) await request(app).post(`${f.base}/pairings/${pairing.id}/result`).set('Authorization', f.token)
                .send({ result: 'draw', playedAt: `2026-09-0${index + 1}T12:00:00Z` }).expect(201);
            await db.query('UPDATE tournament_players SET seed = 100 - seed WHERE tournament_id = $1', [f.tournament.id]);
            await db.query("UPDATE players SET name = 'Renamed ' || id, blitz_rating = 3000 WHERE club_id = $1", [f.club.id]);
        }
        const late = await createPlayer(f.club);
        expect((await request(app).post(`${f.base}/players`).set('Authorization', f.token).send({ playerId: late.id }).expect(409)).body.code).toBe('ROUND_ROBIN_ROSTER_FROZEN');
        expect((await request(app).patch(`${f.base}/players/${f.players[0].id}/withdraw`).set('Authorization', f.token).send({}).expect(409)).body.code).toBe('ROUND_ROBIN_ROSTER_FROZEN');
        expect((await request(app).post(`${f.base}/rounds`).set('Authorization', f.token).send({}).expect(409)).body.code).toBe('TOURNAMENT_COMPLETE');
    });

    it.each(['complete', 'register', 'withdraw'])('serializes %s against first-round generation', async operation => {
        const f = await setup();
        const late = await createPlayer(f.club);
        let ready;
        const locked = new Promise(resolve => { ready = resolve; });
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const generation = db.transaction(async trx => {
            const pid = (await trx.query('SELECT pg_backend_pid() AS pid')).first.pid;
            const result = await generateNextRound({ clubId: f.club.id, tournamentId: f.tournament.id, trx });
            expect(result.ok).toBe(true);
            ready(pid);
            await gate;
        });
        const pid = await locked;
        const endpoint = operation === 'complete' ? request(app).patch(`${f.base}/status`).send({ status: 'completed' })
            : operation === 'register' ? request(app).post(`${f.base}/players`).send({ playerId: late.id })
                : request(app).patch(`${f.base}/players/${f.players[0].id}/withdraw`).send({});
        const response = endpoint.set('Authorization', f.token).then(value => value);
        try {
            await vi.waitFor(async () => {
                expect((await db.query('SELECT pid FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))', [pid])).rows.length).toBeGreaterThan(0);
            }, { timeout: 3000, interval: 20 });
        } finally {
            release();
            await generation;
        }
        expect((await response).status).toBe(409);
        expect((await db.query('SELECT status, current_round FROM tournaments WHERE id = $1', [f.tournament.id])).first).toEqual({ status: 'active', current_round: 1 });
        expect((await db.query("SELECT player_id FROM tournament_players WHERE tournament_id = $1 AND status = 'active'", [f.tournament.id])).rows).toHaveLength(4);
    });
});
