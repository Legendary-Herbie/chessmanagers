import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import {
    addClubMember,
    authorization,
    createClub,
    createPlayer,
    createPlayerLink,
    createUser,
} from '../test/factories.js';

describe('multi-club application context', () => {
    it('returns all active and historical memberships with a legacy active club', async () => {
        const ownerA = await createUser();
        const ownerB = await createUser();
        const ownerC = await createUser();
        const member = await createUser();
        const clubA = await createClub(ownerA, { id: 'club_context_a', name: 'Context A' });
        const clubB = await createClub(ownerB, { id: 'club_context_b', name: 'Context B' });
        const clubC = await createClub(ownerC, { id: 'club_context_c', name: 'Context C' });
        await addClubMember(clubA, member, 'member');
        await addClubMember(clubB, member, 'admin');
        await addClubMember(clubC, member, 'member');
        await db.query(
            `UPDATE user_clubs SET status = 'REVOKED', revoked_at = NOW()
             WHERE club_id = $1 AND user_id = $2`,
            [clubC.id, member.id]
        );

        const playerA = await createPlayer(clubA, { name: 'Player A' });
        const playerB = await createPlayer(clubB, { name: 'Player B' });
        await createPlayerLink(member, playerA, { status: 'approved' });
        await createPlayerLink(member, playerB, { status: 'approved' });

        const response = await request(app)
            .get('/api/v1/clubs/mine')
            .set('Authorization', authorization(member))
            .expect(200);

        expect(response.body.clubs).toHaveLength(3);
        expect(response.body.clubs.map(entry => entry.club.id)).toEqual([
            clubA.id,
            clubB.id,
            clubC.id,
        ]);
        expect(response.body.clubs[0]).toMatchObject({
            membership: { role: 'member', status: 'ACTIVE_MEMBER' },
            linkedPlayer: { id: playerA.id, name: 'Player A' },
        });
        expect(response.body.clubs[1]).toMatchObject({
            membership: { role: 'admin', status: 'ACTIVE_MEMBER' },
            linkedPlayer: { id: playerB.id, name: 'Player B' },
        });
        expect(response.body.clubs[2].membership.status).toBe('REVOKED');
        expect(response.body.club.id).toBe(clubA.id);
        expect(response.body.membership).toEqual({ role: 'member' });
        expect(response.body.clubs[0].club).not.toHaveProperty('settings_json');
    });

    it('loads an explicit active club context with club-specific role and player', async () => {
        const owner = await createUser();
        const member = await createUser();
        const club = await createClub(owner, { settings: { locale: 'en' } });
        await addClubMember(club, member, 'admin');
        const player = await createPlayer(club);
        await createPlayerLink(member, player, { status: 'approved' });

        const response = await request(app)
            .get(`/api/v1/clubs/${club.id}/context`)
            .set('Authorization', authorization(member))
            .expect(200);

        expect(response.body).toMatchObject({
            club: { id: club.id, settings_json: { locale: 'en' } },
            membership: { role: 'admin', status: 'ACTIVE_MEMBER' },
            linkedPlayer: { id: player.id },
            capabilities: {
                canManagePlayers: true,
                canManageAdmins: false,
            },
        });
    });

    it('rejects explicit context access after membership revocation', async () => {
        const owner = await createUser();
        const member = await createUser();
        const outsider = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, member);
        await db.query(
            `UPDATE user_clubs SET status = 'REVOKED', revoked_at = NOW()
             WHERE club_id = $1 AND user_id = $2`,
            [club.id, member.id]
        );

        await request(app)
            .get(`/api/v1/clubs/${club.id}/context`)
            .set('Authorization', authorization(member))
            .expect(403);
        await request(app)
            .get(`/api/v1/clubs/${club.id}/context`)
            .set('Authorization', authorization(outsider))
            .expect(403);
    });

    it('does not load an archived club as the active application context', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        await db.query(
            `UPDATE clubs SET status = 'archived', archived_at = NOW() WHERE id = $1`,
            [club.id]
        );

        const response = await request(app)
            .get(`/api/v1/clubs/${club.id}/context`)
            .set('Authorization', authorization(owner))
            .expect(409);

        expect(response.body).toEqual({ error: 'This club is not active.' });
    });

    it('allows an existing member to create and own another club', async () => {
        const user = await createUser();
        const firstClub = await createClub(user);

        const response = await request(app)
            .post('/api/v1/clubs')
            .set('Authorization', authorization(user))
            .send({ name: 'Second Owned Club', federation: 'TEST', is_public: false })
            .expect(201);

        expect(response.body.club.id).not.toBe(firstClub.id);
        const memberships = await db.query(
            `SELECT club_id, role, status FROM user_clubs
             WHERE user_id = $1 ORDER BY club_id`,
            [user.id]
        );
        expect(memberships.rows).toHaveLength(2);
        expect(memberships.rows.every(row => row.role === 'owner' && row.status === 'ACTIVE_MEMBER')).toBe(true);
    });

    it('returns an empty canonical collection when the account has no memberships', async () => {
        const user = await createUser();

        const response = await request(app)
            .get('/api/v1/clubs/mine')
            .set('Authorization', authorization(user))
            .expect(200);

        expect(response.body).toMatchObject({
            clubs: [],
            club: null,
            membership: null,
            linkedPlayer: null,
        });
    });
});
