import { describe, expect, it } from 'vitest';
import db from '../database/database.js';
import { readBaselineSchema } from '../database/migrations/1700000000000_baseline.js';
import { RECONCILIATION_SQL } from '../database/migrations/1700000000002_reconcile_multitenant_model.js';
import { MembershipModel } from '../models/Membership.js';
import { PlayerModel } from '../models/Player.js';
import {
    addClubMember,
    createClub,
    createMatch,
    createPlayer,
    createPlayerLink,
    createRatingHistory,
    createUser,
} from '../test/factories.js';

describe('multi-tenant reconciliation schema', () => {
    it('allows one user to link to one player independently in each club', async () => {
        const ownerA = await createUser();
        const ownerB = await createUser();
        const member = await createUser();
        const clubA = await createClub(ownerA);
        const clubB = await createClub(ownerB);
        const playerA = await createPlayer(clubA);
        const playerB = await createPlayer(clubB);

        await Promise.all([
            addClubMember(clubA, member),
            addClubMember(clubB, member),
        ]);
        const [linkA, linkB] = await Promise.all([
            createPlayerLink(member, playerA, { status: 'approved' }),
            createPlayerLink(member, playerB, { status: 'approved' }),
        ]);

        expect(linkA.club_id).toBe(clubA.id);
        expect(linkB.club_id).toBe(clubB.id);
    });

    it('enforces one active link per user and per player within a club', async () => {
        const owner = await createUser();
        const firstUser = await createUser();
        const secondUser = await createUser();
        const club = await createClub(owner);
        const firstPlayer = await createPlayer(club);
        const secondPlayer = await createPlayer(club);

        await createPlayerLink(firstUser, firstPlayer, { status: 'pending' });

        await expect(createPlayerLink(firstUser, secondPlayer, { status: 'approved' }))
            .rejects.toMatchObject({ code: '23505' });
        await expect(createPlayerLink(secondUser, firstPlayer, { status: 'approved' }))
            .rejects.toMatchObject({ code: '23505' });
    });

    it('preserves rejected link history without blocking a later request', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        const player = await createPlayer(club);

        await createPlayerLink(member, player, { status: 'rejected' });
        const retry = await createPlayerLink(member, player, { status: 'pending' });

        expect(retry.status).toBe('pending');
        const history = await db.query(
            'SELECT status FROM player_links WHERE user_id = $1 AND player_id = $2 ORDER BY created_at',
            [member.id, player.id]
        );
        expect(history.rows.map(row => row.status).sort()).toEqual(['pending', 'rejected']);
    });

    it('rejects a player-link club that differs from the player club', async () => {
        const ownerA = await createUser();
        const ownerB = await createUser();
        const member = await createUser();
        const clubA = await createClub(ownerA);
        const clubB = await createClub(ownerB);
        const player = await createPlayer(clubA);

        await expect(db.query(
            `INSERT INTO player_links (player_id, user_id, club_id, status)
             VALUES ($1, $2, $3, 'pending')`,
            [player.id, member.id, clubB.id]
        )).rejects.toMatchObject({ code: '23503' });
    });

    it('keeps revoked memberships and unlinked player links as lifecycle history', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        const player = await createPlayer(club);
        await addClubMember(club, member);
        await createPlayerLink(member, player, { status: 'approved' });

        await MembershipModel.revoke({
            clubId: club.id,
            userId: member.id,
            actorUserId: owner.id,
            reason: 'Schema lifecycle test',
        });
        const membership = await db.query(
            'SELECT status, revoked_at FROM user_clubs WHERE club_id = $1 AND user_id = $2',
            [club.id, member.id]
        );
        expect(membership.first.status).toBe('REVOKED');
        expect(membership.first.revoked_at).not.toBeNull();

        const unlinked = await db.query(
            `UPDATE player_links
             SET status = 'unlinked', unlinked_at = NOW()
             WHERE club_id = $1 AND user_id = $2
             RETURNING status, unlinked_at`,
            [club.id, member.id]
        );
        expect(unlinked.first.status).toBe('unlinked');
        expect(unlinked.first.unlinked_at).not.toBeNull();
    });

    it('soft-deletes players while preserving matches and rating history', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const white = await createPlayer(club);
        const black = await createPlayer(club);
        const match = await createMatch(club, white, black);
        await createRatingHistory(white, match, { ratingBefore: 1500, ratingAfter: 1510 });

        await PlayerModel.delete(white.id);

        const player = await db.query('SELECT status, deleted_at FROM players WHERE id = $1', [white.id]);
        const matchCount = await db.query('SELECT COUNT(*)::int AS count FROM matches WHERE id = $1', [match.id]);
        const historyCount = await db.query('SELECT COUNT(*)::int AS count FROM rating_history WHERE match_id = $1', [match.id]);
        expect(player.first.status).toBe('deleted');
        expect(player.first.deleted_at).not.toBeNull();
        expect(matchCount.first.count).toBe(1);
        expect(historyCount.first.count).toBe(1);

        await expect(db.query('DELETE FROM players WHERE id = $1', [white.id]))
            .rejects.toSatisfy(error => ['23001', '23503'].includes(error.code));
    });

    it('can safely reapply the forward reconciliation SQL', async () => {
        const owner = await createUser();
        const club = await createClub(owner);

        await db.query(RECONCILIATION_SQL);

        const preserved = await db.query('SELECT slug, visibility, status FROM clubs WHERE id = $1', [club.id]);
        expect(preserved.first).toMatchObject({
            slug: club.slug,
            visibility: club.visibility,
            status: club.status,
        });
    });

    it('upgrades an isolated legacy baseline and is repeatable there too', async () => {
        await db.transaction(async (trx) => {
            await trx.query('CREATE SCHEMA legacy_reconciliation');
            await trx.query('SET LOCAL search_path TO legacy_reconciliation');
            await trx.query(readBaselineSchema());
            await trx.query(
                `INSERT INTO users (id, email, name, password_hash)
                 VALUES ('legacy_user', 'legacy@example.test', 'Legacy User', 'hash')`
            );
            await trx.query(
                `INSERT INTO users (id, email, name, password_hash)
                 VALUES ('legacy_rejected_user', 'rejected@example.test', 'Rejected User', 'hash')`
            );
            await trx.query(
                `INSERT INTO clubs (id, name, owner_id, public_leaderboard)
                 VALUES ('legacy_club', 'Legacy Club', 'legacy_user', FALSE)`
            );
            await trx.query(
                `INSERT INTO user_clubs (user_id, club_id, role)
                 VALUES ('legacy_user', 'legacy_club', 'owner')`
            );
            await trx.query(
                `INSERT INTO players (id, club_id, name)
                 VALUES ('legacy_player', 'legacy_club', 'Legacy Player')`
            );
            await trx.query(
                `INSERT INTO player_links (id, player_id, user_id, status)
                 VALUES ('legacy_link', 'legacy_player', 'legacy_user', 'rejected')`
            );
            await trx.query(
                `INSERT INTO club_join_requests (id, club_id, user_id, status, processed_at)
                 VALUES ('legacy_request', 'legacy_club', 'legacy_rejected_user', 'rejected', NOW())`
            );

            await trx.query(RECONCILIATION_SQL);
            await trx.query(RECONCILIATION_SQL);

            const user = await trx.query('SELECT username, full_name FROM users WHERE id = $1', ['legacy_user']);
            const club = await trx.query('SELECT slug, visibility, status FROM clubs WHERE id = $1', ['legacy_club']);
            const membership = await trx.query('SELECT status FROM user_clubs WHERE user_id = $1', ['legacy_user']);
            const rejectedMembership = await trx.query(
                'SELECT status, rejected_at FROM user_clubs WHERE user_id = $1',
                ['legacy_rejected_user']
            );
            const link = await trx.query('SELECT club_id, status FROM player_links WHERE id = $1', ['legacy_link']);
            expect(user.first.username).toBeTruthy();
            expect(user.first.full_name).toBe('Legacy User');
            expect(club.first).toMatchObject({ visibility: 'private', status: 'active' });
            expect(club.first.slug).toBeTruthy();
            expect(membership.first.status).toBe('ACTIVE_MEMBER');
            expect(rejectedMembership.first.status).toBe('REJECTED');
            expect(rejectedMembership.first.rejected_at).not.toBeNull();
            expect(link.first).toMatchObject({ club_id: 'legacy_club', status: 'rejected' });

            await trx.query('SET LOCAL search_path TO public');
            await trx.query('DROP SCHEMA legacy_reconciliation CASCADE');
        });
    });
});
