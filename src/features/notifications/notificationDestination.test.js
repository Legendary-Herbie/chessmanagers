import { describe, expect, it } from 'vitest';
import { notificationDestination } from './notificationDestination.js';

describe('notificationDestination', () => {
    it.each([
        ['membership.request_pending', {}, '/dashboard'],
        ['join_request.approved', {}, '/dashboard'],
        ['join_request.rejected', {}, '/clubs/club_1'],
        ['player_claim.pending', { playerId: 'player_1' }, '/players'],
        ['player_claim.approved', { playerId: 'player_1' }, '/players/player_1'],
        ['match.corrected', { matchId: 'match_1' }, '/matches'],
        ['tournament.pairing', { tournamentId: 'tournament_1' }, '/tournaments/tournament_1'],
        ['announcement.published', { announcementId: 'announcement_1' }, '/announcements/announcement_1'],
    ])('maps %s to its relevant workflow', (eventType, payload, expected) => {
        expect(notificationDestination({ eventType, payload, clubId: 'club_1' })).toBe(expected);
    });
});
