export function toPublicClub(club) {
    return {
        id: club.id,
        name: club.name,
        slug: club.slug,
        federation: club.federation,
        description: club.description,
        logo: club.logo,
        contact_info: club.contact_info,
        public_leaderboard: club.public_leaderboard,
        visibility: club.visibility,
        status: club.status,
        created_at: club.created_at,
    };
}

export function toPublicClubPresentation(club) {
    const settings = club.settings_json || {};
    return {
        id: club.id,
        name: club.name,
        slug: club.slug,
        federation: club.federation,
        description: club.description,
        logo: club.logo,
        contactInfo: club.contact_info,
        contacts: settings.contacts || {},
        affiliation: settings.affiliation || null,
        primaryColor: settings.presentation?.primaryColor || null,
        publicLeaderboard: Boolean(club.public_leaderboard),
        visibility: 'public',
    };
}

export function toPrivateClubPresentation(club) {
    return { id: club.id, name: club.name, logo: club.logo, visibility: 'private' };
}

export function toRatingSettings(rows = []) {
    return Object.fromEntries(rows.map(row => [row.category, {
        initialRating: row.initial_rating,
        ratingFloor: row.rating_floor,
        establishedKFactor: row.established_k_factor,
        provisionalKFactor: row.provisional_k_factor,
        provisionalGames: row.provisional_games,
    }]));
}

export function toClubContextClub(club, ratingRows = []) {
    return {
        ...toPublicClub(club),
        owner_id: club.owner_id,
        settings_json: club.settings_json,
        rating_settings: toRatingSettings(ratingRows),
        archived_at: club.archived_at,
        updated_at: club.updated_at,
    };
}

export function toPublicPlayer(player) {
    return {
        publicPlayerId: player.public_id,
        name: player.name,
        bio: player.bio,
        photoUrl: player.photo_url,
        ratings: {
            blitz: player.blitz_rating,
            rapid: player.rapid_rating,
            classical: player.classical_rating,
        },
    };
}

export function toPublicTournament(tournament) {
    return {
        id: tournament.id,
        name: tournament.name,
        type: tournament.type,
        status: tournament.status,
        startDate: tournament.start_date,
        endDate: tournament.end_date,
        ratingCategory: tournament.rating_category,
        isRated: tournament.is_rated,
    };
}
