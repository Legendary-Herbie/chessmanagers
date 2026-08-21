import { describe, expect, it } from 'vitest';
import { chooseSelectedClubId, isSelectableClub } from './clubSelection.js';

function entry(id, membershipStatus = 'ACTIVE_MEMBER', clubStatus = 'active') {
    return {
        club: { id, name: id, status: clubStatus },
        membership: { role: 'member', status: membershipStatus },
    };
}

describe('club selection', () => {
    it('prefers an explicitly requested active club over stored state', () => {
        const entries = [entry('club_a'), entry('club_b')];
        expect(chooseSelectedClubId(entries, {
            preferredId: 'club_b',
            storedId: 'club_a',
        })).toBe('club_b');
    });

    it('uses a valid stored preference and falls back deterministically', () => {
        const entries = [entry('club_a'), entry('club_b')];
        expect(chooseSelectedClubId(entries, { storedId: 'club_b' })).toBe('club_b');
        expect(chooseSelectedClubId(entries, { storedId: 'club_missing' })).toBe('club_a');
    });

    it('never selects revoked memberships or archived clubs', () => {
        const revoked = entry('club_revoked', 'REVOKED');
        const archived = entry('club_archived', 'ACTIVE_MEMBER', 'archived');
        expect(isSelectableClub(revoked)).toBe(false);
        expect(isSelectableClub(archived)).toBe(false);
        expect(chooseSelectedClubId([revoked, archived])).toBeNull();
    });
});
