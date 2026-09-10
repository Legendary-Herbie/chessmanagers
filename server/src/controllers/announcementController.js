import {
    addAttachmentRecord,
    archiveAnnouncement,
    createAnnouncement,
    deleteAnnouncement,
    deleteAttachment,
    getAnnouncement,
    getAttachmentAccess,
    listAnnouncements,
    publishAnnouncement,
    updateAnnouncement,
    recordAnnouncementView,
} from '../services/AnnouncementService.js';
import {
    removeAttachment,
    resolveAttachmentPath,
    storeAttachment,
} from '../services/AttachmentStorageService.js';

const canManage = req => Boolean(req.clubContext.capabilities.canManageAnnouncements);

function sendFailure(res, result) {
    const failures = {
        ANNOUNCEMENT_NOT_FOUND: [404, 'Announcement not found.'],
        ANNOUNCEMENT_ARCHIVED: [409, 'Archived announcements cannot be changed.'],
        ANNOUNCEMENT_NOT_DRAFT: [409, 'Only draft announcements can be published.'],
        ANNOUNCEMENT_NOT_PUBLISHED: [409, 'Only published announcements can be archived.'],
        ATTACHMENT_NOT_FOUND: [404, 'Attachment not found.'],
    };
    const [status, message] = failures[result.code] ?? [400, 'Announcement operation failed.'];
    return res.status(status).json({ error: message, code: result.code });
}

export async function listClubAnnouncements(req, res, next) {
    try {
        res.json(await listAnnouncements(req.params.clubId, {
            ...req.validatedQuery,
            canManage: canManage(req),
        }));
    } catch (error) { next(error); }
}

export async function getClubAnnouncement(req, res, next) {
    try {
        const announcement = await getAnnouncement({
            clubId: req.params.clubId,
            announcementId: req.params.announcementId,
            canManage: canManage(req),
        });
        if (!announcement) return res.status(404).json({ error: 'Announcement not found.' });
        return res.json({ announcement });
    } catch (error) { return next(error); }
}

export async function viewClubAnnouncement(req, res, next) {
    try {
        const result = await recordAnnouncementView({ clubId: req.params.clubId, announcementId: req.params.announcementId, userId: req.user.id });
        if (!result) return res.status(404).json({ error: 'Published announcement not found.' });
        return res.json(result);
    } catch (error) { return next(error); }
}

export async function createClubAnnouncement(req, res, next) {
    try {
        const announcement = await createAnnouncement({
            clubId: req.params.clubId,
            actorUserId: req.user.id,
            ...req.validated,
        });
        res.status(201).json({ announcement });
    } catch (error) { next(error); }
}

export async function updateClubAnnouncement(req, res, next) {
    try {
        const result = await updateAnnouncement({
            clubId: req.params.clubId,
            announcementId: req.params.announcementId,
            actorUserId: req.user.id,
            ...req.validated,
        });
        if (!result.ok) return sendFailure(res, result);
        return res.json({ announcement: result.announcement });
    } catch (error) { return next(error); }
}

export async function publishClubAnnouncement(req, res, next) {
    try {
        const result = await publishAnnouncement({
            clubId: req.params.clubId,
            announcementId: req.params.announcementId,
            actorUserId: req.user.id,
        });
        if (!result.ok) return sendFailure(res, result);
        return res.json({ announcement: result.announcement, alreadyPublished: result.alreadyPublished });
    } catch (error) { return next(error); }
}

export async function archiveClubAnnouncement(req, res, next) {
    try {
        const result = await archiveAnnouncement({
            clubId: req.params.clubId,
            announcementId: req.params.announcementId,
            actorUserId: req.user.id,
        });
        if (!result.ok) return sendFailure(res, result);
        return res.json({ announcement: result.announcement });
    } catch (error) { return next(error); }
}

export async function deleteClubAnnouncement(req, res, next) {
    try {
        const result = await deleteAnnouncement({
            clubId: req.params.clubId,
            announcementId: req.params.announcementId,
            actorUserId: req.user.id,
        });
        if (!result.ok) return sendFailure(res, result);
        return res.status(204).send();
    } catch (error) { return next(error); }
}

export async function uploadAnnouncementAttachment(req, res, next) {
    let asset;
    try {
        asset = await storeAttachment(req.file, {
            clubId: req.params.clubId,
            announcementId: req.params.announcementId,
        });
        const result = await addAttachmentRecord({
            clubId: req.params.clubId,
            announcementId: req.params.announcementId,
            actorUserId: req.user.id,
            asset,
        });
        if (!result.ok) {
            await removeAttachment(asset.storageKey);
            return sendFailure(res, result);
        }
        return res.status(201).json({ attachment: result.attachment });
    } catch (error) {
        if (asset) await removeAttachment(asset.storageKey).catch(() => {});
        return next(error);
    }
}

export async function downloadAnnouncementAttachment(req, res, next) {
    try {
        const attachment = await getAttachmentAccess({
            clubId: req.params.clubId,
            announcementId: req.params.announcementId,
            attachmentId: req.params.attachmentId,
            canManage: canManage(req),
        });
        if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });
        res.type(attachment.content_type);
        return res.download(resolveAttachmentPath(attachment.storage_key), attachment.original_name);
    } catch (error) { return next(error); }
}

export async function deleteAnnouncementAttachment(req, res, next) {
    try {
        const result = await deleteAttachment({
            clubId: req.params.clubId,
            announcementId: req.params.announcementId,
            attachmentId: req.params.attachmentId,
            actorUserId: req.user.id,
        });
        if (!result.ok) return sendFailure(res, result);
        await removeAttachment(result.storageKey);
        return res.status(204).send();
    } catch (error) { return next(error); }
}
