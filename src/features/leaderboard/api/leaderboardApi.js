import { api, endpoints } from '../../../config/api.js';

function withQuery(path, query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
        if (value !== '' && value !== undefined && value !== null) params.set(key, String(value));
    });
    return `${path}?${params.toString()}`;
}

export const leaderboardApi = {
    fetchLeaderboard: async (clubId, query) => {
        const data = await api.get(withQuery(endpoints.leaderboard.list(clubId), query));
        return data.leaderboard;
    },
    fetchDashboard: async (clubId, category) => {
        const data = await api.get(withQuery(endpoints.leaderboard.dashboard(clubId), { category }));
        return data.dashboard;
    },
    fetchStats: async (clubId, options = {}) => {
        const data = await api.get(endpoints.leaderboard.stats(clubId), options);
        return data.stats;
    },
    fetchPublicLeaderboard: async (clubId, query, options = {}) => {
        const data = await api.get(withQuery(endpoints.public.leaderboard(clubId), query), options);
        return data.leaderboard;
    },
};
