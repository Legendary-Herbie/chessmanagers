import { api, endpoints } from '../../../config/api.js';

export const clubApi = {
    create: (values) => api.post(endpoints.clubs.create(), values),
    fetchPresentation: async (clubId, options = {}) => {
        const data = await api.get(endpoints.clubs.byId(clubId), options);
        return data.club;
    },
    listPublic: ({ q = '', limit = 20, offset = 0 } = {}, options = {}) => {
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (q) params.set('q', q);
        return api.get(`${endpoints.clubs.list()}?${params}`, options);
    },
    fetchMemberships: (options = {}) => api.get(endpoints.clubs.mine(), options),
    fetchContext: (clubId, options = {}) => api.get(endpoints.clubs.context(clubId), options),
    fetchMembers: async (clubId, options = {}) => {
        const data = await api.get(endpoints.clubs.members(clubId), options);
        return data.members;
    },
    fetchInvites: async (clubId, options = {}) => {
        const data = await api.get(endpoints.clubs.invites(clubId), options);
        return data.invites;
    },
    createInvite: async (clubId) => {
        const data = await api.post(endpoints.clubs.invites(clubId), {});
        return data.invite;
    },
    revokeInvite: (clubId, inviteId) => api.delete(endpoints.clubs.invite(clubId, inviteId)),
    fetchJoinRequests: async (clubId, options = {}) => {
        const data = await api.get(endpoints.clubs.joinRequests(clubId), options);
        return data.requests;
    },
    approveJoinRequest: (clubId, requestId) => api.patch(
        endpoints.clubs.joinRequest(clubId, requestId, 'approve'), {}
    ),
    rejectJoinRequest: (clubId, requestId, reason) => api.patch(
        endpoints.clubs.joinRequest(clubId, requestId, 'reject'), reason ? { reason } : {}
    ),
    update: (clubId, changes) => api.patch(endpoints.clubs.byId(clubId), changes),
    uploadBadge: (clubId, file) => {
        const formData = new FormData();
        formData.append('image', file);
        return api.upload(endpoints.clubs.badge(clubId), formData);
    },
    setMemberRole: (clubId, userId, role) => api.patch(endpoints.clubs.memberRole(clubId, userId), { role }),
    transferOwnership: (clubId, input) => api.post(endpoints.clubs.ownership(clubId), input),
    archive: (clubId, reason) => api.post(endpoints.clubs.archive(clubId), reason ? { reason } : {}),
    restore: (clubId, reason) => api.post(endpoints.clubs.restore(clubId), reason ? { reason } : {}),
    delete: (clubId, reason) => api.delete(endpoints.clubs.byId(clubId), reason ? { reason } : {}),
    requestJoin: (clubId, message) => api.post(endpoints.clubs.join(clubId), message ? { message } : {}),
    acceptInvite: (token) => api.post(endpoints.clubs.joinByToken(), { token }),
    joinByCode: (code) => api.post(endpoints.clubs.joinByCode(), { code }),
    leave: (clubId, reason) => api.post(endpoints.clubs.leave(clubId), reason ? { reason } : {}),
    revokeMember: (clubId, userId, reason) => api.delete(
        endpoints.clubs.member(clubId, userId),
        reason ? { reason } : {},
    ),
    getJoinCode: (clubId) => api.get(endpoints.clubs.joinCode(clubId)),
    rotateJoinCode: (clubId) => api.post(endpoints.clubs.rotateJoinCode(clubId), {}),
    revokeJoinCode: (clubId) => api.delete(endpoints.clubs.joinCode(clubId)),
};
