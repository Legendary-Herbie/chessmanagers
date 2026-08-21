import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import {
    drainRatingRecalculationJobs,
    enqueueRatingRecalculation,
    processNextRatingJob,
} from '../services/RatingService.js';
import {
    authorization,
    createClub,
    createMatch,
    createPlayer,
    createUser,
} from '../test/factories.js';

describe('durable category rating recalculation', () => {
    it('coalesces jobs and deterministically replays same-time and backdated games with club/category isolation', async () => {
        const ownerA = await createUser();
        const ownerB = await createUser();
        const clubA = await createClub(ownerA);
        const clubB = await createClub(ownerB);
        const white = await createPlayer(clubA, { id: 'player_rating_white' });
        const black = await createPlayer(clubA, { id: 'player_rating_black' });
        const otherClubPlayer = await createPlayer(clubB, { id: 'player_rating_other_club' });
        const sameTime = new Date('2026-06-10T12:00:00.000Z');

        await createMatch(clubA, white, black, {
            id: 'match_z', result: 'white', timeControl: 'blitz', playedAt: sameTime,
        });
        await createMatch(clubA, white, black, {
            id: 'match_a', result: 'black', timeControl: 'blitz', playedAt: sameTime,
        });
        await enqueueRatingRecalculation({
            clubId: clubA.id,
            category: 'blitz',
            affectedFrom: sameTime,
        });
        await enqueueRatingRecalculation({
            clubId: clubA.id,
            category: 'blitz',
            affectedFrom: new Date('2026-06-01T12:00:00.000Z'),
        });

        const pending = await db.query(
            `SELECT affected_from FROM rating_recalculation_jobs
             WHERE club_id = $1 AND category = 'blitz' AND status = 'pending'`,
            [clubA.id]
        );
        expect(pending.rows).toHaveLength(1);
        expect(new Date(pending.first.affected_from).toISOString()).toBe('2026-06-01T12:00:00.000Z');

        const competingWorkers = await Promise.all([
            processNextRatingJob({ clubId: clubA.id, category: 'blitz' }),
            processNextRatingJob({ clubId: clubA.id, category: 'blitz' }),
        ]);
        expect(competingWorkers.filter(result => result && !result.skipped)).toHaveLength(1);

        let history = await db.query(
            `SELECT match_id, player_id, club_id, category, played_at, rating_before, rating_after
             FROM rating_history
             WHERE club_id = $1 AND category = 'blitz' AND player_id = $2
             ORDER BY played_at, match_id`,
            [clubA.id, white.id]
        );
        expect(history.rows.map(row => row.match_id)).toEqual(['match_a', 'match_z']);
        expect(history.rows[0]).toMatchObject({
            club_id: clubA.id,
            category: 'blitz',
            rating_before: 1500,
            rating_after: 1480,
        });

        let states = await db.query(
            `SELECT player_id, category, current_rating, completed_rated_games, peak_rating
             FROM player_rating_state
             WHERE club_id = $1 ORDER BY player_id, category`,
            [clubA.id]
        );
        const whiteBlitz = states.rows.find(row => row.player_id === white.id && row.category === 'blitz');
        const whiteRapid = states.rows.find(row => row.player_id === white.id && row.category === 'rapid');
        expect(whiteBlitz).toMatchObject({ current_rating: 1502, completed_rated_games: 2, peak_rating: 1502 });
        expect(whiteRapid).toMatchObject({ current_rating: 1500, completed_rated_games: 0, peak_rating: null });

        const isolated = await db.query(
            `SELECT current_rating, completed_rated_games FROM player_rating_state
             WHERE club_id = $1 AND player_id = $2 AND category = 'blitz'`,
            [clubB.id, otherClubPlayer.id]
        );
        expect(isolated.first).toMatchObject({ current_rating: 1500, completed_rated_games: 0 });

        const leaderboard = await request(app)
            .get(`/api/v1/clubs/${clubA.id}/leaderboard?category=blitz`)
            .set('Authorization', authorization(ownerA))
            .expect(200);
        expect(leaderboard.body.players.find(player => player.id === white.id)).toMatchObject({
            selected_category: 'blitz',
            rating: 1502,
            blitz_rating: 1502,
            rapid_rating: 1500,
        });
        const profile = await request(app)
            .get(`/api/v1/clubs/${clubA.id}/players/${white.id}`)
            .set('Authorization', authorization(ownerA))
            .expect(200);
        expect(profile.body.player.ratings).toMatchObject({
            blitz: { current_rating: 1502, completed_rated_games: 2, peak_rating: 1502 },
            rapid: { current_rating: 1500, completed_rated_games: 0, peak_rating: null },
        });
        const historyResponse = await request(app)
            .get(`/api/v1/clubs/${clubA.id}/leaderboard/players/${white.id}/rating-history?category=blitz`)
            .set('Authorization', authorization(ownerA))
            .expect(200);
        expect(historyResponse.body.history).toHaveLength(2);
        expect(historyResponse.body.history[0]).toMatchObject({
            category: 'blitz',
            match_id: 'match_a',
            rating: 1480,
        });

        await createMatch(clubA, white, black, {
            id: 'match_0', result: 'white', timeControl: 'blitz',
            playedAt: new Date('2026-06-01T12:00:00.000Z'),
        });
        await enqueueRatingRecalculation({
            clubId: clubA.id,
            category: 'blitz',
            affectedFrom: new Date('2026-06-01T12:00:00.000Z'),
        });
        await drainRatingRecalculationJobs({ clubId: clubA.id, category: 'blitz' });
        history = await db.query(
            `SELECT match_id, rating_before, rating_after FROM rating_history
             WHERE club_id = $1 AND category = 'blitz' AND player_id = $2
             ORDER BY played_at, match_id`,
            [clubA.id, white.id]
        );
        expect(history.rows.map(row => row.match_id)).toEqual(['match_0', 'match_a', 'match_z']);

        const beforeReplay = await db.query(
            `SELECT current_rating, completed_rated_games, peak_rating FROM player_rating_state
             WHERE club_id = $1 AND player_id = $2 AND category = 'blitz'`,
            [clubA.id, white.id]
        );
        const preservedHistory = await db.query(
            `SELECT id, rating_before, rating_after FROM rating_history
             WHERE club_id = $1 AND category = 'blitz' AND match_id = 'match_0'
             ORDER BY player_id`,
            [clubA.id]
        );
        await enqueueRatingRecalculation({
            clubId: clubA.id,
            category: 'blitz',
            affectedFrom: sameTime,
        });
        await drainRatingRecalculationJobs({ clubId: clubA.id, category: 'blitz' });
        const afterReplay = await db.query(
            `SELECT current_rating, completed_rated_games, peak_rating FROM player_rating_state
             WHERE club_id = $1 AND player_id = $2 AND category = 'blitz'`,
            [clubA.id, white.id]
        );
        expect(afterReplay.first).toEqual(beforeReplay.first);
        const historyBeforeCutoff = await db.query(
            `SELECT id, rating_before, rating_after FROM rating_history
             WHERE club_id = $1 AND category = 'blitz' AND match_id = 'match_0'
             ORDER BY player_id`,
            [clubA.id]
        );
        expect(historyBeforeCutoff.rows).toEqual(preservedHistory.rows);
    });

    it('enqueues and replays result edits, category changes, and deletion through match APIs', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const white = await createPlayer(club, { id: 'player_mutation_white' });
        const black = await createPlayer(club, { id: 'player_mutation_black' });
        const base = `/api/v1/clubs/${club.id}/matches`;
        const token = authorization(owner);

        const created = await request(app)
            .post(base)
            .set('Authorization', token)
            .send({
                whitePlayerId: white.id,
                blackPlayerId: black.id,
                result: 'white',
                isRated: true,
                ratingCategory: 'blitz',
                playedAt: '2026-07-01T12:00:00.000Z',
            })
            .expect(201);
        await drainRatingRecalculationJobs({ clubId: club.id, category: 'blitz' });
        let states = await db.query(
            `SELECT player_id, current_rating FROM player_rating_state
             WHERE club_id = $1 AND category = 'blitz'`,
            [club.id]
        );
        expect(states.rows.find(row => row.player_id === white.id).current_rating).toBe(1520);

        await request(app)
            .patch(`${base}/${created.body.match.id}`)
            .set('Authorization', token)
            .send({ result: 'black' })
            .expect(200);
        await drainRatingRecalculationJobs({ clubId: club.id, category: 'blitz' });
        states = await db.query(
            `SELECT player_id, current_rating FROM player_rating_state
             WHERE club_id = $1 AND category = 'blitz'`,
            [club.id]
        );
        expect(states.rows.find(row => row.player_id === black.id).current_rating).toBe(1520);

        await request(app)
            .patch(`${base}/${created.body.match.id}`)
            .set('Authorization', token)
            .send({ ratingCategory: 'rapid' })
            .expect(200);
        await processNextRatingJob({ clubId: club.id, category: 'rapid' });
        await drainRatingRecalculationJobs({ clubId: club.id, category: 'blitz' });
        const moved = await db.query(
            `SELECT category, player_id, current_rating, completed_rated_games
             FROM player_rating_state
             WHERE club_id = $1 AND player_id IN ($2, $3)
             ORDER BY category, player_id`,
            [club.id, white.id, black.id]
        );
        expect(moved.rows.find(row => row.category === 'blitz' && row.player_id === white.id)).toMatchObject({
            current_rating: 1500,
            completed_rated_games: 0,
        });
        expect(moved.rows.find(row => row.category === 'rapid' && row.player_id === black.id)).toMatchObject({
            current_rating: 1520,
            completed_rated_games: 1,
        });

        await request(app)
            .delete(`${base}/${created.body.match.id}`)
            .set('Authorization', token)
            .expect(200);
        await drainRatingRecalculationJobs({ clubId: club.id, category: 'rapid' });
        const reset = await db.query(
            `SELECT current_rating, completed_rated_games, peak_rating
             FROM player_rating_state
             WHERE club_id = $1 AND player_id = $2 AND category = 'rapid'`,
            [club.id, black.id]
        );
        expect(reset.first).toEqual({ current_rating: 1500, completed_rated_games: 0, peak_rating: null });
        const history = await db.query('SELECT COUNT(*)::INTEGER AS count FROM rating_history WHERE club_id = $1', [club.id]);
        expect(history.first.count).toBe(0);
    });

    it('replays rating-setting changes without rewriting existing player start ratings', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const white = await createPlayer(club, { id: 'player_settings_white' });
        const black = await createPlayer(club, { id: 'player_settings_black' });
        const token = authorization(owner);

        await createMatch(club, white, black, {
            id: 'match_settings', result: 'white', timeControl: 'blitz',
            playedAt: new Date('2026-08-01T12:00:00.000Z'),
        });
        await enqueueRatingRecalculation({
            clubId: club.id,
            category: 'blitz',
            affectedFrom: new Date('2026-08-01T12:00:00.000Z'),
        });
        await drainRatingRecalculationJobs({ clubId: club.id, category: 'blitz' });

        await request(app)
            .patch(`/api/v1/clubs/${club.id}`)
            .set('Authorization', token)
            .send({
                ratingSettings: {
                    blitz: {
                        initialRating: 1700,
                        ratingFloor: 500,
                        establishedKFactor: 20,
                        provisionalKFactor: 20,
                        provisionalGames: 10,
                    },
                },
            })
            .expect(200);

        const pending = await db.query(
            `SELECT affected_from FROM rating_recalculation_jobs
             WHERE club_id = $1 AND category = 'blitz' AND status = 'pending'`,
            [club.id]
        );
        expect(pending.rows).toHaveLength(1);
        expect(new Date(pending.first.affected_from).toISOString()).toBe('2026-08-01T12:00:00.000Z');
        await drainRatingRecalculationJobs({ clubId: club.id, category: 'blitz' });

        const existingState = await db.query(
            `SELECT start_rating, current_rating FROM player_rating_state
             WHERE club_id = $1 AND player_id = $2 AND category = 'blitz'`,
            [club.id, white.id]
        );
        expect(existingState.first).toEqual({ start_rating: 1500, current_rating: 1510 });

        const created = await request(app)
            .post(`/api/v1/clubs/${club.id}/players`)
            .set('Authorization', token)
            .send({ name: 'New Initial Rating' })
            .expect(201);
        const newState = await db.query(
            `SELECT start_rating, current_rating FROM player_rating_state
             WHERE club_id = $1 AND player_id = $2 AND category = 'blitz'`,
            [club.id, created.body.player.id]
        );
        expect(newState.first).toEqual({ start_rating: 1700, current_rating: 1700 });
    });
});
