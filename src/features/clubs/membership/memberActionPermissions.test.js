import { describe, expect, it } from 'vitest';
import { canRemoveClubMember } from './memberActionPermissions.js';

describe('club member action permissions', () => {
    it('never offers removal for the club owner', () => {
        expect(canRemoveClubMember({ userId: 'owner_1', role: 'owner' }, 'admin_1')).toBe(false);
    });

    it('does not offer removal for the signed-in administrator', () => {
        expect(canRemoveClubMember({ userId: 'admin_1', role: 'admin' }, 'admin_1')).toBe(false);
    });

    it('offers removal for another non-owner member', () => {
        expect(canRemoveClubMember({ userId: 'member_1', role: 'member' }, 'admin_1')).toBe(true);
    });
});
