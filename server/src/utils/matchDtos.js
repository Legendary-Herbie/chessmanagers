// Canonical match properties are camelCase. Legacy database-column properties
// remain during the API transition so external consumers are not broken.
export function toMatchDto(match) {
    if (!match) return null;
    return {
        ...match,
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
