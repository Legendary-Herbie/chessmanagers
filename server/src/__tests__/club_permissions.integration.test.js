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

const playerPayload = (name) => ({ name, rating: 1500 });

describe('club-scoped permission matrix', () => {
    it('does not promote a global account role when the user creates a club', async () => {
        const user = await createUser({ role: 'member' });

        const response = await request(app)
            .post('/api/v1/clubs')
            .set('Authorization', authorization(user))
            .send({ name: 'Scoped Owner Club', federation: 'TEST', is_public: false })
            .expect(201);

        const account = await db.query('SELECT role FROM users WHERE id = $1', [user.id]);
        expect(account.first.role).toBe('member');
        expect(response.body.user).not.toHaveProperty('playerId');
        expect(response.body.user).not.toHaveProperty('linkStatus');
    });

    it('allows a club owner with a global member account to manage players', async () => {
        const owner = await createUser({ role: 'member' });
        const club = await createClub(owner);

        const context = await request(app)
            .get('/api/v1/clubs/mine')
            .set('Authorization', authorization(owner))
            .expect(200);

        expect(context.body.membership).toEqual({ role: 'owner' });
        expect(context.body.capabilities).toMatchObject({
            canManagePlayers: true,
            canManageMatches: true,
            canManageAdmins: true,
        });
        expect(context.body.club).not.toHaveProperty('share_token');
        expect(context.body.club).not.toHaveProperty('linked_player_id');

        const response = await request(app)
            .post(`/api/v1/clubs/${club.id}/players`)
            .set('Authorization', authorization(owner))
            .send(playerPayload('Owner Created Player'))
            .expect(201);

        expect(response.body.player.club_id).toBe(club.id);
    });

    it('does not let a global admin account bypass a member-only club role', async () => {
        const owner = await createUser();
        const globalAdmin = await createUser({ role: 'admin' });
        const club = await createClub(owner);
        await addClubMember(club, globalAdmin, 'member');

        const response = await request(app)
            .post(`/api/v1/clubs/${club.id}/players`)
            .set('Authorization', authorization(globalAdmin))
            .send(playerPayload('Forbidden Player'))
            .expect(403);

        expect(response.body).toEqual({ error: 'You do not have permission to perform this action.' });
    });

    it('keeps one user\'s admin permission isolated to the assigned club', async () => {
        const ownerA = await createUser();
        const ownerB = await createUser();
        const delegatedAdmin = await createUser({ role: 'member' });
        const clubA = await createClub(ownerA, { id: 'club_permission_a' });
        const clubB = await createClub(ownerB, { id: 'club_permission_b' });
        await addClubMember(clubA, delegatedAdmin, 'member');
        await addClubMember(clubB, delegatedAdmin, 'admin');

        await request(app)
            .post(`/api/v1/clubs/${clubA.id}/players`)
            .set('Authorization', authorization(delegatedAdmin))
            .send(playerPayload('Club A Player'))
            .expect(403);

        const allowed = await request(app)
            .post(`/api/v1/clubs/${clubB.id}/players`)
            .set('Authorization', authorization(delegatedAdmin))
            .send(playerPayload('Club B Player'))
            .expect(201);

        expect(allowed.body.player.club_id).toBe(clubB.id);
    });

    it('allows only the owner to assign or revoke club admins', async () => {
        const owner = await createUser();
        const admin = await createUser();
        const member = await createUser();
        const club = await createClub(owner);
        await addClubMember(club, admin, 'admin');
        await addClubMember(club, member, 'member');

        await request(app)
            .patch(`/api/v1/clubs/${club.id}/members/${member.id}/role`)
            .set('Authorization', authorization(admin))
            .send({ role: 'admin' })
            .expect(403);

        const response = await request(app)
            .patch(`/api/v1/clubs/${club.id}/members/${member.id}/role`)
            .set('Authorization', authorization(owner))
            .send({ role: 'admin' })
            .expect(200);

        expect(response.body.member).toEqual({ userId: member.id, role: 'admin' });
    });

    it('resolves self-edit permission from the approved link in the active club', async () => {
        const owner = await createUser();
        const member = await createUser({ role: 'member' });
        const club = await createClub(owner);
        await addClubMember(club, member, 'member');
        const player = await createPlayer(club);
        await createPlayerLink(member, player, { status: 'approved', reviewedAt: new Date() });

        const response = await request(app)
            .patch(`/api/v1/clubs/${club.id}/players/${player.id}`)
            .set('Authorization', authorization(member))
            .send({ bio: 'Club-scoped self edit' })
            .expect(200);

        expect(response.body.player.bio).toBe('Club-scoped self edit');
        const account = await db.query('SELECT role FROM users WHERE id = $1', [member.id]);
        expect(account.first.role).toBe('member');
    });

    it('prevents a linked member from changing admin-controlled player identity', async () => {
        const owner = await createUser();
        const member = await createUser({ role: 'member' });
        const club = await createClub(owner);
        await addClubMember(club, member, 'member');
        const player = await createPlayer(club, { name: 'Official Player Name' });
        await createPlayerLink(member, player, { status: 'approved', reviewedAt: new Date() });

        const response = await request(app)
            .patch(`/api/v1/clubs/${club.id}/players/${player.id}`)
            .set('Authorization', authorization(member))
            .send({ name: 'Unauthorized Rename' })
            .expect(403);

        expect(response.body).toEqual({
            error: 'Only club admins may change official player identity fields.',
        });
        const unchanged = await db.query('SELECT name FROM players WHERE id = $1', [player.id]);
        expect(unchanged.first.name).toBe('Official Player Name');
    });
});
