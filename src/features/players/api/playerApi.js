import { api, endpoints } from '../../../config/api.js';

export const playerApi = {
    searchPlayers: async (clubId, { q = '', limit = 20, offset = 0, signal } = {}) => {
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (q) params.set('q', q);
        return await api.get(`${endpoints.players.list(clubId)}?${params}`, { signal });
    },

    fetchPlayers: async (clubId, { q = '', limit = 50, offset = 0, signal } = {}) => {
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (q) params.set('q', q);
        const data = await api.get(`${endpoints.players.list(clubId)}?${params}`, { signal });
        return data.players;
    },

    fetchRosterSummary: async (clubId, options = {}) => {
        const data = await api.get(endpoints.players.summary(clubId), options);
        return data.summary;
    },

    fetchPlayer: async (clubId, playerId, options = {}) => {
        const data = await api.get(endpoints.players.byId(clubId, playerId), options);
        return data.player;
    },

    fetchInactivePlayers: async (clubId, options = {}) => {
        const data = await api.get(endpoints.players.inactive(clubId), options);
        return data.players;
    },

    createPlayer: async (clubId, player) => {
        const data = await api.post(endpoints.players.list(clubId), player);
        return data.player;
    },

    createPlayersBulk: async (clubId, players) => {
        const data = await api.post(endpoints.players.bulk(clubId), { players });
        return data.players;
    },

    updatePlayer: async (clubId, playerId, changes) => {
        const data = await api.patch(endpoints.players.byId(clubId, playerId), changes);
        return data.player;
    },

    updateOwnProfile: async (clubId, playerId, changes) => {
        const data = await api.patch(endpoints.players.profile(clubId, playerId), changes);
        return data.player;
    },

    uploadPhoto: async (clubId, playerId, file) => {
        const formData = new FormData();
        formData.append('image', file);
        const data = await api.upload(endpoints.players.photo(clubId, playerId), formData);
        return data.player;
    },

    archivePlayer: async (clubId, playerId) => {
        const data = await api.patch(endpoints.players.archive(clubId, playerId), {});
        return data.player;
    },

    restorePlayer: async (clubId, playerId) => {
        const data = await api.patch(endpoints.players.restore(clubId, playerId), {});
        return data.player;
    },

    deletePlayer: async (clubId, playerId) => {
        return await api.delete(endpoints.players.byId(clubId, playerId));
    },

    claimPlayer: async (clubId, playerId) => {
        const data = await api.post(endpoints.players.claim(clubId, playerId), {});
        return data.link;
    },

    unlinkPlayer: async (clubId, playerId, reason = null) => {
        return await api.delete(endpoints.players.unlink(clubId, playerId), { reason });
    },

    fetchPendingLinks: async (clubId) => {
        const data = await api.get(endpoints.links.pending(clubId));
        return data.links;
    },

    approveLink: async (clubId, linkId) => {
        const data = await api.patch(endpoints.links.approve(clubId, linkId), {});
        return data.link;
    },

    rejectLink: async (clubId, linkId, reason = null) => {
        const data = await api.patch(endpoints.links.reject(clubId, linkId), { reason });
        return data.link;
    },

    fetchMatches: async (clubId, playerId, options = {}) => {
        const data = await api.get(endpoints.players.matches(clubId, playerId), options);
        return data.matches;
    },

    fetchRatingHistory: async (clubId, playerId, category = 'blitz', options = {}) => {
        const data = await api.get(
            `${endpoints.players.ratingHistory(clubId, playerId)}?category=${category}`,
            options
        );
        return data.history;
    },

    fetchStatistics: async (clubId, playerId, options = {}) => {
        const data = await api.get(endpoints.players.statistics(clubId, playerId), options);
        return data.statistics;
    },

    fetchHeadToHead: async (clubId, playerAId, playerBId, options = {}) => {
        const data = await api.get(
            endpoints.players.headToHeadSummary(clubId, playerAId, playerBId),
            options
        );
        return data.headToHead;
    },
    fetchHeadToHeadMatches: async (clubId, playerAId, playerBId, options = {}) => {
        const data = await api.get(
            endpoints.players.headToHead(clubId, playerAId, playerBId),
            options
        );
        return data.matches;
    },
};
