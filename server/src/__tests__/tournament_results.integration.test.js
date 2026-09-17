import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { authorization, createClub, createPlayer, createTournament, createUser } from '../test/factories.js';

async function fixture() {
    const owner = await createUser();
    const club = await createClub(owner);
    const players = await Promise.all([createPlayer(club), createPlayer(club)]);
    const tournament = await createTournament(club, { status: 'active', ratingCategory: 'rapid' });
    const token = authorization(owner);
    const base = `/api/v1/clubs/${club.id}/tournaments/${tournament.id}`;
    for (const player of players) {
        await request(app).post(`${base}/players`).set('Authorization', token).send({ playerId: player.id }).expect(201);
    }
    const round = (await request(app).post(`${base}/rounds`).set('Authorization', token).send({}).expect(201)).body;
    const pairing = round.pairings[0];
    const record = (result = 'white', playedAt = '2026-09-01T12:00:00.000Z') => request(app)
        .post(`${base}/pairings/${pairing.id}/result`).set('Authorization', token).send({ result, playedAt });
    return { owner, club, tournament, token, base, round, pairing, record };
}

async function expectNoResult(f) {
    expect((await db.query('SELECT status, match_id, result FROM tournament_pairings WHERE id = $1', [f.pairing.id])).first)
        .toEqual({ status: 'scheduled', match_id: null, result: null });
    for (const table of ['matches', 'rating_history', 'match_audit_events', 'notifications']) {
        // Setup creates notifications, so only match/result notifications count here.
        const extra = table === 'notifications' ? " AND event_type IN ('match.recorded', 'tournament.result')" : '';
        expect((await db.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE club_id = $1${extra}`, [f.club.id])).first.count).toBe(0);
    }
}

describe('tournament result consistency and eligibility', () => {
    it('replays an earlier correction through later rated games before returning, including standings and category isolation', async () => {
        const f = await fixture();
        const first = await f.record().expect(201);
        const later = await request(app).post(`/api/v1/clubs/${f.club.id}/matches`).set('Authorization', f.token).send({
            whitePlayerId: f.pairing.whitePlayerId, blackPlayerId: f.pairing.blackPlayerId,
            ratingCategory: 'rapid', isRated: true, result: 'white', playedAt: '2026-09-02T12:00:00.000Z',
        }).expect(201);
        // Completed rounds remain correctable while the tournament is active.
        expect((await f.record('black').expect(200)).body.ratingStatus).toBe('applied');
        const history = await db.query(
            `SELECT match_id, rating_before, rating_after FROM rating_history
             WHERE player_id = $1 AND category = 'rapid' ORDER BY played_at, match_id`, [f.pairing.whitePlayerId]
        );
        expect(history.rows).toEqual([
            { match_id: first.body.match.id, rating_before: 1500, rating_after: 1480 },
            { match_id: later.body.match.id, rating_before: 1480, rating_after: 1502 },
        ]);
        const states = await db.query('SELECT category, current_rating, completed_rated_games FROM player_rating_state WHERE player_id = $1 ORDER BY category', [f.pairing.whitePlayerId]);
        expect(states.rows).toEqual([
            { category: 'blitz', current_rating: 1500, completed_rated_games: 0 },
            { category: 'classical', current_rating: 1500, completed_rated_games: 0 },
            { category: 'rapid', current_rating: 1502, completed_rated_games: 2 },
        ]);
        const detail = (await request(app).get(f.base).set('Authorization', f.token).expect(200)).body;
        expect(detail.standings.find(row => row.playerId === f.pairing.blackPlayerId).matchPoints).toBe(1);
        expect(detail.rounds[0].pairings[0].result).toBe('black');
        const match = (await request(app).get(`/api/v1/clubs/${f.club.id}/matches/${later.body.match.id}`).set('Authorization', f.token).expect(200)).body.match;
        expect(match.ratings).toMatchObject({ status: 'applied', white: { before: 1480, after: 1502 } });
        expect((await db.query('SELECT rapid_rating FROM players WHERE id = $1', [f.pairing.whitePlayerId])).first.rapid_rating).toBe(1502);
    });

    it('synchronously records backdated tournament games and clears earlier queued work covered by replay', async () => {
        const f = await fixture();
        const url = `/api/v1/clubs/${f.club.id}/matches`;
        const payload = { whitePlayerId: f.pairing.whitePlayerId, blackPlayerId: f.pairing.blackPlayerId,
            ratingCategory: 'rapid', isRated: true, result: 'white' };
        await request(app).post(url).set('Authorization', f.token).send({ ...payload, playedAt: '2026-09-03T12:00:00Z' }).expect(201);
        const queued = await request(app).post(url).set('Authorization', f.token).send({ ...payload, playedAt: '2026-08-30T12:00:00Z' }).expect(201);
        expect(queued.body.ratingStatus).toBe('recalculation_pending');
        expect((await f.record().expect(201)).body.ratingStatus).toBe('applied');
        expect((await db.query("SELECT status FROM rating_recalculation_jobs WHERE club_id = $1", [f.club.id])).rows).toEqual([{ status: 'completed' }]);
        expect((await db.query('SELECT COUNT(*)::int AS count FROM rating_history WHERE club_id = $1', [f.club.id])).first.count).toBe(6);
        const saved = (await request(app).get(`${url}/${queued.body.match.id}`).set('Authorization', f.token).expect(200)).body.match;
        expect(saved.ratings.status).toBe('applied');
    });

    it('requires resuming a completed tournament before correcting an existing result', async () => {
        const f = await fixture();
        await f.record().expect(201);
        await request(app).patch(`${f.base}/status`).set('Authorization', f.token).send({ status: 'completed' }).expect(200);
        expect((await f.record('black').expect(409)).body.code).toBe('TOURNAMENT_NOT_ACTIVE');
        await request(app).patch(`${f.base}/status`).set('Authorization', f.token).send({ status: 'active' }).expect(200);
        await f.record('black').expect(200);
    });

    it.each([
        ['withdrawn', "UPDATE tournament_players SET status = 'withdrawn', withdrawn_round = 1 WHERE tournament_id = $1", 'TOURNAMENT_PLAYER_INELIGIBLE'],
        ['registered too late', 'UPDATE tournament_players SET registration_round = 2 WHERE tournament_id = $1', 'TOURNAMENT_PLAYER_INELIGIBLE'],
        ['completed tournament', "UPDATE tournaments SET status = 'completed' WHERE id = $1", 'TOURNAMENT_NOT_ACTIVE'],
        ['upcoming tournament', "UPDATE tournaments SET status = 'upcoming' WHERE id = $1", 'TOURNAMENT_NOT_ACTIVE'],
        ['completed round', "UPDATE tournament_rounds SET status = 'completed' WHERE tournament_id = $1", 'TOURNAMENT_ROUND_NOT_OPEN'],
        ['noncurrent round', 'UPDATE tournaments SET current_round = 2 WHERE id = $1', 'TOURNAMENT_ROUND_NOT_OPEN'],
    ])('rejects new results for %s without partial writes', async (_label, sql, code) => {
        const f = await fixture();
        await db.query(sql, [f.tournament.id]);
        expect((await f.record().expect(409)).body.code).toBe(code);
        await expectNoResult(f);
    });

    it('rejects archived tournaments and mismatched pairing players through the general match endpoint', async () => {
        const f = await fixture();
        const first = await f.record().expect(201);
        const url = `/api/v1/clubs/${f.club.id}/matches/${first.body.match.id}`;
        expect((await request(app).patch(url).set('Authorization', f.token).send({
            whitePlayerId: f.pairing.blackPlayerId, blackPlayerId: f.pairing.whitePlayerId,
        }).expect(409)).body.code).toBe('TOURNAMENT_PAIRING_MISMATCH');
        await db.query('UPDATE tournaments SET deleted_at = NOW() WHERE id = $1', [f.tournament.id]);
        expect((await request(app).patch(url).set('Authorization', f.token).send({ result: 'black' }).expect(404)).body.code).toBe('TOURNAMENT_NOT_FOUND');
        expect((await db.query('SELECT result FROM matches WHERE id = $1', [first.body.match.id])).first.result).toBe('white');
    });

    it.each(['withdrawal', 'completion'])('serializes result recording behind concurrent %s', async change => {
        const f = await fixture();
        let locked;
        const ready = new Promise(resolve => { locked = resolve; });
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const mutation = db.transaction(async trx => {
            const pid = (await trx.query('SELECT pg_backend_pid() AS pid')).first.pid;
            await trx.query('SELECT id FROM tournaments WHERE id = $1 FOR UPDATE', [f.tournament.id]);
            if (change === 'withdrawal') {
                await trx.query("UPDATE tournament_players SET status = 'withdrawn', withdrawn_round = 1 WHERE tournament_id = $1", [f.tournament.id]);
            } else {
                await trx.query("UPDATE tournaments SET status = 'completed' WHERE id = $1", [f.tournament.id]);
            }
            locked(pid);
            await gate;
        });
        const pid = await ready;
        const submission = f.record().then(response => response);
        try {
            await vi.waitFor(async () => {
                const waiting = await db.query('SELECT pid FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))', [pid]);
                expect(waiting.rows.length).toBeGreaterThan(0);
            }, { timeout: 3000, interval: 20 });
        } finally {
            release();
            await mutation;
        }
        const response = await submission;
        expect(response.status).toBe(409);
        expect(response.body.code).toBe(change === 'withdrawal' ? 'TOURNAMENT_PLAYER_INELIGIBLE' : 'TOURNAMENT_NOT_ACTIVE');
        await expectNoResult(f);
    });

    it('rolls a correction and its pairing back if rating replay fails', async () => {
        const f = await fixture();
        const first = await f.record().expect(201);
        await db.query(`CREATE FUNCTION fail_result_rating_test() RETURNS TRIGGER AS $$
            BEGIN RAISE EXCEPTION 'forced replay failure'; END; $$ LANGUAGE plpgsql;
            CREATE TRIGGER fail_result_rating_test BEFORE INSERT ON rating_history
            FOR EACH ROW EXECUTE FUNCTION fail_result_rating_test();`);
        try {
            await f.record('black').expect(500);
        } finally {
            await db.query('DROP TRIGGER fail_result_rating_test ON rating_history; DROP FUNCTION fail_result_rating_test();');
        }
        expect((await db.query('SELECT result FROM matches WHERE id = $1', [first.body.match.id])).first.result).toBe('white');
        expect((await db.query('SELECT result FROM tournament_pairings WHERE id = $1', [f.pairing.id])).first.result).toBe('white');
        expect((await db.query('SELECT rapid_rating FROM players WHERE id = $1', [f.pairing.whitePlayerId])).first.rapid_rating).toBe(1520);
    });

    it('waits for rating locks before tournament locks, matching the deletion lock order', async () => {
        const f = await fixture();
        let submission;
        await db.transaction(async trx => {
            const pid = (await trx.query('SELECT pg_backend_pid() AS pid')).first.pid;
            await trx.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [f.club.id, 'rapid']);
            submission = f.record().then(response => response);
            await vi.waitFor(async () => {
                const waiting = await db.query('SELECT pid FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))', [pid]);
                expect(waiting.rows.length).toBeGreaterThan(0);
            }, { timeout: 3000, interval: 20 });
            // A result holding the tournament lock while waiting for ratings would fail NOWAIT.
            await trx.query('SELECT id FROM tournaments WHERE id = $1 FOR UPDATE NOWAIT', [f.tournament.id]);
            await trx.query('UPDATE tournaments SET deleted_at = NOW() WHERE id = $1', [f.tournament.id]);
        });
        expect((await submission).status).toBe(404);
        await expectNoResult(f);
    });
});
