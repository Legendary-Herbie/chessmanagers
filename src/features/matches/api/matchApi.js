import { api, endpoints } from '../../../config/api.js';

export const matchApi = {
    list: async (clubId, { q = '', limit = 50, offset = 0 } = {}) => {
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (q) params.set('q', q);
        const data = await api.get(`${endpoints.matches.list(clubId)}?${params}`);
        return data.matches;
    },
    create: (clubId, payload) => api.post(endpoints.matches.list(clubId), payload),
    update: (clubId, matchId, payload) => api.patch(
        endpoints.matches.byId(clubId, matchId), payload
    ),
    void: (clubId, matchId, reason) => api.post(
        endpoints.matches.void(clubId, matchId), { reason }
    ),
    delete: (clubId, matchId, reason = null) => api.delete(
        endpoints.matches.byId(clubId, matchId), { reason }
    ),
};
