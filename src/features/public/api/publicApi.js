import { api, endpoints } from '../../../config/api.js';

export const publicApi = {
    fetchPlayer: async (clubId, publicPlayerId, options = {}) => {
        const data = await api.get(endpoints.public.player(clubId, publicPlayerId), options);
        return data.player;
    },
    fetchTournament: (clubId, tournamentId, options = {}) => api.get(
        endpoints.public.tournament(clubId, tournamentId), options
    ),
};
