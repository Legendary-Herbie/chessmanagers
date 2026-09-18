import { access } from 'fs/promises';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { replayRatingCategory } from '../services/RatingService.js';
import { storeImageAsset, removeImageAsset } from '../services/ImageAssetService.js';
import * as imageAssets from '../services/ImageAssetService.js';
import { drainAssetCleanup } from '../services/AssetCleanupService.js';
import { resolveAttachmentPath, removeAttachment } from '../services/AttachmentStorageService.js';
import { addClubMember, authorization, createClub, createMatch, createPlayer, createPlayerLink, createTournament, createUser } from '../test/factories.js';

async function tournamentFixture() {
    const owner = await createUser();
    const club = await createClub(owner);
    const players = [await createPlayer(club), await createPlayer(club)];
    const tournament = await createTournament(club, { status: 'active' });
    const base = `/api/v1/clubs/${club.id}/tournaments/${tournament.id}`;
    const token = authorization(owner);
    for (const player of players) {
        await request(app).post(`${base}/players`).set('Authorization', token).send({ playerId: player.id }).expect(201);
    }
    const round = await request(app).post(`${base}/rounds`).set('Authorization', token).send({}).expect(201);
    const pairing = round.body.pairings[0];
    const recorded = await request(app).post(`${base}/pairings/${pairing.id}/result`).set('Authorization', token)
        .send({ result: 'white', playedAt: '2026-01-01T12:00:00.000Z' }).expect(201);
    const match = recorded.body.match;
    const white = players.find(player => player.id === pairing.whitePlayerId);
    const black = players.find(player => player.id === pairing.blackPlayerId);
    await db.transaction(trx => replayRatingCategory(trx, club.id, 'blitz'));
    return { owner, club, white, black, tournament, match, base };
}

