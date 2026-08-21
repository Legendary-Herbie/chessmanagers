import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import {
    authorization,
    createClub,
    createUser,
} from '../test/factories.js';

describe('API contracts', () => {
    it('returns field errors for invalid request payloads', async () => {
        const response = await request(app)
            .post('/api/v1/auth/register')
            .send({ email: 'not-an-email', name: '', password: 'short' })
            .expect(400);

        expect(response.body).toMatchObject({ error: 'Validation failed.' });
        expect(response.body.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'email' }),
            expect.objectContaining({ field: 'name' }),
            expect.objectContaining({ field: 'password' }),
        ]));
    });

    it('returns a consistent authentication error for protected routes', async () => {
        const response = await request(app)
            .get('/api/v1/clubs/club_missing/players')
            .expect(401);

        expect(response.body).toEqual({ error: 'Authentication required.' });
    });

    it('does not let a member of one club read another club through protected APIs', async () => {
        const ownerA = await createUser();
        const ownerB = await createUser();
        await createClub(ownerA, { id: 'club_a' });
        await createClub(ownerB, { id: 'club_b' });

        const response = await request(app)
            .get('/api/v1/clubs/club_b/matches')
            .set('Authorization', authorization(ownerA))
            .expect(403);

        expect(response.body).toEqual({ error: 'You are not a member of this club.' });
    });

    it('lists public clubs without exposing private clubs', async () => {
        const publicOwner = await createUser();
        const privateOwner = await createUser();
        const publicClub = await createClub(publicOwner, { id: 'club_public', isPublic: true });
        await createClub(privateOwner, { id: 'club_private', isPublic: false });

        const response = await request(app)
            .get('/api/v1/clubs')
            .expect(200);

        expect(response.body.clubs.map(club => club.id)).toEqual([publicClub.id]);
    });

    it('rejects the legacy all query instead of exposing private clubs', async () => {
        const globalAdmin = await createUser({ role: 'admin' });
        await createClub(globalAdmin, { id: 'club_private_admin', isPublic: false });

        const response = await request(app)
            .get('/api/v1/clubs?all=1')
            .set('Authorization', authorization(globalAdmin))
            .expect(400);

        expect(response.body.error).toBe('Validation failed.');
        expect(response.body.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'query' }),
        ]));
    });

    it('validates and bounds pagination query parameters', async () => {
        const response = await request(app)
            .get('/api/v1/clubs?limit=101&offset=-1')
            .expect(400);

        expect(response.body).toMatchObject({ error: 'Validation failed.' });
        expect(response.body.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'query.limit' }),
            expect.objectContaining({ field: 'query.offset' }),
        ]));
    });

    it('validates route parameter groups before database access', async () => {
        const invalidId = `club_${'x'.repeat(200)}`;
        const response = await request(app)
            .get(`/api/v1/clubs/${invalidId}`)
            .expect(400);

        expect(response.body.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'params.clubId' }),
        ]));
    });
});
