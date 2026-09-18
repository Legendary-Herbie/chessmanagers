import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { addClubMember, authorization, createClub, createPlayer, createPlayerLink, createUser } from '../test/factories.js';

describe('player identity and announcement feed', () => {
    it('lets linked players edit identity and links while enforcing owner-only name locks', async () => {
        const owner = await createUser();
        const member = await createUser();
        const admin = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member);
        await addClubMember(club, admin, 'admin');
        const player = await createPlayer(club);
        const otherPlayer = await createPlayer(club);
        await createPlayerLink(member, player, { status: 'approved' });
        const base = `/api/v1/clubs/${club.id}/players/${player.id}`;
        const edited = await request(app).patch(`${base}/profile`).set('Authorization', authorization(member))
            .send({ name: 'New name', federationId: '12345', chesscomUsername: 'club_player', lichessUsername: 'club-player' }).expect(200);
        expect(edited.body.player).toMatchObject({ name: 'New name', federation_id: '12345', chesscom_username: 'club_player', lichess_username: 'club-player' });
        await request(app).patch(base).set('Authorization', authorization(admin)).send({ nameLocked: true }).expect(403);
        await request(app).patch(base).set('Authorization', authorization(owner)).send({ nameLocked: true }).expect(200);
        await request(app).patch(base).set('Authorization', authorization(admin)).send({ name: 'Blocked admin edit' }).expect(403);
        await request(app).patch(`${base}/profile`).set('Authorization', authorization(member)).send({ name: 'Blocked member edit' }).expect(403);
        await request(app).patch(`${base}/profile`).set('Authorization', authorization(member)).send({ bio: 'Still editable' }).expect(200);
        await request(app).patch(base).set('Authorization', authorization(owner)).send({ name: 'Owner correction', nameLocked: false }).expect(200);
        await request(app).patch(`${base}/profile`).set('Authorization', authorization(member)).send({ name: 'Unlocked edit' }).expect(200);
        await request(app).patch(`${base}/profile`).set('Authorization', authorization(member)).send({ chesscomUsername: 'https://evil.test' }).expect(400);
        await request(app).patch(`/api/v1/clubs/${club.id}/players/${otherPlayer.id}/profile`).set('Authorization', authorization(member)).send({ name: 'Not mine' }).expect(403);
    });

    it('returns full posts and counts unique views without exposing drafts or crossing clubs', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member);
        const base = `/api/v1/clubs/${club.id}/announcements`;
        const created = await request(app).post(base).set('Authorization', authorization(owner))
            .send({ title: 'New club update', contentHtml: '<p>A full <u>underlined</u> post.</p>' }).expect(201);
        const id = created.body.announcement.id;
        await request(app).post(`${base}/${id}/views`).set('Authorization', authorization(member)).send({}).expect(404);
        await request(app).post(`${base}/${id}/publish`).set('Authorization', authorization(owner)).send({}).expect(200);
        const responses = await Promise.all([1, 2].map(() => request(app).post(`${base}/${id}/views`).set('Authorization', authorization(member)).send({}).expect(200)));
        expect(responses.map(response => response.body.viewCount)).toEqual([1, 1]);
        await request(app).post(`${base}/${id}/views`).set('Authorization', authorization(owner)).send({}).expect(200);
        const feed = await request(app).get(base).set('Authorization', authorization(member)).expect(200);
        expect(feed.body.announcements[0]).toMatchObject({ authorName: owner.name, viewCount: 2, contentHtml: '<p>A full <u>underlined</u> post.</p>', attachments: [] });
        const other = await createClub(member);
        await request(app).post(`/api/v1/clubs/${other.id}/announcements/${id}/views`).set('Authorization', authorization(member)).send({}).expect(404);
        await request(app).delete(`/api/v1/clubs/${club.id}`).set('Authorization', authorization(owner)).send({ permanent: true }).expect(200);
        expect((await db.query('SELECT * FROM announcement_views WHERE announcement_id = $1', [id])).rows).toEqual([]);
    });
});
