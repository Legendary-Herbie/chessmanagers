export function getClubCapabilities(role) {
    const isAdmin = role === 'owner' || role === 'admin';
    const isOwner = role === 'owner';

    return {
        canManagePlayers: isAdmin,
        canManageMatches: isAdmin,
        canManageTournaments: isAdmin,
        canManageAnnouncements: isAdmin,
        canManageMemberships: isAdmin,
        canExportData: isAdmin,
        canManageClubSettings: isOwner,
        canManageAdmins: isOwner,
        canTransferOwnership: isOwner,
        canCloseClub: isOwner,
    };
}
