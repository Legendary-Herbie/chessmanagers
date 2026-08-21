import { Router } from 'express';
import { z } from 'zod';
import {
    archiveClubAnnouncement,
    createClubAnnouncement,
    deleteAnnouncementAttachment,
    deleteClubAnnouncement,
    downloadAnnouncementAttachment,
    getClubAnnouncement,
    listClubAnnouncements,
    publishClubAnnouncement,
    updateClubAnnouncement,
    uploadAnnouncementAttachment,
} from '../controllers/announcementController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadSingleAttachment } from '../middleware/attachmentUpload.js';
import { loadClubContext, requireActiveClubMember, requireClubAdmin } from '../middleware/requireRole.js';
import { validate, validateRequest } from '../middleware/validate.js';

const router = Router({ mergeParams: true });
const id = z.string().trim().min(1).max(200);
const clubParams = z.object({ clubId: id }).strict();
const announcementParams = z.object({ clubId: id, announcementId: id }).strict();
const attachmentParams = z.object({ clubId: id, announcementId: id, attachmentId: id }).strict();
const content = z.object({
    title: z.string().trim().min(1).max(200),
    contentHtml: z.string().min(1).max(100_000),
}).strict();
const listQuery = z.object({
    status: z.enum(['draft', 'published', 'archived']).optional(),
    q: z.string().trim().max(200).default(''),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
}).strict();
const emptyBody = z.object({}).strict();

router.use(requireAuth, validateRequest({ params: clubParams }), loadClubContext, requireActiveClubMember);
router.get('/', validateRequest({ query: listQuery }), listClubAnnouncements);
router.post('/', requireClubAdmin, validate(content), createClubAnnouncement);
router.get('/:announcementId', validateRequest({ params: announcementParams }), getClubAnnouncement);
router.patch('/:announcementId', validateRequest({ params: announcementParams }), requireClubAdmin, validate(content), updateClubAnnouncement);
router.post('/:announcementId/publish', validateRequest({ params: announcementParams }), requireClubAdmin, validate(emptyBody), publishClubAnnouncement);
router.post('/:announcementId/archive', validateRequest({ params: announcementParams }), requireClubAdmin, validate(emptyBody), archiveClubAnnouncement);
router.delete('/:announcementId', validateRequest({ params: announcementParams }), requireClubAdmin, validate(emptyBody), deleteClubAnnouncement);
router.post('/:announcementId/attachments', validateRequest({ params: announcementParams }), requireClubAdmin, uploadSingleAttachment, uploadAnnouncementAttachment);
router.get('/:announcementId/attachments/:attachmentId', validateRequest({ params: attachmentParams }), downloadAnnouncementAttachment);
router.delete('/:announcementId/attachments/:attachmentId', validateRequest({ params: attachmentParams }), requireClubAdmin, validate(emptyBody), deleteAnnouncementAttachment);

export default router;
