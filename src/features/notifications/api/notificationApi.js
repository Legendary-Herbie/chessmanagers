import { api, endpoints } from '../../../config/api.js';

function queryString(values) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    }
    const encoded = query.toString();
    return encoded ? `?${encoded}` : '';
}

export const notificationApi = {
    list: (options = {}) => api.get(`${endpoints.notifications.list()}${queryString(options)}`),
    unreadCount: (clubId = null) => api.get(
        `${endpoints.notifications.unreadCount()}${queryString({ clubId })}`
    ),
    markRead: notificationId => api.patch(endpoints.notifications.markRead(notificationId), {}),
    markAllRead: (clubId = null) => api.patch(endpoints.notifications.markAllRead(), {
        ...(clubId ? { clubId } : {}),
    }),
};
