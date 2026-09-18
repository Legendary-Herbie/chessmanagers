import { Router } from 'express';
import { z } from 'zod';
import {
    dismissAllUserNotifications,
    dismissUserNotification,
    getUserUnreadCount,
    listUserNotifications,
    readAllUserNotifications,
    readUserNotification,
} from '../controllers/notificationController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';

const router = Router();
const optionalClubId = z.string().min(1).optional();
const listQuery = z.object({
    clubId: optionalClubId,
    unreadOnly: z.enum(['true', 'false']).transform(value => value === 'true').default('false'),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
}).strict();
const unreadQuery = z.object({ clubId: optionalClubId }).strict();
const readParams = z.object({ notificationId: z.string().min(1) }).strict();
const readAllBody = z.object({ clubId: optionalClubId }).strict();

router.use(requireAuth);
router.get('/', validateRequest({ query: listQuery }), listUserNotifications);
router.delete('/', validateRequest({ query: z.object({}).strict() }), dismissAllUserNotifications);
router.get('/unread-count', validateRequest({ query: unreadQuery }), getUserUnreadCount);
router.patch('/read', validateRequest({ body: readAllBody }), readAllUserNotifications);
router.patch('/:notificationId/read', validateRequest({ params: readParams }), readUserNotification);
router.delete('/:notificationId', validateRequest({ params: readParams }), dismissUserNotification);

export default router;
