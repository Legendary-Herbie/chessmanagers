import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import {
    addClubMember,
    authorization,
    createClub,
    createMatch,
    createPlayer,
    createPlayerLink,
    createUser,
} from '../test/factories.js';

async function setCategoryRating(clubId, playerIds, category, rating) {
    await db.query(
        `UPDATE player_rating_state SET current_rating = $4, peak_rating = $4
         WHERE club_id = $1 AND player_id = ANY($2::TEXT[]) AND category = $3`,
        [clubId, playerIds, category, rating]
    );
}

describe('canonical leaderboard and statistics', () => {
    it('applies exact eligibility and tie-break ordering before search and pagination', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const names = ['Games More', 'Games Less', 'Alpha', 'Beta', 'Loss One', 'Loss Two', 'No Games'];
        const players = {};
        for (const name of names) players[name] = await createPlayer(club, { name });
        const linkedUser = await createUser();
        await addClubMember(club, linkedUser);
        await createPlayerLink(linkedUser, players['Games Less'], {
            status: 'approved', reviewedAt: new Date(),
        });
        await setCategoryRating(club.id, Object.values(players).map(player => player.id), 'blitz', 1600);

        await createMatch(club, players['Games More'], players['Loss One'], { result: 'white' });
        await createMatch(club, players['Games More'], players['Loss Two'], {
            result: 'white', playedAt: new Date('2026-01-02T12:00:00Z'),
        });
        await createMatch(club, players['Games Less'], players['Loss One'], {
            result: 'white', playedAt: new Date('2026-01-03T12:00:00Z'),
        });
        await createMatch(club, players.Alpha, players.Beta, {
            result: 'draw', playedAt: new Date('2026-01-04T12:00:00Z'),
        });

        const response = await request(app)
            .get(`/api/v1/clubs/${club.id}/leaderboard?category=blitz&limit=3`)
            .set('Authorization', authorization(owner)).expect(200);
        expect(response.body.leaderboard.total).toBe(6);
        expect(response.body.leaderboard.entries.map(entry => entry.playerName)).toEqual([
            'Games More', 'Games Less', 'Alpha',
        ]);
        expect(response.body.leaderboard.entries.map(entry => entry.rank)).toEqual([1, 2, 3]);
        expect(response.body.leaderboard.entries[0]).toMatchObject({
            categoryGames: 2,
            totalGames: 2,
            selectedRating: 1600,
        });

        const secondPage = await request(app)
            .get(`/api/v1/clubs/${club.id}/leaderboard?category=blitz&limit=2&offset=2&q=a`)
            .set('Authorization', authorization(owner)).expect(200);
        expect(secondPage.body.leaderboard.total).toBe(4);
        expect(secondPage.body.leaderboard.entries).toHaveLength(2);
        expect(secondPage.body.leaderboard.entries.map(entry => entry.rank)).toEqual([3, 4]);
        expect(response.body.leaderboard.entries.some(entry => entry.playerName === 'No Games')).toBe(false);
    });

    it('returns category statistics with draw-reset streaks and rated-only head-to-head totals', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const playerA = await createPlayer(club, { name: 'Player A' });
        const playerB = await createPlayer(club, { name: 'Player B' });
        await createMatch(club, playerA, playerB, {
            result: 'white', playedAt: new Date('2026-01-01T12:00:00Z'),
        });
        await createMatch(club, playerA, playerB, {
            result: 'black', playedAt: new Date('2026-01-02T12:00:00Z'),
        });
        await createMatch(club, playerA, playerB, {
            result: 'black', playedAt: new Date('2026-01-03T12:00:00Z'),
        });
        await createMatch(club, playerA, playerB, {
            result: 'draw', timeControl: 'rapid', playedAt: new Date('2026-01-04T12:00:00Z'),
        });
        await createMatch(club, playerA, playerB, {
            result: 'white', timeControl: 'classical', isRated: false,
            type: 'casual', playedAt: new Date('2026-01-05T12:00:00Z'),
        });

        const statistics = await request(app)
            .get(`/api/v1/clubs/${club.id}/leaderboard/players/${playerA.id}/statistics`)
            .set('Authorization', authorization(owner)).expect(200);
        expect(statistics.body.statistics.categories.blitz).toMatchObject({
            games: 3, wins: 1, losses: 2, draws: 0,
            currentWinStreak: 0, currentLossStreak: 2,
        });
        expect(statistics.body.statistics.categories.rapid).toMatchObject({
            games: 1, draws: 1, currentWinStreak: 0, currentLossStreak: 0,
        });
        expect(statistics.body.statistics.categories.classical.games).toBe(0);

        const headToHead = await request(app)
            .get(`/api/v1/clubs/${club.id}/leaderboard/players/${playerA.id}/vs/${playerB.id}/summary`)
            .set('Authorization', authorization(owner)).expect(200);
        expect(headToHead.body.headToHead.overall).toEqual({
            games: 4, playerAWins: 1, playerBWins: 2, draws: 1,
        });
        expect(headToHead.body.headToHead.categories.blitz.games).toBe(3);
        expect(headToHead.body.headToHead.categories.classical.games).toBe(0);

        const canonicalStatistics = await request(app)
            .get(`/api/v1/clubs/${club.id}/players/${playerA.id}/statistics`)
            .set('Authorization', authorization(owner)).expect(200);
        expect(canonicalStatistics.body.statistics).toEqual(statistics.body.statistics);

        const canonicalSummary = await request(app)
            .get(`/api/v1/clubs/${club.id}/players/${playerA.id}/vs/${playerB.id}/summary`)
            .set('Authorization', authorization(owner)).expect(200);
        expect(canonicalSummary.body.headToHead).toEqual(headToHead.body.headToHead);

        const canonicalMatches = await request(app)
            .get(`/api/v1/clubs/${club.id}/players/${playerA.id}/vs/${playerB.id}`)
            .set('Authorization', authorization(owner)).expect(200);
        expect(canonicalMatches.body.matches).toHaveLength(5);

        await request(app)
            .get(`/api/v1/clubs/${club.id}/players/${playerA.id}/matches?limit=2`)
            .set('Authorization', authorization(owner)).expect(200)
            .then(response => expect(response.body.matches).toHaveLength(2));
        await request(app)
            .get(`/api/v1/clubs/${club.id}/players/${playerA.id}/rating-history?category=blitz`)
            .set('Authorization', authorization(owner)).expect(200);
    });

    it('keeps dashboard metrics member-safe and admin queues admin-only', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member);
        const playerA = await createPlayer(club);
        const playerB = await createPlayer(club);
        await createMatch(club, playerA, playerB, { result: 'draw' });

        const memberResponse = await request(app)
            .get(`/api/v1/clubs/${club.id}/leaderboard/dashboard?category=blitz`)
            .set('Authorization', authorization(member)).expect(200);
        expect(memberResponse.body.dashboard).not.toHaveProperty('admin');
        expect(memberResponse.body.dashboard).toMatchObject({
            period: 'allTime',
            selectedCategory: 'blitz',
            metrics: {
                activeMembers: 2, rosterPlayers: 2, activePlayers: 2,
                totalGames: 1, ratedGames: 1,
            },
        });
        expect(memberResponse.body.dashboard.topPlayers[0].rank).toBe(1);

        const ownerResponse = await request(app)
            .get(`/api/v1/clubs/${club.id}/leaderboard/dashboard?category=blitz`)
            .set('Authorization', authorization(owner)).expect(200);
        expect(ownerResponse.body.dashboard.admin).toEqual({
            pendingJoinRequests: 0, pendingPlayerLinks: 0,
        });
        const defaultResponse = await request(app)
            .get(`/api/v1/clubs/${club.id}/leaderboard/dashboard`)
            .set('Authorization', authorization(owner)).expect(200);
        expect(defaultResponse.body.dashboard.selectedCategory).toBe('rapid');
        expect(defaultResponse.body.dashboard.topPlayers).toEqual([]);
    });
});
