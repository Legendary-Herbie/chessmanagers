export function isSelectableClub(entry) {
    return Boolean(
        entry?.club?.id
        && entry.membership?.status === 'ACTIVE_MEMBER'
        && entry.club.status === 'active'
    );
}

export function chooseSelectedClubId(entries, { preferredId = null, storedId = null } = {}) {
    const activeIds = new Set(entries.filter(isSelectableClub).map(entry => entry.club.id));

    if (preferredId && activeIds.has(preferredId)) return preferredId;
    if (storedId && activeIds.has(storedId)) return storedId;
    return entries.find(isSelectableClub)?.club.id ?? null;
}
