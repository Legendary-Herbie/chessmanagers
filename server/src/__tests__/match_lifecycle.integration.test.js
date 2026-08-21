import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { drainRatingRecalculationJobs } from '../services/RatingService.js';
import {
    authorization,
    createClub,
    createPlayer,
    createTournament,
    createUser,
} from '../test/factories.js';

function matchPayload(white, black, overrides = {}) {
    return {
        whitePlayerId: white.id,
        blackPlayerId: black.id,
        result: 'white',
        ratingCategory: 'blitz',
        isRated: true,
        playedAt: '2026-08-10T12:00:00.000Z',
        ...overrides,
    };
}

describe('canonical match lifecycle', () => {
    it('requires explicit chronology, category, and rated state and rejects legacy type input', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const white = await createPlayer(club);
        const black = await createPlayer(club);
        const base = `/api/v1/clubs/${club.id}/matches`;
        const token = authorization(owner);

        await request(app).post(base).set('Authorization', token)
            .send({ ...matchPayload(white, black), playedAt: undefined }).expect(400);
        await request(app).post(base).set('Authorization', token)
            .send({ ...matchPayload(white, black), ratingCategory: undefined }).expect(400);
        await request(app).post(base).set('Authorization', token)
            .send({ ...matchPayload(white, black), isRated: undefined }).expect(400);
        const legacy = await request(app).post(base).set('Authorization', token)
            .send({ ...matchPayload(white, black), type: 'rated' }).expect(400);
        expect(legacy.body.error).toBe('Validation failed.');
    });

    it('applies a current rated match atomically while keeping unrated matches out of Elo', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const white = await createPlayer(club);
        const black = await createPlayer(club);
        const base = `/api/v1/clubs/${club.id}/matches`;
        const token = authorization(owner);

        const rated = await request(app).post(base).set('Authorization', token)
            .send(matchPayload(white, black)).expect(201);
        expect(rated.body.ratingStatus).toBe('applied');
        expect(rated.body.match).toMatchObject({
            rating_category: 'blitz', is_rated: true, status: 'active',
            time_control: 'blitz', type: 'rated',
        });
        const ratedState = await db.query(
            `SELECT current_rating, completed_rated_games FROM player_rating_state
             WHERE player_id = $1 AND category = 'blitz'`,
            [white.id]
        );
        expect(ratedState.first).toEqual({ current_rating: 1520, completed_rated_games: 1 });
        expect((await db.query('SELECT * FROM rating_history WHERE match_id = $1', [rated.body.match.id])).rows).toHaveLength(2);

        const unrated = await request(app).post(base).set('Authorization', token)
            .send(matchPayload(white, black, {
                isRated: false,
                result: 'draw',
                playedAt: '2026-08-10T13:00:00.000Z',
            })).expect(201);
        expect(unrated.body.ratingStatus).toBe('unrated');
        expect(unrated.body.match.type).toBe('casual');
        expect((await db.query('SELECT * FROM rating_history WHERE match_id = $1', [unrated.body.match.id])).rows).toHaveLength(0);
        expect((await db.query(
            `SELECT current_rating, completed_rated_games FROM player_rating_state
             WHERE player_id = $1 AND category = 'blitz'`, [white.id]
        )).first).toEqual(ratedState.first);
        expect((await db.query('SELECT games FROM players WHERE id = $1', [white.id])).first.games).toBe(2);
        const audits = await db.query(
            `SELECT event_type, old_state, new_state FROM match_audit_events
             WHERE match_id IN ($1, $2) ORDER BY created_at, id`,
            [rated.body.match.id, unrated.body.match.id]
        );
        expect(audits.rows).toHaveLength(2);
        expect(audits.rows.every(row => row.event_type === 'match.created' && row.old_state === null && row.new_state)).toBe(true);
    });

    it('returns a machine-readable duplicate warning and creates only after confirmation', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const white = await createPlayer(club);
        const black = await createPlayer(club);
        const base = `/api/v1/clubs/${club.id}/matches`;
        const token = authorization(owner);
        const payload = matchPayload(white, black, { isRated: false });

        await request(app).post(base).set('Authorization', token).send(payload).expect(201);
        const warning = await request(app).post(base).set('Authorization', token)
            .send({ ...payload, playedAt: '2026-08-10T12:04:00.000Z' }).expect(409);
        expect(warning.body).toMatchObject({
            code: 'POSSIBLE_DUPLICATE_MATCH',
            requiresConfirmation: true,
        });
        expect(warning.body.duplicate.id).toBeTruthy();
        await request(app).post(base).set('Authorization', token)
            .send({ ...payload, playedAt: '2026-08-10T12:04:00.000Z', confirmDuplicate: true })
            .expect(201);
        expect((await db.query('SELECT COUNT(*)::INTEGER AS count FROM matches WHERE club_id = $1', [club.id])).first.count).toBe(2);
    });

    it('queues backdated creation and edited chronology for every affected category', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const white = await createPlayer(club);
        const black = await createPlayer(club);
        const base = `/api/v1/clubs/${club.id}/matches`;
        const token = authorization(owner);

        await request(app).post(base).set('Authorization', token)
            .send(matchPayload(white, black, {
                ratingCategory: 'rapid',
                playedAt: '2026-08-10T12:00:00.000Z',
            })).expect(201);
        const backdated = await request(app).post(base).set('Authorization', token)
            .send(matchPayload(white, black, {
                result: 'black',
                ratingCategory: 'rapid',
                playedAt: '2026-08-01T12:00:00.000Z',
            })).expect(201);
        expect(backdated.body.ratingStatus).toBe('recalculation_pending');
        let jobs = await db.query(
            `SELECT category, affected_from, status FROM rating_recalculation_jobs
             WHERE club_id = $1 AND status = 'pending'`, [club.id]
        );
        expect(jobs.rows).toHaveLength(1);
        expect(jobs.first.category).toBe('rapid');
        expect(new Date(jobs.first.affected_from).toISOString()).toBe('2026-08-01T12:00:00.000Z');
        await drainRatingRecalculationJobs({ clubId: club.id });

        const edited = await request(app).patch(`${base}/${backdated.body.match.id}`)
            .set('Authorization', token)
            .send({
                result: 'draw',
                ratingCategory: 'classical',
                playedAt: '2026-07-15T12:00:00.000Z',
                reason: 'Corrected the score sheet and category.',
            }).expect(200);
        expect(edited.body.ratingStatus).toBe('recalculation_pending');
        jobs = await db.query(
            `SELECT category, affected_from FROM rating_recalculation_jobs
             WHERE club_id = $1 AND status = 'pending' ORDER BY category`, [club.id]
        );
        expect(jobs.rows.map(row => row.category)).toEqual(['classical', 'rapid']);
        expect(new Date(jobs.rows[0].affected_from).toISOString()).toBe('2026-07-15T12:00:00.000Z');
        expect(new Date(jobs.rows[1].affected_from).toISOString()).toBe('2026-08-01T12:00:00.000Z');
        const audit = await db.query(
            `SELECT reason, old_state, new_state FROM match_audit_events
             WHERE match_id = $1 AND event_type = 'match.updated'`,
            [backdated.body.match.id]
        );
        expect(audit.first.reason).toBe('Corrected the score sheet and category.');
        expect(audit.first.old_state.rating_category).toBe('rapid');
        expect(audit.first.new_state.rating_category).toBe('classical');
    });

    it('enforces tournament club roster, category, and rated configuration', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const white = await createPlayer(club);
        const black = await createPlayer(club);
        const outsider = await createPlayer(club);
        const tournament = await createTournament(club, { ratingCategory: 'rapid', isRated: false });
        await db.query(
            `INSERT INTO tournament_players (tournament_id, player_id) VALUES ($1, $2), ($1, $3)`,
            [tournament.id, white.id, black.id]
        );
        const base = `/api/v1/clubs/${club.id}/matches`;
        const token = authorization(owner);

        await request(app).post(base).set('Authorization', token)
            .send(matchPayload(white, black, { tournamentId: tournament.id })).expect(400);
        await request(app).post(base).set('Authorization', token)
            .send(matchPayload(white, outsider, {
                tournamentId: tournament.id, ratingCategory: 'rapid', isRated: false,
            })).expect(400);
        const created = await request(app).post(base).set('Authorization', token)
            .send(matchPayload(white, black, {
                tournamentId: tournament.id, ratingCategory: 'rapid', isRated: false,
            })).expect(201);
        expect(created.body.match).toMatchObject({
            tournament_id: tournament.id,
            rating_category: 'rapid',
            is_rated: false,
            type: 'tournament',
        });
    });

    it('voids and soft-deletes with audit snapshots and durable rating replay', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const white = await createPlayer(club);
        const black = await createPlayer(club);
        const base = `/api/v1/clubs/${club.id}/matches`;
        const token = authorization(owner);
        const created = await request(app).post(base).set('Authorization', token)
            .send(matchPayload(white, black)).expect(201);

        await request(app).post(`${base}/${created.body.match.id}/void`)
            .set('Authorization', token).send({}).expect(400);
        const voided = await request(app).post(`${base}/${created.body.match.id}/void`)
            .set('Authorization', token).send({ reason: 'Result was entered incorrectly.' }).expect(200);
        expect(voided.body).toMatchObject({
            ratingStatus: 'recalculation_pending',
            match: { status: 'voided', void_reason: 'Result was entered incorrectly.' },
        });
        expect((await db.query(
            `SELECT status FROM rating_recalculation_jobs
             WHERE club_id = $1 AND category = 'blitz' ORDER BY created_at DESC LIMIT 1`,
            [club.id]
        )).first.status).toBe('pending');
        await drainRatingRecalculationJobs({ clubId: club.id, category: 'blitz' });
        expect((await db.query(
            `SELECT current_rating, completed_rated_games, peak_rating FROM player_rating_state
             WHERE player_id = $1 AND category = 'blitz'`, [white.id]
        )).first).toEqual({ current_rating: 1500, completed_rated_games: 0, peak_rating: null });
        expect((await db.query('SELECT games FROM players WHERE id = $1', [white.id])).first.games).toBe(0);

        const deleted = await request(app).delete(`${base}/${created.body.match.id}`)
            .set('Authorization', token).send({ reason: 'Duplicate record.' }).expect(200);
        expect(deleted.body.match.status).toBe('deleted');
        await request(app).get(`${base}/${created.body.match.id}`).set('Authorization', token).expect(404);
        const list = await request(app).get(base).set('Authorization', token).expect(200);
        expect(list.body.matches).toHaveLength(0);
        const preserved = await db.query('SELECT status, delete_reason FROM matches WHERE id = $1', [created.body.match.id]);
        expect(preserved.first).toEqual({ status: 'deleted', delete_reason: 'Duplicate record.' });
        const audits = await db.query(
            `SELECT event_type, reason, old_state, new_state FROM match_audit_events
             WHERE match_id = $1 ORDER BY created_at, id`, [created.body.match.id]
        );
        expect(audits.rows.map(row => row.event_type)).toEqual([
            'match.created', 'match.voided', 'match.deleted',
        ]);
        expect(audits.rows[1].old_state.status).toBe('active');
        expect(audits.rows[1].new_state.status).toBe('voided');
    });
});