describe('permanent deletion boundaries', () => {
    it('retries failed upload cleanup and preserves files referenced by another club', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const key = '/uploads/images/cleanup-retry-fixture.png';
        await db.query('INSERT INTO asset_cleanup_jobs (kind, asset_key) VALUES ($1, $2)', ['image', key]);
        const remove = vi.spyOn(imageAssets, 'removeImageAsset').mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }));
        try {
            await drainAssetCleanup();
            expect((await db.query('SELECT * FROM asset_cleanup_jobs')).rows).toHaveLength(1);
            remove.mockRestore();
            await drainAssetCleanup();
            expect((await db.query('SELECT * FROM asset_cleanup_jobs')).rows).toHaveLength(0);
            await db.query('UPDATE clubs SET logo = $1 WHERE id = $2', [key, club.id]);
            await db.query('INSERT INTO asset_cleanup_jobs (kind, asset_key) VALUES ($1, $2)', ['image', key]);
            const sharedRemove = vi.spyOn(imageAssets, 'removeImageAsset');
            await drainAssetCleanup();
            expect(sharedRemove).not.toHaveBeenCalled();
        } finally {
            vi.restoreAllMocks();
        }
    });

    it('deletes tournament history and notifications, replaying later games while keeping unrelated data', async () => {
        const { owner, club, white, black, tournament, match, base } = await tournamentFixture();
        const later = await createMatch(club, white, black, { result: 'draw', playedAt: '2026-01-02T12:00:00Z' });
        const otherTournament = await createTournament(club);
        const otherClub = await createClub(owner);
        const otherPlayer = await createPlayer(otherClub);
        await db.transaction(trx => replayRatingCategory(trx, club.id, 'blitz'));
        expect((await db.query('SELECT current_rating FROM player_rating_state WHERE player_id = $1 AND category = $2', [white.id, 'blitz'])).first.current_rating).toBeGreaterThan(1500);
        await db.query(`INSERT INTO notifications (user_id, club_id, event_type, payload_json)
            VALUES ($1, $2, 'match.recorded', $3), ($1, $2, 'tournament.updated', $4), ($1, $2, 'match.recorded', $5)`,
        [owner.id, club.id, JSON.stringify({ matchId: match.id }), JSON.stringify({ tournamentId: tournament.id }), JSON.stringify({ matchId: later.id })]);
        await db.query(`INSERT INTO notification_outbox (notification_id, channel)
            SELECT id, 'email' FROM notifications WHERE club_id = $1`, [club.id]);

        await request(app).delete(base).set('Authorization', authorization(owner)).send({ permanent: true }).expect(200);

        expect((await db.query('SELECT id FROM matches WHERE club_id = $1', [club.id])).rows).toEqual([{ id: later.id }]);
        expect((await db.query('SELECT id FROM tournaments WHERE club_id = $1', [club.id])).rows).toEqual([{ id: otherTournament.id }]);
        expect((await db.query('SELECT * FROM tournament_players WHERE tournament_id = $1', [tournament.id])).rows).toEqual([]);
        expect((await db.query('SELECT * FROM rating_history WHERE match_id = $1', [match.id])).rows).toEqual([]);
        const ratings = await db.query('SELECT current_rating, completed_rated_games FROM player_rating_state WHERE club_id = $1 AND category = $2', [club.id, 'blitz']);
        expect(ratings.rows).toEqual([{ current_rating: 1500, completed_rated_games: 1 }, { current_rating: 1500, completed_rated_games: 1 }]);
        expect((await db.query('SELECT COUNT(*)::int AS count FROM notifications WHERE club_id = $1', [club.id])).first.count).toBe(1);
        expect((await db.query('SELECT COUNT(*)::int AS count FROM notification_outbox')).first.count).toBe(1);
        expect((await db.query('SELECT rating FROM players WHERE id = $1', [otherPlayer.id])).first.rating).toBe(1500);
        expect((await db.query('SELECT id FROM clubs WHERE id = $1', [club.id])).first.id).toBe(club.id);
    });

    it('keeps archive non-destructive and allows permanent deletion afterwards', async () => {
        const { owner, tournament, match, base, white } = await tournamentFixture();
        await request(app).delete(base).set('Authorization', authorization(owner)).send({}).expect(400);
        await request(app).post(`${base}/archive`).set('Authorization', authorization(owner)).send({}).expect(200);
        expect((await db.query('SELECT deleted_at FROM tournaments WHERE id = $1', [tournament.id])).first.deleted_at).not.toBeNull();
        expect((await db.query('SELECT id FROM matches WHERE id = $1', [match.id])).first.id).toBe(match.id);
        await request(app).delete(base).set('Authorization', authorization(owner)).send({ permanent: true }).expect(200);
        expect((await db.query('SELECT current_rating, completed_rated_games FROM player_rating_state WHERE player_id = $1 AND category = $2', [white.id, 'blitz'])).first)
            .toEqual({ current_rating: 1500, completed_rated_games: 0 });
    });

    it('rejects non-admin and cross-club tournament deletion', async () => {
        const { owner, club, tournament, base } = await tournamentFixture();
        const member = await createUser();
        await addClubMember(club, member);
        await request(app).delete(base).set('Authorization', authorization(member)).send({ permanent: true }).expect(403);
        const otherClub = await createClub(owner);
        await request(app).delete(`/api/v1/clubs/${otherClub.id}/tournaments/${tournament.id}`)
            .set('Authorization', authorization(owner)).send({ permanent: true }).expect(404);
        expect((await db.query('SELECT id FROM tournaments WHERE id = $1', [tournament.id])).first.id).toBe(tournament.id);
    });

    it('removes all club-owned rows and uploads, preserving accounts and other clubs', async () => {
        const { owner, club, white } = await tournamentFixture();
        const otherClub = await createClub(owner);
        const otherPlayer = await createPlayer(otherClub);
        await createPlayerLink(owner, white);
        const token = authorization(owner);
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const logo = await storeImageAsset({ buffer: png, size: png.length, mimetype: 'image/png', originalname: 'logo.png' }, 'deletion-test');
        let attachmentKey;
        try {
            await db.query('UPDATE clubs SET logo = $1 WHERE id = $2', [logo, club.id]);
            const draft = await request(app).post(`/api/v1/clubs/${club.id}/announcements`).set('Authorization', token)
                .send({ title: 'Deletion fixture', contentHtml: '<p>Test content</p>' }).expect(201);
            await request(app).post(`/api/v1/clubs/${club.id}/announcements/${draft.body.announcement.id}/attachments`)
                .set('Authorization', token).attach('attachment', png, { filename: 'test.png', contentType: 'image/png' }).expect(201);
            attachmentKey = (await db.query('SELECT storage_key FROM announcement_attachments WHERE club_id = $1', [club.id])).first.storage_key;
            await request(app).post(`/api/v1/clubs/${club.id}/announcements/${draft.body.announcement.id}/publish`).set('Authorization', token).send({}).expect(200);
            await request(app).delete(`/api/v1/clubs/${club.id}`).set('Authorization', token).send({}).expect(400);
            await request(app).post(`/api/v1/clubs/${club.id}/archive`).set('Authorization', token).send({}).expect(200);
            await request(app).delete(`/api/v1/clubs/${club.id}`).set('Authorization', token).send({ permanent: true }).expect(200);

            const tables = await db.query(`SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t
                ON t.table_schema = c.table_schema AND t.table_name = c.table_name
                WHERE c.table_schema = 'public' AND c.column_name = 'club_id' AND t.table_type = 'BASE TABLE'`);
            for (const { table_name: table } of tables.rows) {
                expect((await db.query(`SELECT COUNT(*)::int AS count FROM "${table}" WHERE club_id = $1`, [club.id])).first.count, table).toBe(0);
            }
            expect((await db.query('SELECT id FROM clubs WHERE id = $1', [club.id])).rows).toEqual([]);
            expect((await db.query('SELECT id FROM users WHERE id = $1', [owner.id])).first.id).toBe(owner.id);
            expect((await db.query('SELECT id FROM players WHERE id = $1', [otherPlayer.id])).first.id).toBe(otherPlayer.id);
            expect((await db.query('SELECT club_id FROM user_clubs WHERE user_id = $1', [owner.id])).rows).toEqual([{ club_id: otherClub.id }]);
            await expect(access(fileURLToPath(new URL(`../..${logo}`, import.meta.url)))).rejects.toMatchObject({ code: 'ENOENT' });
            await expect(access(resolveAttachmentPath(attachmentKey))).rejects.toMatchObject({ code: 'ENOENT' });
            expect((await db.query('SELECT * FROM asset_cleanup_jobs')).rows).toEqual([]);
        } finally {
            await removeImageAsset(logo);
            if (attachmentKey) await removeAttachment(attachmentKey);
        }
    });

    it('rolls back all removals if deleting the parent fails', async () => {
        const { owner, club, tournament, match, base } = await tournamentFixture();
        await db.query('UPDATE clubs SET logo = $1 WHERE id = $2', ['/uploads/images/rollback-fixture.png', club.id]);
        await db.query(`CREATE FUNCTION test_reject_parent_delete() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'forced deletion failure'; END $$;
            CREATE TRIGGER test_reject_tournament BEFORE DELETE ON tournaments FOR EACH ROW EXECUTE FUNCTION test_reject_parent_delete();`);
        try {
            await request(app).delete(base).set('Authorization', authorization(owner)).send({ permanent: true }).expect(500);
            await request(app).delete(`/api/v1/clubs/${club.id}`).set('Authorization', authorization(owner)).send({ permanent: true }).expect(500);
            expect((await db.query('SELECT id FROM matches WHERE id = $1', [match.id])).first.id).toBe(match.id);
            expect((await db.query('SELECT id FROM tournaments WHERE id = $1', [tournament.id])).first.id).toBe(tournament.id);
            expect((await db.query('SELECT COUNT(*)::int AS count FROM rating_history WHERE match_id = $1', [match.id])).first.count).toBe(2);
            expect((await db.query('SELECT * FROM asset_cleanup_jobs')).rows).toEqual([]);
        } finally {
            await db.query('DROP TRIGGER test_reject_tournament ON tournaments; DROP FUNCTION test_reject_parent_delete()');
        }
    });
});
