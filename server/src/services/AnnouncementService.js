import sanitizeHtmlLibrary from 'sanitize-html';
import db from '../database/database.js';
import { notifyClubMembers } from './NotificationService.js';

const ALLOWED_TAGS = [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li',
    'blockquote', 'h2', 'h3', 'h4', 'a', 'code', 'pre',
];

export function sanitizeAnnouncementHtml(value) {
    const contentHtml = sanitizeHtmlLibrary(value, {
        allowedTags: ALLOWED_TAGS,
        allowedAttributes: { a: ['href', 'target', 'rel'] },
        allowedSchemes: ['http', 'https', 'mailto'],
        allowProtocolRelative: false,
        transformTags: {
            a: (_tagName, attribs) => ({
                tagName: 'a',
                attribs: {
                    ...attribs,
                    ...(attribs.target === '_blank'
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {}),
                },
            }),
        },
    }).trim();
    const contentText = sanitizeHtmlLibrary(contentHtml, {
        allowedTags: [],
        allowedAttributes: {},
    }).replace(/\s+/g, ' ').trim();
    if (!contentText) {
        throw Object.assign(new Error('Announcement content cannot be empty.'), { status: 400 });
    }
    return { contentHtml, contentText };
}

function dto(row, attachments = undefined) {
    const value = {
        id: row.id,
        clubId: row.club_id,
        title: row.title,
        contentHtml: row.content_html,
        contentText: row.content_text,
        status: row.status,
        publishedAt: row.published_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        authorName: row.author_name ?? null,
        viewCount: Number(row.view_count ?? 0),
    };
    if (attachments) value.attachments = attachments.map(attachmentDto);
    return value;
}

function attachmentDto(row) {
    return {
        id: row.id,
        announcementId: row.announcement_id,
        originalName: row.original_name,
        contentType: row.content_type,
        sizeBytes: row.size_bytes,
        kind: row.kind,
        createdAt: row.created_at,
        downloadUrl: `/clubs/${row.club_id}/announcements/${row.announcement_id}/attachments/${row.id}`,
    };
}

async function audit(trx, { clubId, announcementId, actorUserId, eventType, oldState = null, newState = null }) {
    await trx.query(
        `INSERT INTO announcement_audit_events
            (club_id, announcement_id, actor_user_id, event_type, old_state, new_state)
         VALUES ($1, $2, $3, $4, $5::JSONB, $6::JSONB)`,
        [clubId, announcementId, actorUserId, eventType,
            oldState ? JSON.stringify(oldState) : null,
            newState ? JSON.stringify(newState) : null]
    );
}

export async function createAnnouncement({ clubId, actorUserId, title, contentHtml }) {
    const content = sanitizeAnnouncementHtml(contentHtml);
    return db.transaction(async trx => {
        const announcement = await trx.query(
            `INSERT INTO announcements
                (club_id, title, content_html, content_text, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $5) RETURNING *`,
            [clubId, title.trim(), content.contentHtml, content.contentText, actorUserId]
        ).then(result => result.first);
        await audit(trx, {
            clubId, announcementId: announcement.id, actorUserId,
            eventType: 'announcement.created', newState: announcement,
        });
        return dto(announcement, []);
    });
}

export async function listAnnouncements(clubId, {
    canManage = false, status = null, q = '', limit = 20, offset = 0,
}) {
    const params = [clubId, canManage, status, q, limit, offset];
    const result = await db.query(
        `SELECT announcement.*, users.name AS author_name,
                (SELECT COUNT(*)::int FROM announcement_views v WHERE v.announcement_id = announcement.id) AS view_count,
                COUNT(*) OVER ()::INTEGER AS total_count
         FROM announcements announcement
         LEFT JOIN users ON users.id = announcement.created_by
         WHERE announcement.club_id = $1 AND announcement.deleted_at IS NULL
           AND ($2::BOOLEAN OR announcement.status = 'published')
           AND ($3::TEXT IS NULL OR announcement.status = $3)
           AND ($4 = '' OR announcement.title ILIKE '%' || $4 || '%'
                OR announcement.content_text ILIKE '%' || $4 || '%')
         ORDER BY CASE WHEN announcement.status = 'published' THEN announcement.published_at END DESC NULLS LAST,
                  announcement.updated_at DESC, announcement.id DESC
         LIMIT $5 OFFSET $6`,
        params
    );
    const attachments = await db.query(`SELECT * FROM announcement_attachments WHERE club_id = $1
        AND announcement_id = ANY($2::text[]) AND deleted_at IS NULL ORDER BY created_at, id`,
    [clubId, result.rows.map(row => row.id)]);
    return {
        announcements: result.rows.map(row => dto(row, attachments.rows.filter(file => file.announcement_id === row.id))),
        total: result.first?.total_count ?? 0,
        limit,
        offset,
    };
}

