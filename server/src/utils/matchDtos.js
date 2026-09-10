// Canonical match properties are camelCase. Legacy database-column properties
// remain during the API transition so external consumers are not broken.
export function toMatchDto(match) {
    if (!match) return null;
    const { white_rating_before, white_rating_after, black_rating_before, black_rating_after,
        ratings_pending, ...record } = match;
    const hasSnapshots = [white_rating_before, white_rating_after, black_rating_before, black_rating_after]
        .every(value => typeof value === 'number' && Number.isFinite(value));
    const status = !match.is_rated ? 'unrated' : match.status !== 'active' ? 'excluded'
        : ratings_pending ? 'pending' : hasSnapshots ? 'applied' : 'unavailable';
    const snapshot = (before, after) => ({ before, after, change: after - before });
    return {
        ...record,
        ratings: {
            status,
            white: status === 'applied' ? snapshot(white_rating_before, white_rating_after) : null,
            black: status === 'applied' ? snapshot(black_rating_before, black_rating_after) : null,
        },
        clubId: match.club_id,
        whitePlayerId: match.white_player_id,
        blackPlayerId: match.black_player_id,
        whitePlayerName: match.white_player_name,
        blackPlayerName: match.black_player_name,
        ratingCategory: match.rating_category,
        isRated: match.is_rated,
        tournamentId: match.tournament_id,
        playedAt: match.played_at,
        voidReason: match.void_reason,
        voidedAt: match.voided_at,
        deleteReason: match.delete_reason,
        createdAt: match.created_at,
        updatedAt: match.updated_at,
    };
}
