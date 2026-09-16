import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { authorization, createClub, createPlayer, createPlayerLink, createTournament, createUser } from '../test/factories.js';

describe('club night operations', () => {
    it('deduplicates concurrent retries and rejects reusing a submission ID with changed content', async () => {
        const owner = await createUser(); const club = await createClub(owner); const white = await createPlayer(club); const black = await createPlayer(club);
        const token = authorization(owner); const url = `/api/v1/clubs/${club.id}/matches`;
        const payload = { whitePlayerId:white.id, blackPlayerId:black.id, result:'white', ratingCategory:'rapid', isRated:true, playedAt:'2026-09-01T10:00:00.000Z', clientRequestId:randomUUID() };
        const responses = await Promise.all([1,2].map(() => request(app).post(url).set('Authorization', token).send(payload).expect(201)));
        expect(responses[0].body.match.id).toBe(responses[1].body.match.id);
        expect(responses[0].body.match).not.toHaveProperty('client_payload_hash');
        expect((await db.query('SELECT COUNT(*)::INTEGER AS count FROM matches WHERE club_id = $1', [club.id])).first.count).toBe(1);
        const conflict = await request(app).post(url).set('Authorization', token).send({ ...payload, result:'black' }).expect(409);
        expect(conflict.body.code).toBe('REQUEST_ID_CONFLICT');
        const stranger = await createUser();
        await request(app).post(url).set('Authorization', authorization(stranger)).send(payload).expect(403);
    });
    it('stores only unique supported tiebreaks in admin-selected order', async () => {
        const owner = await createUser(); const club = await createClub(owner); const tournament = await createTournament(club); const token = authorization(owner);
        const url = `/api/v1/clubs/${club.id}/tournaments/${tournament.id}`;
        const result = await request(app).patch(url).set('Authorization', token).send({ tiebreaks:['directHeadToHead','buchholz'] }).expect(200);
        expect(result.body.tournament.tiebreaks).toEqual(['directHeadToHead','buchholz']);
        await request(app).patch(url).set('Authorization', token).send({ tiebreaks:['buchholz','buchholz'] }).expect(400);
        await request(app).patch(url).set('Authorization', token).send({ tiebreaks:['invented'] }).expect(400);
    });
    it('returns the linked player summary and opponent outcomes only in the authorized club', async () => {
        const owner = await createUser(); const club = await createClub(owner); const white = await createPlayer(club, { name:'Alex' }); const black = await createPlayer(club, { name:'Sam' }); const token = authorization(owner);
        await createPlayerLink(owner, white, { status:'approved' });
        await request(app).post(`/api/v1/clubs/${club.id}/matches`).set('Authorization', token).send({ whitePlayerId:white.id, blackPlayerId:black.id, result:'white', ratingCategory:'rapid', isRated:true, playedAt:'2026-09-01T10:00:00.000Z' }).expect(201);
        const summary = await request(app).get(`/api/v1/clubs/${club.id}/leaderboard/dashboard`).set('Authorization', token).expect(200);
        expect(summary.body.dashboard.myChessSummary.player.id).toBe(white.id);
        expect(summary.body.dashboard.myChessSummary.categories.rapid.currentWinStreak).toBe(1);
        const history = await request(app).get(`/api/v1/clubs/${club.id}/players/${white.id}/rating-history?category=all&limit=100&offset=0`).set('Authorization', token).expect(200);
        expect(history.body.history[0]).toMatchObject({ opponentName:'Sam', outcome:'win', category:'rapid' });
        const other = await createClub(owner);
        const empty = await request(app).get(`/api/v1/clubs/${other.id}/leaderboard/dashboard`).set('Authorization', token).expect(200);
        expect(empty.body.dashboard.myChessSummary).toBeNull();
    });
});
