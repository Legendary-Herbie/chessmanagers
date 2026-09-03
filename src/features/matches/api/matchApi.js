import { api, endpoints } from '../../../config/api.js';

export const matchApi = {
    list: async (clubId, { signal, ...query } = {}) => {
        const params = new URLSearchParams();
        Object.entries(query).forEach(([key, value]) => {
            if (value !== '' && value !== undefined && value !== null) params.set(key, String(value));
        });
        return api.get(`${endpoints.matches.list(clubId)}?${params}`, { signal });
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
