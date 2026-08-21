export const REJECTION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function rejectionCooldownEndsAt(rejectedAt) {
    if (!rejectedAt) return null;
    return new Date(new Date(rejectedAt).getTime() + REJECTION_COOLDOWN_MS);
}

export function evaluateJoinEligibility(membership, { direct = false, now = new Date() } = {}) {
    if (!membership) return { allowed: true };

    switch (membership.status) {
        case 'ACTIVE_MEMBER':
            return { allowed: false, code: 'ALREADY_MEMBER' };
        case 'PENDING_APPROVAL':
            return direct
                ? { allowed: true }
                : { allowed: false, code: 'DUPLICATE_PENDING' };
        case 'REJECTED': {
            const eligibleAt = rejectionCooldownEndsAt(membership.rejected_at);
            if (eligibleAt && eligibleAt > now) {
                return { allowed: false, code: 'REJECTION_COOLDOWN', eligibleAt };
            }
            return { allowed: true };
        }
        case 'REVOKED':
            return { allowed: true };
        default:
            return { allowed: false, code: 'INVALID_MEMBERSHIP_STATE' };
    }
}
