import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { ANNOUNCEMENTS_SQL } from '../database/migrations/1700000000012_announcements.js';
import { removeAttachment } from '../services/AttachmentStorageService.js';
import { addClubMember, authorization, createClub, createUser } from '../test/factories.js';

async function createDraft(club, actor, overrides = {}) {
    return request(app)
        .post(`/api/v1/clubs/${club.id}/announcements`)
        .set('Authorization', authorization(actor))
        .send({
            title: overrides.title || 'Club update',
            contentHtml: overrides.contentHtml || '<p>Welcome <strong>members</strong>.</p>',
        })
        .expect(201)
        .then(response => response.body.announcement);
}

describe('club announcements', () => {
    it('keeps drafts admin-only, sanitizes rich text, and publishes once with notifications', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member);
        const draft = await createDraft(club, owner, {
            contentHtml: '<h2>News</h2><script>alert(1)</script><p onclick="bad()">Safe</p><a href="javascript:alert(2)">link</a><img src=x onerror=bad()>',
        });

        expect(draft.status).toBe('draft');
        expect(draft.contentHtml).toContain('<h2>News</h2>');
        expect(draft.contentHtml).not.toMatch(/script|onclick|javascript:|<img/i);
        await request(app)
            .get(`/api/v1/clubs/${club.id}/announcements/${draft.id}`)
            .set('Authorization', authorization(member))
            .expect(404);

        const published = await request(app)
            .post(`/api/v1/clubs/${club.id}/announcements/${draft.id}/publish`)
            .set('Authorization', authorization(owner))
            .send({})
            .expect(200);
        expect(published.body).toMatchObject({ alreadyPublished: false });
        expect(published.body.announcement.status).toBe('published');

        const repeated = await request(app)
            .post(`/api/v1/clubs/${club.id}/announcements/${draft.id}/publish`)
            .set('Authorization', authorization(owner))
            .send({})
            .expect(200);
        expect(repeated.body.alreadyPublished).toBe(true);

        const memberView = await request(app)
            .get(`/api/v1/clubs/${club.id}/announcements/${draft.id}`)
            .set('Authorization', authorization(member))
            .expect(200);
        expect(memberView.body.announcement.contentHtml).toBe(draft.contentHtml);
        const notificationCount = await db.query(
            `SELECT COUNT(*)::INTEGER AS count FROM notifications
             WHERE user_id = $1 AND event_type = 'announcement.published'
               AND payload_json->>'announcementId' = $2`,
            [member.id, draft.id]
        ).then(result => result.first.count);
        expect(notificationCount).toBe(1);
    });

    it('enforces club scope and the member/admin permission matrix', async () => {
        const owner = await createUser();
        const otherOwner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        const otherClub = await createClub(otherOwner);
        await addClubMember(club, member);
        const draft = await createDraft(club, owner);

        await request(app)
            .post(`/api/v1/clubs/${club.id}/announcements`)
            .set('Authorization', authorization(member))
            .send({ title: 'No', contentHtml: '<p>No</p>' })
            .expect(403);
        await request(app)
            .patch(`/api/v1/clubs/${club.id}/announcements/${draft.id}`)
            .set('Authorization', authorization(member))
            .send({ title: 'No', contentHtml: '<p>No</p>' })
            .expect(403);
        await request(app)
            .get(`/api/v1/clubs/${otherClub.id}/announcements/${draft.id}`)
            .set('Authorization', authorization(otherOwner))
            .expect(404);
    });

    it('authorizes verified attachment content through announcement visibility', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member);
        const draft = await createDraft(club, owner);
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

        const uploaded = await request(app)
            .post(`/api/v1/clubs/${club.id}/announcements/${draft.id}/attachments`)
            .set('Authorization', authorization(owner))
            .attach('attachment', png, { filename: 'board.png', contentType: 'image/png' })
            .expect(201);
        const attachment = uploaded.body.attachment;
        expect(attachment).toMatchObject({ originalName: 'board.png', kind: 'image' });
        expect(attachment).not.toHaveProperty('storageKey');

        await request(app)
            .get(`/api/v1/clubs/${club.id}/announcements/${draft.id}/attachments/${attachment.id}`)
            .set('Authorization', authorization(member))
            .expect(404);
        await request(app)
            .post(`/api/v1/clubs/${club.id}/announcements/${draft.id}/publish`)
            .set('Authorization', authorization(owner))
            .send({})
            .expect(200);
        const download = await request(app)
            .get(`/api/v1/clubs/${club.id}/announcements/${draft.id}/attachments/${attachment.id}`)
            .set('Authorization', authorization(member))
            .buffer(true)
            .expect(200);
        expect(download.headers['content-type']).toMatch(/^image\/png/);
        expect(download.body).toEqual(png);

        const storageKey = await db.query(
            'SELECT storage_key FROM announcement_attachments WHERE id = $1', [attachment.id]
        ).then(result => result.first.storage_key);
        await request(app)
            .delete(`/api/v1/clubs/${club.id}/announcements/${draft.id}/attachments/${attachment.id}`)
            .set('Authorization', authorization(owner))
            .send({})
            .expect(204);
        await removeAttachment(storageKey);
    });

    it('rejects disguised attachment content and hides archived or deleted records from members', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member);
        const draft = await createDraft(club, owner);
        await request(app)
            .post(`/api/v1/clubs/${club.id}/announcements/${draft.id}/attachments`)
            .set('Authorization', authorization(owner))
            .attach('attachment', Buffer.from('not a PDF'), { filename: 'fake.pdf', contentType: 'application/pdf' })
            .expect(400);
        expect(await db.query('SELECT COUNT(*)::INTEGER AS count FROM announcement_attachments')
            .then(result => result.first.count)).toBe(0);

        await request(app)
            .post(`/api/v1/clubs/${club.id}/announcements/${draft.id}/publish`)
            .set('Authorization', authorization(owner)).send({}).expect(200);
        await request(app)
            .post(`/api/v1/clubs/${club.id}/announcements/${draft.id}/archive`)
            .set('Authorization', authorization(owner)).send({}).expect(200);
        const memberList = await request(app)
            .get(`/api/v1/clubs/${club.id}/announcements`)
            .set('Authorization', authorization(member)).expect(200);
        expect(memberList.body.announcements).toHaveLength(0);

        await request(app)
            .delete(`/api/v1/clubs/${club.id}/announcements/${draft.id}`)
            .set('Authorization', authorization(owner)).send({}).expect(204);
        expect(await db.query('SELECT deleted_at FROM announcements WHERE id = $1', [draft.id])
            .then(result => result.first.deleted_at)).toBeTruthy();
    });

    it('reapplies the additive announcements migration safely', async () => {
        await expect(db.query(ANNOUNCEMENTS_SQL)).resolves.toBeTruthy();
    });
});