export async function getAnnouncement({ clubId, announcementId, canManage = false }) {
    const announcement = await db.query(
        `SELECT announcements.*, (SELECT name FROM users WHERE id = announcements.created_by) AS author_name,
            (SELECT COUNT(*)::int FROM announcement_views WHERE announcement_id = announcements.id) AS view_count
         FROM announcements
         WHERE id = $1 AND club_id = $2 AND deleted_at IS NULL
           AND ($3::BOOLEAN OR status = 'published')`,
        [announcementId, clubId, canManage]
    ).then(result => result.first);
    if (!announcement) return null;
    const attachments = await db.query(
        `SELECT * FROM announcement_attachments
         WHERE announcement_id = $1 AND club_id = $2 AND deleted_at IS NULL
         ORDER BY created_at, id`,
        [announcementId, clubId]
    ).then(result => result.rows);
    return dto(announcement, attachments);
}

export async function recordAnnouncementView({ clubId, announcementId, userId }) {
    return db.transaction(async trx => {
        const announcement = await trx.query(`SELECT id FROM announcements WHERE id = $1 AND club_id = $2
            AND status = 'published' AND deleted_at IS NULL FOR SHARE`, [announcementId, clubId]).then(r => r.first);
        if (!announcement) return null;
        await trx.query(`INSERT INTO announcement_views (club_id, announcement_id, user_id)
            VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [clubId, announcementId, userId]);
        return trx.query('SELECT COUNT(*)::int AS "viewCount" FROM announcement_views WHERE announcement_id = $1',
            [announcementId]).then(r => r.first);
    });
}

export async function updateAnnouncement({ clubId, announcementId, actorUserId, title, contentHtml }) {
    const content = sanitizeAnnouncementHtml(contentHtml);
    return db.transaction(async trx => {
        const existing = await trx.query(
            `SELECT * FROM announcements WHERE id = $1 AND club_id = $2
             AND deleted_at IS NULL FOR UPDATE`,
            [announcementId, clubId]
        ).then(result => result.first);
        if (!existing) return { ok: false, code: 'ANNOUNCEMENT_NOT_FOUND' };
        if (existing.status === 'archived') return { ok: false, code: 'ANNOUNCEMENT_ARCHIVED' };
        const updated = await trx.query(
            `UPDATE announcements SET title = $3, content_html = $4, content_text = $5,
                    updated_by = $6, updated_at = NOW()
             WHERE id = $1 AND club_id = $2 RETURNING *`,
            [announcementId, clubId, title.trim(), content.contentHtml, content.contentText, actorUserId]
        ).then(result => result.first);
        await audit(trx, {
            clubId, announcementId, actorUserId, eventType: 'announcement.updated',
            oldState: existing, newState: updated,
        });
        return { ok: true, announcement: dto(updated) };
    });
}

export async function publishAnnouncement({ clubId, announcementId, actorUserId }) {
    return db.transaction(async trx => {
        const existing = await trx.query(
            `SELECT * FROM announcements WHERE id = $1 AND club_id = $2
             AND deleted_at IS NULL FOR UPDATE`,
            [announcementId, clubId]
        ).then(result => result.first);
        if (!existing) return { ok: false, code: 'ANNOUNCEMENT_NOT_FOUND' };
        if (existing.status === 'published') {
            return { ok: true, announcement: dto(existing), alreadyPublished: true };
        }
        if (existing.status !== 'draft') return { ok: false, code: 'ANNOUNCEMENT_NOT_DRAFT' };
        const published = await trx.query(
            `UPDATE announcements SET status = 'published', published_at = NOW(),
                    published_by = $3, updated_by = $3, updated_at = NOW()
             WHERE id = $1 AND club_id = $2 RETURNING *`,
            [announcementId, clubId, actorUserId]
        ).then(result => result.first);
        await audit(trx, {
            clubId, announcementId, actorUserId, eventType: 'announcement.published',
            oldState: existing, newState: published,
        });
        await notifyClubMembers({
            trx,
            clubId,
            eventType: 'announcement.published',
            dedupeKey: `announcement:${announcementId}:published`,
            payload: { announcementId, title: published.title },
        });
        return { ok: true, announcement: dto(published), alreadyPublished: false };
    });
}

export async function archiveAnnouncement({ clubId, announcementId, actorUserId }) {
    return db.transaction(async trx => {
        const existing = await trx.query(
            `SELECT * FROM announcements WHERE id = $1 AND club_id = $2
             AND deleted_at IS NULL FOR UPDATE`,
            [announcementId, clubId]
        ).then(result => result.first);
        if (!existing) return { ok: false, code: 'ANNOUNCEMENT_NOT_FOUND' };
        if (existing.status === 'archived') return { ok: true, announcement: dto(existing) };
        if (existing.status !== 'published') return { ok: false, code: 'ANNOUNCEMENT_NOT_PUBLISHED' };
        const archived = await trx.query(
            `UPDATE announcements SET status = 'archived', archived_at = NOW(),
                    archived_by = $3, updated_by = $3, updated_at = NOW()
             WHERE id = $1 AND club_id = $2 RETURNING *`,
            [announcementId, clubId, actorUserId]
        ).then(result => result.first);
        await audit(trx, {
            clubId, announcementId, actorUserId, eventType: 'announcement.archived',
            oldState: existing, newState: archived,
        });
        return { ok: true, announcement: dto(archived) };
    });
}

export async function deleteAnnouncement({ clubId, announcementId, actorUserId }) {
    return db.transaction(async trx => {
        const existing = await trx.query(
            `SELECT * FROM announcements WHERE id = $1 AND club_id = $2
             AND deleted_at IS NULL FOR UPDATE`,
            [announcementId, clubId]
        ).then(result => result.first);
        if (!existing) return { ok: false, code: 'ANNOUNCEMENT_NOT_FOUND' };
        const deleted = await trx.query(
            `UPDATE announcements SET deleted_at = NOW(), deleted_by = $3,
                    updated_by = $3, updated_at = NOW()
             WHERE id = $1 AND club_id = $2 RETURNING *`,
            [announcementId, clubId, actorUserId]
        ).then(result => result.first);
        await audit(trx, {
            clubId, announcementId, actorUserId, eventType: 'announcement.deleted',
            oldState: existing, newState: deleted,
        });
        return { ok: true };
    });
}

export async function addAttachmentRecord({ clubId, announcementId, actorUserId, asset }) {
    return db.transaction(async trx => {
        const announcement = await trx.query(
            `SELECT status FROM announcements WHERE id = $1 AND club_id = $2
             AND deleted_at IS NULL FOR UPDATE`,
            [announcementId, clubId]
        ).then(result => result.first);
        if (!announcement) return { ok: false, code: 'ANNOUNCEMENT_NOT_FOUND' };
        if (announcement.status === 'archived') return { ok: false, code: 'ANNOUNCEMENT_ARCHIVED' };
        const attachment = await trx.query(
            `INSERT INTO announcement_attachments
                (club_id, announcement_id, original_name, content_type, size_bytes,
                 storage_key, kind, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [clubId, announcementId, asset.originalName, asset.contentType, asset.sizeBytes,
                asset.storageKey, asset.kind, actorUserId]
        ).then(result => result.first);
        await audit(trx, {
            clubId, announcementId, actorUserId, eventType: 'announcement.attachment_added',
            newState: { attachmentId: attachment.id, originalName: attachment.original_name },
        });
        return { ok: true, attachment: attachmentDto(attachment) };
    });
}

export async function getAttachmentAccess({ clubId, announcementId, attachmentId, canManage = false }) {
    return db.query(
        `SELECT attachment.*, announcement.status AS announcement_status
         FROM announcement_attachments attachment
         JOIN announcements announcement ON announcement.id = attachment.announcement_id
           AND announcement.club_id = attachment.club_id
         WHERE attachment.id = $1 AND attachment.announcement_id = $2
           AND attachment.club_id = $3 AND attachment.deleted_at IS NULL
           AND announcement.deleted_at IS NULL
           AND ($4::BOOLEAN OR announcement.status = 'published')`,
        [attachmentId, announcementId, clubId, canManage]
    ).then(result => result.first);
}

export async function deleteAttachment({ clubId, announcementId, attachmentId, actorUserId }) {
    return db.transaction(async trx => {
        const attachment = await trx.query(
            `UPDATE announcement_attachments SET deleted_at = NOW(), deleted_by = $4
             WHERE id = $1 AND announcement_id = $2 AND club_id = $3 AND deleted_at IS NULL
             RETURNING *`,
            [attachmentId, announcementId, clubId, actorUserId]
        ).then(result => result.first);
        if (!attachment) return { ok: false, code: 'ATTACHMENT_NOT_FOUND' };
        await audit(trx, {
            clubId, announcementId, actorUserId, eventType: 'announcement.attachment_deleted',
            oldState: { attachmentId, originalName: attachment.original_name },
        });
        return { ok: true, storageKey: attachment.storage_key };
    });
}
