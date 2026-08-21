import { API_BASE, api, endpoints, getToken } from '../../../config/api.js';

function queryString(values) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    }
    const encoded = query.toString();
    return encoded ? `?${encoded}` : '';
}

export const announcementApi = {
    list: (clubId, options = {}) => api.get(
        `${endpoints.announcements.list(clubId)}${queryString(options)}`
    ),
    get: (clubId, announcementId) => api.get(endpoints.announcements.byId(clubId, announcementId)),
    create: (clubId, values) => api.post(endpoints.announcements.list(clubId), values),
    update: (clubId, announcementId, values) => api.patch(
        endpoints.announcements.byId(clubId, announcementId), values
    ),
    publish: (clubId, announcementId) => api.post(
        endpoints.announcements.publish(clubId, announcementId), {}
    ),
    archive: (clubId, announcementId) => api.post(
        endpoints.announcements.archive(clubId, announcementId), {}
    ),
    delete: (clubId, announcementId) => api.delete(
        endpoints.announcements.byId(clubId, announcementId)
    ),
    uploadAttachment: (clubId, announcementId, file) => {
        const formData = new FormData();
        formData.append('attachment', file);
        return api.upload(endpoints.announcements.attachments(clubId, announcementId), formData);
    },
    deleteAttachment: (clubId, announcementId, attachmentId) => api.delete(
        endpoints.announcements.attachment(clubId, announcementId, attachmentId)
    ),
    fetchAttachment: async (clubId, announcementId, attachmentId) => {
        const response = await fetch(
            `${API_BASE}${endpoints.announcements.attachment(clubId, announcementId, attachmentId)}`,
            {
                credentials: 'include',
                headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
            }
        );
        if (!response.ok) throw new Error('Attachment could not be downloaded.');
        return response.blob();
    },
};
