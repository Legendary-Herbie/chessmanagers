import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../config/api.js';
import { playerApi } from './playerApi.js';

vi.mock('../../../config/api.js', async importOriginal => {
    const original = await importOriginal();
    return { ...original, api: { get: vi.fn() } };
});

describe('player history API routes', () => {
    beforeEach(() => vi.clearAllMocks());

    it('uses canonical player-scoped URLs for history, statistics, and head-to-head', async () => {
        api.get
            .mockResolvedValueOnce({ matches: [] })
            .mockResolvedValueOnce({ history: [] })
            .mockResolvedValueOnce({ statistics: { categories: {} } })
            .mockResolvedValueOnce({ headToHead: { overall: {} } })
            .mockResolvedValueOnce({ matches: [] });

        await playerApi.fetchMatches('club_1', 'player_a');
        await playerApi.fetchRatingHistory('club_1', 'player_a', 'rapid');
        await playerApi.fetchStatistics('club_1', 'player_a');
        await playerApi.fetchHeadToHead('club_1', 'player_a', 'player_b');
        await playerApi.fetchHeadToHeadMatches('club_1', 'player_a', 'player_b');

        expect(api.get.mock.calls.map(call => call[0])).toEqual([
            '/clubs/club_1/players/player_a/matches',
            '/clubs/club_1/players/player_a/rating-history?category=rapid',
            '/clubs/club_1/players/player_a/statistics',
            '/clubs/club_1/players/player_a/vs/player_b/summary',
            '/clubs/club_1/players/player_a/vs/player_b',
        ]);
    });
});
