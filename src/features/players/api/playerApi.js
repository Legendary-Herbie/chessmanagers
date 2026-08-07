import { api, endpoints } from '../../../config/api.js';

export const playerApi = {
    fetchPlayers: async (clubId) => {
        const data = await api.get(endpoints.players.list(clubId));
        return data.players || [];
    },

    fetchPlayer: async (clubId, playerId) => {
        const data = await api.get(endpoints.players.byId(clubId, playerId));
        return data.player || null;
    },

    createPlayer: async (clubId, { name, rating, bio }) => {
        const data = await api.post(endpoints.players.list(clubId), { name, rating, bio });
        return data.player;
    },

    createPlayersBulk: async (clubId, players) => {
        const data = await api.post(endpoints.players.bulk(clubId), { players });
        return data.players || [];
    },

    updatePlayer: async (clubId, playerId, { name, bio }) => {
        const data = await api.patch(endpoints.players.byId(clubId, playerId), { name, bio });
        return data.player;
    },

    deletePlayer: async (clubId, playerId) => {
        return await api.delete(endpoints.players.byId(clubId, playerId));
    },

    claimPlayer: async (clubId, playerId) => {
        const data = await api.post(endpoints.players.claim(clubId, playerId), {});
        return data.link;
    },

    unlinkPlayer: async (clubId, playerId, userId) => {
        return await api.delete(endpoints.players.unlink(clubId, playerId), { userId });
    },

    fetchPendingLinks: async (clubId) => {
        const data = await api.get(endpoints.links.pending(clubId));
        return data.links || [];
    },

    approveLink: async (clubId, linkId) => {
        const data = await api.patch(endpoints.links.approve(clubId, linkId), {});
        return data.link;
    },

    rejectLink: async (clubId, linkId) => {
        const data = await api.patch(endpoints.links.reject(clubId, linkId), {});
        return data.link;
    },

    fetchMatches: async (clubId, playerId) => {
        const data = await api.get(endpoints.players.matches(clubId, playerId));
        return data.matches || [];
    },

    fetchRatingHistory: async (clubId, playerId) => {
        const data = await api.get(endpoints.players.ratingHistory(clubId, playerId));
        return data.history || data.ratingHistory || [];
    },

    fetchHeadToHead: async (clubId, playerAId, playerBId) => {
        const data = await api.get(endpoints.leaderboard.headToHead(clubId, playerAId, playerBId));
        return data.summary || null;
    },
};
