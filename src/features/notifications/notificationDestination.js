export function notificationDestination(notification) {
    const payload = notification.payload || {};
    if (notification.eventType === 'membership.request_pending') return '/dashboard';
    if (notification.eventType === 'join_request.rejected') return `/clubs/${notification.clubId}`;
    if (notification.eventType === 'join_request.approved') return '/dashboard';
    if (notification.eventType === 'player_claim.pending') return '/players';
    if (notification.eventType.startsWith('player_') && payload.playerId) return `/players/${payload.playerId}`;
    if (notification.eventType.startsWith('match.')) return '/matches';
    if (notification.eventType.startsWith('tournament.') && payload.tournamentId) return `/tournaments/${payload.tournamentId}`;
    if (notification.eventType === 'announcement.published' && payload.announcementId) return `/announcements/${payload.announcementId}`;
    return '/dashboard';
}
