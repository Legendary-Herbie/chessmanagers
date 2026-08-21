import { afterAll, beforeEach } from 'vitest';
import db from '../database/database.js';
import pgDb from '../database/pg_database.js';
import { assertTestDatabase } from './testEnvironment.js';

const APP_TABLES = [
    'data_export_audit',
    'announcement_audit_events',
    'announcement_attachments',
    'announcements',
    'notification_outbox',
    'notifications',
    'oauth_states',
    'oauth_identities',
    'email_verification_tokens',
    'tournament_pairings',
    'tournament_rounds',
    'match_audit_events',
    'player_link_events',
    'player_lifecycle_events',
    'club_membership_events',
    'club_join_codes',
    'club_audit_events',
    'club_rating_settings',
    'rating_recalculation_jobs',
    'rating_history',
    'player_rating_state',
    'matches',
    'tournament_players',
    'tournaments',
    'player_links',
    'players',
    'club_invites',
    'club_join_requests',
    'refresh_tokens',
    'password_resets',
    'user_clubs',
    'clubs',
    'users',
];

beforeEach(async () => {
    assertTestDatabase();
    await db.query(`TRUNCATE TABLE ${APP_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
    await pgDb.pool.end();
});
