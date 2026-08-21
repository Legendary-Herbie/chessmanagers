import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import db from '../database/database.js';
import { DATA_EXPORTS_SQL } from '../database/migrations/1700000000013_data_exports.js';
import { escapeSpreadsheetCell } from '../services/DataExportService.js';
import { getClubCapabilities } from '../utils/clubCapabilities.js';
import {
    addClubMember,
    authorization,
    createClub,
    createMatch,
    createPlayer,
    createUser,
} from '../test/factories.js';

describe('club CSV exports', () => {
    it('allows only club owners and admins and keeps every export club-scoped', async () => {
        const owner = await createUser();
        const admin = await createUser();
        const member = await createUser();
        const otherOwner = await createUser();
        const club = await createClub(owner);
        const otherClub = await createClub(otherOwner);
        await addClubMember(club, admin, 'admin');
        await addClubMember(club, member);
        await createPlayer(club, { name: 'Scoped player' });
        await createPlayer(otherClub, { name: 'Other club player' });

        await request(app)
            .get(`/api/v1/clubs/${club.id}/exports/players.csv`)
            .set('Authorization', authorization(member))
            .expect(403);

        const adminExport = await request(app)
            .get(`/api/v1/clubs/${club.id}/exports/players.csv`)
            .set('Authorization', authorization(admin))
            .expect('Content-Type', /text\/csv/)
            .expect(200);
        expect(adminExport.text).toContain('Scoped player');
        expect(adminExport.text).not.toContain('Other club player');

        await request(app)
            .get(`/api/v1/clubs/${club.id}/exports/ratings.csv`)
            .set('Authorization', authorization(owner))
            .expect(200);
        await request(app)
            .get(`/api/v1/clubs/${club.id}/exports/players.csv`)
            .set('Authorization', authorization(otherOwner))
            .expect(403);
    });

    it('escapes CSV syntax and Unicode while neutralizing spreadsheet formulas', async () => {
        const owner = await createUser();
        const club = await createClub(owner, { slug: 'unicode-club' });
        await createPlayer(club, { name: '=HYPERLINK("https://invalid.test")' });
        await createPlayer(club, { name: 'José, "Knight"\nClub' });

        const response = await request(app)
            .get(`/api/v1/clubs/${club.id}/exports/players.csv`)
            .set('Authorization', authorization(owner))
            .expect('Content-Disposition', /unicode-club-players-\d{4}-\d{2}-\d{2}\.csv/)
            .expect(200);

        expect(response.text.charCodeAt(0)).toBe(0xfeff);
        expect(response.text).toContain("'=HYPERLINK");
        expect(response.text).not.toContain('\r\n=HYPERLINK');
        expect(response.text).toContain('"José, ""Knight""\nClub"');
        expect(response.headers['cache-control']).toBe('private, no-store');
    });

    it('exports inactive players only on request and records metadata without row content', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        await createPlayer(club, { name: 'Active player' });
        const inactive = await createPlayer(club, { name: 'Archived secret name' });
        await db.query(
            "UPDATE players SET status = 'inactive', archived_at = NOW() WHERE id = $1",
            [inactive.id]
        );

        const activeOnly = await request(app)
            .get(`/api/v1/clubs/${club.id}/exports/players.csv`)
            .set('Authorization', authorization(owner))
            .expect(200);
        expect(activeOnly.text).toContain('Active player');
        expect(activeOnly.text).not.toContain('Archived secret name');

        const allPlayers = await request(app)
            .get(`/api/v1/clubs/${club.id}/exports/players.csv?includeInactive=true`)
            .set('Authorization', authorization(owner))
            .expect(200);
        expect(allPlayers.text).toContain('Archived secret name');
        expect(allPlayers.text).toContain('inactive');

        const audit = await db.query(
            `SELECT actor_user_id, export_type, filters_json, row_count,
                    filters_json::TEXT AS serialized_filters
             FROM data_export_audit WHERE club_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
            [club.id]
        ).then(result => result.first);
        expect(audit).toMatchObject({
            actor_user_id: owner.id,
            export_type: 'players',
            filters_json: { includeInactive: true },
            row_count: 2,
        });
        expect(audit.serialized_filters).not.toContain('Archived secret name');
    });

    it('preserves match chronology, category, rated state, and void lifecycle fields', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const white = await createPlayer(club, { name: 'White' });
        const black = await createPlayer(club, { name: 'Black' });
        const rapid = await createMatch(club, white, black, {
            timeControl: 'rapid',
            playedAt: new Date('2026-02-03T12:00:00.000Z'),
            notes: '+SUM(1,2)',
            isRated: false,
            type: 'casual',
        });
        await db.query(
            `UPDATE matches SET status = 'voided', void_reason = $1, voided_at = NOW(), voided_by = $2
             WHERE id = $3`,
            ['Entered twice', owner.id, rapid.id]
        );
        await createMatch(club, white, black, {
            timeControl: 'blitz',
            playedAt: new Date('2026-01-01T12:00:00.000Z'),
            isRated: true,
        });

        const response = await request(app)
            .get(`/api/v1/clubs/${club.id}/exports/matches.csv?category=rapid`)
            .set('Authorization', authorization(owner))
            .expect(200);
        expect(response.text).toContain('2026-02-03T12:00:00.000Z');
        expect(response.text).toContain('rapid,false,voided');
        expect(response.text).toContain('Entered twice');
        expect(response.text).toContain("'+SUM(1,2)");
        expect(response.text).not.toContain('blitz');
    });

    it('exports current ratings by independent category and handles larger rosters', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        const player = await createPlayer(club, { name: 'Rated player', rating: 1600 });
        await db.query(
            `UPDATE player_rating_state
             SET current_rating = 1712, completed_rated_games = 12, peak_rating = 1740
             WHERE player_id = $1 AND category = 'classical'`,
            [player.id]
        );
        await db.query(
            `INSERT INTO players (id, club_id, name)
             SELECT 'player_export_bulk_' || number, $1, 'Bulk player ' || LPAD(number::TEXT, 3, '0')
             FROM generate_series(1, 220) number`,
            [club.id]
        );

        const ratings = await request(app)
            .get(`/api/v1/clubs/${club.id}/exports/ratings.csv?category=classical`)
            .set('Authorization', authorization(owner))
            .expect(200);
        expect(ratings.text).toContain('classical,1600,1712,12,1740');
        expect(ratings.text).not.toContain(',blitz,');
        expect(ratings.text).not.toContain(',rapid,');

        await request(app)
            .get(`/api/v1/clubs/${club.id}/exports/players.csv`)
            .set('Authorization', authorization(owner))
            .expect(200);
        const playerAudit = await db.query(
            `SELECT row_count FROM data_export_audit
             WHERE club_id = $1 AND export_type = 'players'
             ORDER BY created_at DESC, id DESC LIMIT 1`,
            [club.id]
        ).then(result => result.first);
        expect(playerAudit.row_count).toBe(221);
    });

    it('validates filters and keeps the additive migration and pure safety rules stable', async () => {
        const owner = await createUser();
        const club = await createClub(owner);
        await request(app)
            .get(`/api/v1/clubs/${club.id}/exports/ratings.csv?category=bullet`)
            .set('Authorization', authorization(owner))
            .expect(400);
        await request(app)
            .get(`/api/v1/clubs/${club.id}/exports/players.csv?includeInactive=1`)
            .set('Authorization', authorization(owner))
            .expect(400);

        expect(escapeSpreadsheetCell('  =2+2')).toBe("'  =2+2");
        expect(escapeSpreadsheetCell('@command')).toBe("'@command");
        expect(escapeSpreadsheetCell('ordinary')).toBe('ordinary');
        expect(getClubCapabilities('owner').canExportData).toBe(true);
        expect(getClubCapabilities('admin').canExportData).toBe(true);
        expect(getClubCapabilities('member').canExportData).toBe(false);
        await expect(db.query(DATA_EXPORTS_SQL)).resolves.toBeTruthy();
    });
});
