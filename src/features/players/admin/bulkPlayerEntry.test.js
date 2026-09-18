import { describe, expect, it } from 'vitest';
import { parseBulkPlayers } from './bulkPlayerEntry.js';

describe('bulk entry', () => {
    it('supports quoted names and comma-containing bios', () => {
        expect(parseBulkPlayers('"Lee, Sam",1600,1700,1800,"Captain, coach"').players).toEqual([
            { name: 'Lee, Sam', startRatings: { blitz: 1600, rapid: 1700, classical: 1800 }, bio: 'Captain, coach' },
        ]);
    });
    it('applies shared independent ratings only when requested', () => {
        const text = 'Alex\nSam,1800,Notes';
        expect(parseBulkPlayers(text).players[0]).toEqual({ name: 'Alex' });
        const parsed = parseBulkPlayers(text, { sharedRatings: { blitz: '1600', rapid: '1700', classical: '' } });
        expect(parsed.players[1]).toEqual({ name: 'Sam', bio: 'Notes', startRatings: { blitz: 1600, rapid: 1700 } });
    });
    it('reports malformed and below-floor ratings without silently truncating them', () => {
        const parsed = parseBulkPlayers('Alex,1500oops\nSam,1100', { settings: { blitz: { ratingFloor: 1200 } } });
        expect(parsed.players).toEqual([]);
        expect(parsed.errors).toHaveLength(2);
    });
});
