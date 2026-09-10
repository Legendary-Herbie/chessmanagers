import { api, endpoints } from '../../../config/api.js';

export const tournamentApi = {
    list: (clubId, { q = '', status = '', limit = 50, offset = 0 } = {}) => {
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (q) params.set('q', q);
        if (status) params.set('status', status);
        return api.get(`${endpoints.tournaments.list(clubId)}?${params}`);
    },
    get: (clubId, tournamentId) => api.get(endpoints.tournaments.byId(clubId, tournamentId)),
    create: (clubId, payload) => api.post(endpoints.tournaments.list(clubId), payload),
    setup: (clubId, tournamentId, payload) => api.post(`${endpoints.tournaments.byId(clubId, tournamentId)}/setup`, payload),
    update: (clubId, tournamentId, payload) => api.patch(
        endpoints.tournaments.byId(clubId, tournamentId), payload
    ),
    setStatus: (clubId, tournamentId, status) => api.patch(
        endpoints.tournaments.status(clubId, tournamentId), { status }
    ),
    archive: (clubId, tournamentId, reason = null) => api.post(
        `${endpoints.tournaments.byId(clubId, tournamentId)}/archive`, { reason }
    ),
    delete: (clubId, tournamentId, reason = null) => api.delete(
        endpoints.tournaments.byId(clubId, tournamentId), { reason, permanent: true }
    ),
    addPlayer: (clubId, tournamentId, playerId) => api.post(
        endpoints.tournaments.players(clubId, tournamentId), { playerId }
    ),
    removePlayer: (clubId, tournamentId, playerId) => api.delete(
        endpoints.tournaments.player(clubId, tournamentId, playerId)
    ),
    withdrawPlayer: (clubId, tournamentId, playerId) => api.patch(
        endpoints.tournaments.withdraw(clubId, tournamentId, playerId), {}
    ),
    generateRound: (clubId, tournamentId) => api.post(
        endpoints.tournaments.rounds(clubId, tournamentId), {}
    ),
    recordResult: (clubId, tournamentId, pairingId, payload) => api.post(
        endpoints.tournaments.result(clubId, tournamentId, pairingId), payload
    ),
};
