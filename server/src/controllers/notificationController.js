import {
    getUnreadCount,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
} from '../services/NotificationService.js';

export async function listUserNotifications(req, res, next) {
    try {
        res.json(await listNotifications(req.user.id, req.validatedQuery));
    } catch (error) {
        next(error);
    }
}

export async function getUserUnreadCount(req, res, next) {
    try {
        res.json({ count: await getUnreadCount(req.user.id, req.validatedQuery.clubId) });
    } catch (error) {
        next(error);
    }
}

export async function readUserNotification(req, res, next) {
    try {
        const notification = await markNotificationRead(req.user.id, req.validatedParams.notificationId);
        if (!notification) return res.status(404).json({ error: 'Notification not found.' });
        return res.json({ notification: { id: notification.id, readAt: notification.read_at } });
    } catch (error) {
        return next(error);
    }
}

export async function readAllUserNotifications(req, res, next) {
    try {
        const updated = await markAllNotificationsRead(req.user.id, req.validated.clubId);
        res.json({ updated });
    } catch (error) {
        next(error);
    }
}
