import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { PlayerModel } from '../models/Player.js';
import { recoverStaleRatingJobs, enqueueRatingRecalculation, drainRatingRecalculationJobs } from '../services/RatingService.js';
import { authorization, createClub, createUser } from '../test/factories.js';

describe('backend batching and recovery', () => {
    it('creates 55 players, independent ratings and audit events in four queries, rolling back audit failures', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const players = Array.from({ length: 55 }, (_, index) => ({
            name: `Player ${index}`, startRatings: { blitz: 1200 + index, rapid: 1500 + index, classical: 1800 + index },
        }));
        const transaction = db.transaction.bind(db);
        let count = 0;
        const spy = vi.spyOn(db, 'transaction').mockImplementation(fn => transaction(trx => fn({
            query: (...args) => { count += 1; return trx.query(...args); },
        })));
        let created;
        try {
            created = await PlayerModel.createBulk({ clubId: club.id, actorUserId: owner.id, players });
        } finally { spy.mockRestore(); }
        expect(count).toBe(4);
        expect(created.map(player => player.name)).toEqual(players.map(player => player.name));
        const states = await db.query('SELECT * FROM player_rating_state WHERE club_id = $1', [club.id]);
        expect(states.rows).toHaveLength(165);
        for (const [index, player] of created.entries()) {
            for (const category of ['blitz', 'rapid', 'classical']) {
                expect(states.rows.find(state => state.player_id === player.id && state.category === category).current_rating)
                    .toBe(players[index].startRatings[category]);
            }
        }
        expect((await db.query('SELECT * FROM player_lifecycle_events WHERE club_id = $1', [club.id])).rows).toHaveLength(55);
        await expect(PlayerModel.createBulk({ clubId: club.id, actorUserId: 'missing-user', players })).rejects.toThrow();
        expect((await db.query('SELECT id FROM players WHERE club_id = $1', [club.id])).rows).toHaveLength(55);
        expect((await db.query('SELECT * FROM player_rating_state WHERE club_id = $1', [club.id])).rows).toHaveLength(165);
    });

    it('recovers stale claims, coalesces earliest work, and leaves fresh or actively locked scopes alone', async () => {
        const club = await createClub(await createUser());
        await db.query(
            `INSERT INTO rating_recalculation_jobs (club_id, category, affected_from, status, started_at)
             VALUES ($1, 'rapid', '2026-01-01T00:00:00Z', 'running', NOW() - INTERVAL '6 minutes'),
                    ($1, 'blitz', '2026-01-01T00:00:00Z', 'running', NOW()),
                    ($1, 'classical', '2026-01-01T00:00:00Z', 'running', NOW() - INTERVAL '6 minutes')`, [club.id]
        );
        await enqueueRatingRecalculation({ clubId: club.id, category: 'rapid', affectedFrom: '2026-02-01T00:00:00Z' });
        await db.transaction(async trx => {
            await trx.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [club.id, 'classical']);
            expect(await recoverStaleRatingJobs()).toBe(1);
        });
        const pending = await db.query("SELECT * FROM rating_recalculation_jobs WHERE status = 'pending'");
        expect(pending.rows).toHaveLength(1);
        expect(pending.first.category).toBe('rapid');
        expect(pending.first.affected_from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
        expect(await recoverStaleRatingJobs()).toBe(1);
        expect(await recoverStaleRatingJobs()).toBe(0);
        expect(await drainRatingRecalculationJobs()).toHaveLength(2);
        expect((await db.query("SELECT category FROM rating_recalculation_jobs WHERE status = 'running'")).rows)
            .toEqual([{ category: 'blitz' }]);
    });
});

describe('tiered endpoint rate limits', () => {
    it('shares the public budget across discovery and detail and isolates other IPs', async () => {
        const ip = '198.51.100.181';
        for (let index = 0; index < 60; index += 1) {
            await request(app).get('/api/v1/clubs?limit=invalid').set('X-Forwarded-For', ip).expect(400);
        }
        const blocked = await request(app).get('/api/v1/public/clubs/missing').set('X-Forwarded-For', ip).expect(429);
        expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
        expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(60);
        await request(app).get('/api/v1/clubs?limit=invalid').set('X-Forwarded-For', '198.51.100.182').expect(400);
    });

    it('limits password recovery to five requests in fifteen minutes', async () => {
        const ip = '198.51.100.183';
        for (let index = 0; index < 5; index += 1) {
            await request(app).post('/api/v1/auth/forgot-password').set('X-Forwarded-For', ip).send({}).expect(400);
        }
        const response = await request(app).post('/api/v1/auth/reset-password').set('X-Forwarded-For', ip).send({}).expect(429);
        expect(Number(response.headers['retry-after'])).toBeGreaterThan(60);
        expect(Number(response.headers['retry-after'])).toBeLessThanOrEqual(900);
    });

    it('limits join codes across accounts sharing an IP, with a one-minute window', async () => {
        const first = await createUser();
        const second = await createUser();
        const ip = '198.51.100.184';
        for (let index = 0; index < 10; index += 1) {
            await request(app).post('/api/v1/clubs/join-by-code').set('Authorization', authorization(first))
                .set('X-Forwarded-For', ip).send({}).expect(400);
        }
        const blocked = await request(app).post('/api/v1/clubs/join-by-code').set('Authorization', authorization(second))
            .set('X-Forwarded-For', ip).send({}).expect(429);
        expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(60);
        await request(app).post('/api/v1/clubs/join-by-code').set('Authorization', authorization(second))
            .set('X-Forwarded-For', '198.51.100.185').send({}).expect(400);
    });
});
