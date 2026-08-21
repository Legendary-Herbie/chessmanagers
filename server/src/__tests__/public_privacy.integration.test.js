import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import {
    authorization,
    createClub,
    createPlayer,
    createPlayerLink,
    createTournament,
    createUser,
} from '../test/factories.js';

describe('public visibility and DTO boundaries', () => {
    it('blocks guessed private-club IDs from public chess-data endpoints', async () => {
        const owner = await createUser();
        const club = await createClub(owner, { id: 'club_private_resources', isPublic: false });
        const player = await createPlayer(club, { id: 'player_private_resource' });
        const tournament = await createTournament(club, { id: 'tour_private_resource' });

        const urls = [
            `/api/v1/public/clubs/${club.id}/leaderboard`,
            `/api/v1/public/clubs/${club.id}/players/${player.id}`,
            `/api/v1/public/clubs/${club.id}/tournaments/${tournament.id}`,
        ];

        for (const url of urls) {
            const response = await request(app).get(url).expect(404);
            expect(response.body).toEqual({ error: 'Resource not found.' });
        }
    });

    it('returns a limited presentation DTO for direct private-club access', async () => {
        const owner = await createUser();
        const club = await createClub(owner, {
            id: 'club_private_presentation',
            isPublic: false,
            settings: { internalFlag: 'do-not-expose' },
        });
        await db.query(
            `UPDATE clubs SET share_token = 'private-share-token', contact_info = 'Public contact' WHERE id = $1`,
            [club.id]
        );

        const response = await request(app)
            .get(`/api/v1/clubs/${club.id}`)
            .set('Authorization', authorization(owner))
            .expect(200);

        expect(response.body.club).toMatchObject({
            id: club.id,
            name: club.name,
            contact_info: 'Public contact',
            is_member: true,
            member_role: 'owner',
        });
        expect(response.body.club).not.toHaveProperty('owner_id');
        expect(response.body.club).not.toHaveProperty('settings_json');
        expect(response.body.club).not.toHaveProperty('share_token');
    });

    it('allowlists public player and tournament fields without account-link identifiers', async () => {
        const owner = await createUser();
        const linkedUser = await createUser();
        const club = await createClub(owner, { id: 'club_public_resources', isPublic: true });
        const player = await createPlayer(club, { id: 'player_public_resource', bio: 'Public biography' });
        await createPlayerLink(linkedUser, player, { status: 'approved', reviewedAt: new Date() });
        const tournament = await createTournament(club, {
            id: 'tour_public_resource',
            settings: { internalPairingSeed: 42 },
        });
        await db.query(
            'INSERT INTO tournament_players (tournament_id, player_id) VALUES ($1, $2)',
            [tournament.id, player.id]
        );

        const playerResponse = await request(app)
            .get(`/api/v1/public/clubs/${club.id}/players/${player.public_id}`)
            .expect(200);
        expect(playerResponse.body.player).toMatchObject({
            publicPlayerId: player.public_id,
            name: player.name,
            bio: 'Public biography',
        });
        expect(playerResponse.body.player).not.toHaveProperty('id');
        expect(playerResponse.body.player).not.toHaveProperty('link_status');
        expect(playerResponse.body.player).not.toHaveProperty('linked_user_id');
        expect(playerResponse.body.player).not.toHaveProperty('updated_at');

        const tournamentResponse = await request(app)
            .get(`/api/v1/public/clubs/${club.id}/tournaments/${tournament.id}`)
            .expect(200);
        expect(tournamentResponse.body.tournament).toMatchObject({
            id: tournament.id,
        });
        expect(tournamentResponse.body.tournament).not.toHaveProperty('club_id');
        expect(tournamentResponse.body.tournament).not.toHaveProperty('settings_json');
        expect(tournamentResponse.body.players[0]).not.toHaveProperty('linked_user_id');
    });
});
