import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { up as migrateIntegrity } from '../database/migrations/1700000000021_announcement_integrity.js';
import { addClubMember, authorization, createClub, createUser } from '../test/factories.js';

async function setup(notificationEnabled = true, clubNotifications = true) {
    const owner = await createUser();
    const member = await createUser();
    const club = await createClub(owner, { settings: { notifications: { announcementEvents: clubNotifications } } });
    await addClubMember(club, member);
    const base = `/api/v1/clubs/${club.id}/announcements`;
    const token = authorization(owner);
    const draft = (await request(app).post(base).set('Authorization', token)
        .send({ title: 'Update', contentHtml: '<p>Original</p>', notificationEnabled }).expect(201)).body.announcement;
    const url = `${base}/${draft.id}`;
    return { owner, member, club, base, token, draft, url };
}

describe('announcement integrity and notification semantics', () => {
    it('rejects cross-club views in the database and deduplicates valid views in list and detail', async () => {
        const f = await setup();
        const other = await createClub(f.owner);
        await expect(db.query('INSERT INTO announcement_views (announcement_id, club_id, user_id) VALUES ($1,$2,$3)',
            [f.draft.id, other.id, f.member.id])).rejects.toMatchObject({ code: '23503' });
        await request(app).post(`${f.url}/publish`).set('Authorization', f.token).send({}).expect(200);
        for (let i = 0; i < 2; i++) {
            expect((await request(app).post(`${f.url}/views`).set('Authorization', authorization(f.member)).send({}).expect(200)).body.viewCount).toBe(1);
        }
        expect((await request(app).get(f.url).set('Authorization', f.token).expect(200)).body.announcement.viewCount).toBe(1);
        expect((await request(app).get(f.base).set('Authorization', f.token).expect(200)).body.announcements[0].viewCount).toBe(1);
    });

    it('repairs invalid legacy views before applying the composite constraint and is repeatable', async () => {
        const f = await setup();
        const other = await createClub(f.owner);
        let sql;
        await migrateIntegrity({ sql: value => { sql = value; } });
        await db.transaction(async trx => {
            await trx.query('ALTER TABLE announcement_views DROP CONSTRAINT fk_announcement_views_scope');
            await trx.query('INSERT INTO announcement_views (announcement_id, club_id, user_id) VALUES ($1,$2,$3),($1,$4,$5)',
                [f.draft.id, other.id, f.member.id, f.club.id, f.owner.id]);
            await trx.query(sql);
            await trx.query(sql);
            expect((await trx.query('SELECT club_id FROM announcement_views WHERE announcement_id = $1', [f.draft.id])).rows).toEqual([{ club_id: f.club.id }]);
        });
    });

    it.each([[false, true], [true, false]])('respects announcement notification %s and club notification %s', async (enabled, clubEnabled) => {
        const f = await setup(enabled, clubEnabled);
        const edited = await request(app).patch(f.url).set('Authorization', f.token)
            .send({ title: 'Edited draft', contentHtml: '<p>Draft edit</p>' }).expect(200);
        expect(edited.body.announcement.notificationEnabled).toBe(enabled);
        for (let i = 0; i < 2; i++) await request(app).post(`${f.url}/publish`).set('Authorization', f.token).send({}).expect(200);
        expect((await db.query("SELECT COUNT(*)::int AS count FROM notifications WHERE club_id = $1 AND event_type = 'announcement.published'", [f.club.id])).first.count).toBe(0);
    });

    it('keeps published edits silent and visible without marking unchanged saves as edited', async () => {
        const f = await setup();
        const published = (await request(app).post(`${f.url}/publish`).set('Authorization', f.token).send({}).expect(200)).body.announcement;
        expect(published.editedAt).toBeNull();
        const unchanged = await request(app).patch(f.url).set('Authorization', f.token)
            .send({ title: 'Update', contentHtml: '<p>Original</p>' }).expect(200);
        expect(unchanged.body.announcement.editedAt).toBeNull();
        const changed = (await request(app).patch(f.url).set('Authorization', f.token)
            .send({ title: 'Corrected update', contentHtml: '<p>New time</p>' }).expect(200)).body.announcement;
        expect(changed.status).toBe('published');
        expect(changed.publishedAt).toBe(published.publishedAt);
        expect(changed.editedAt).toBeTruthy();
        expect((await request(app).get(f.url).set('Authorization', authorization(f.member)).expect(200)).body.announcement.editedAt).toBe(changed.editedAt);
        expect((await db.query("SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND club_id = $2 AND event_type = 'announcement.published'", [f.member.id, f.club.id])).first.count).toBe(1);
    });
});
