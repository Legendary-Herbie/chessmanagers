import { describe, expect, it } from 'vitest';
import {
    evaluateJoinEligibility,
    rejectionCooldownEndsAt,
} from '../utils/membershipPolicy.js';

describe('membership policy', () => {
    const now = new Date('2026-08-17T12:00:00.000Z');

    it('blocks rejected users until the exact seven-day boundary', () => {
        const rejectedAt = new Date('2026-08-10T12:00:00.001Z');
        const blocked = evaluateJoinEligibility({ status: 'REJECTED', rejected_at: rejectedAt }, { now });
        expect(blocked).toMatchObject({ allowed: false, code: 'REJECTION_COOLDOWN' });
        expect(blocked.eligibleAt.toISOString()).toBe('2026-08-17T12:00:00.001Z');

        const eligible = evaluateJoinEligibility({
            status: 'REJECTED',
            rejected_at: new Date('2026-08-10T12:00:00.000Z'),
        }, { now });
        expect(eligible).toEqual({ allowed: true });
    });

    it('allows direct invitations to resolve pending requests but not active memberships', () => {
        expect(evaluateJoinEligibility({ status: 'PENDING_APPROVAL' }, { direct: true, now }))
            .toEqual({ allowed: true });
        expect(evaluateJoinEligibility({ status: 'PENDING_APPROVAL' }, { direct: false, now }))
            .toMatchObject({ allowed: false, code: 'DUPLICATE_PENDING' });
        expect(evaluateJoinEligibility({ status: 'ACTIVE_MEMBER' }, { direct: true, now }))
            .toMatchObject({ allowed: false, code: 'ALREADY_MEMBER' });
    });

    it('calculates a stable rejection cooldown end', () => {
        expect(rejectionCooldownEndsAt('2026-08-01T00:00:00.000Z').toISOString())
            .toBe('2026-08-08T00:00:00.000Z');
    });
});
