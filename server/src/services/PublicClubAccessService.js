import { ClubModel } from '../models/Club.js';

function isActive(club) {
    return Boolean(club && club.status === 'active' && !club.deleted_at);
}

export const PublicClubAccessService = {
    getDirectPresentation: async (clubId) => {
        const club = await ClubModel.findById(clubId);
        return isActive(club) ? club : null;
    },

    getPublicClub: async (clubId) => {
        const club = await ClubModel.findById(clubId);
        return isActive(club) && club.visibility === 'public' ? club : null;
    },
};
