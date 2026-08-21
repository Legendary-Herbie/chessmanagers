import { describe, expect, it } from 'vitest';
import db from '../database/database.js';
import { readBaselineSchema } from '../database/migrations/1700000000000_baseline.js';
import { down as reconciliationDown } from '../database/migrations/1700000000002_reconcile_multitenant_model.js';
import { down as clubManagementDown } from '../database/migrations/1700000000003_club_management.js';
import { down as membershipLifecycleDown } from '../database/migrations/1700000000004_membership_lifecycle.js';
import { down as playerLifecycleDown } from '../database/migrations/1700000000005_player_lifecycle.js';
import {
    AUTHORITATIVE_RATINGS_SQL,
    down as authoritativeRatingsDown,
} from '../database/migrations/1700000000006_authoritative_ratings.js';
import {
    MATCH_LIFECYCLE_SQL,
    down as matchLifecycleDown,
} from '../database/migrations/1700000000007_match_lifecycle.js';
import {
    PUBLIC_SEARCH_BOUNDARY_SQL,
    down as publicSearchBoundaryDown,
} from '../database/migrations/1700000000008_public_search_boundary.js';
import {
    TOURNAMENT_DOMAIN_SQL,
    down as tournamentDomainDown,
} from '../database/migrations/1700000000009_tournament_domain.js';
import {
    AUTHENTICATION_LIFECYCLE_SQL,
    down as authenticationLifecycleDown,
} from '../database/migrations/1700000000010_authentication_lifecycle.js';

describe('test database safety and migrations', () => {
    it('runs against an isolated test database', async () => {
        const result = await db.query('SELECT current_database() AS name');

        expect(result.first.name).toMatch(/_test$/);
    });

    it('has the authoritative baseline tables and migrations', async () => {
        const tables = await db.query(
            `SELECT table_name
             FROM information_schema.tables
             WHERE table_schema = 'public'
             ORDER BY table_name`
        );
        const names = new Set(tables.rows.map(row => row.table_name));

        expect(names.has('users')).toBe(true);
        expect(names.has('clubs')).toBe(true);
        expect(names.has('players')).toBe(true);
        expect(names.has('matches')).toBe(true);
        expect(names.has('rating_history')).toBe(true);
        expect(names.has('player_links')).toBe(true);
        expect(names.has('club_rating_settings')).toBe(true);
        expect(names.has('club_audit_events')).toBe(true);
        expect(names.has('club_membership_events')).toBe(true);
        expect(names.has('club_join_codes')).toBe(true);
        expect(names.has('notifications')).toBe(true);
        expect(names.has('player_lifecycle_events')).toBe(true);
        expect(names.has('player_link_events')).toBe(true);
        expect(names.has('player_rating_state')).toBe(true);
        expect(names.has('rating_recalculation_jobs')).toBe(true);
        expect(names.has('match_audit_events')).toBe(true);
        expect(names.has('tournament_rounds')).toBe(true);
        expect(names.has('tournament_pairings')).toBe(true);
        expect(names.has('email_verification_tokens')).toBe(true);
        expect(names.has('oauth_identities')).toBe(true);
        expect(names.has('oauth_states')).toBe(true);

        const migrations = await db.query('SELECT COUNT(*)::int AS count FROM pgmigrations');
        expect(migrations.first.count).toBeGreaterThanOrEqual(11);

        const reconciledColumns = await db.query(
            `SELECT table_name, column_name
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND (table_name, column_name) IN (
                   ('users', 'username'),
                   ('clubs', 'visibility'),
                   ('user_clubs', 'status'),
                   ('players', 'status'),
                   ('players', 'public_id'),
                   ('player_links', 'club_id')
               )`
        );
        expect(reconciledColumns.rowCount).toBe(6);

        const matchLifecycle = await db.query(
            `SELECT table_name, column_name, column_default
             FROM information_schema.columns
             WHERE table_schema = 'public' AND (
                (table_name = 'matches' AND column_name IN ('rating_category', 'is_rated', 'status', 'played_at'))
                OR (table_name = 'tournaments' AND column_name IN ('rating_category', 'is_rated'))
             )`
        );
        expect(matchLifecycle.rowCount).toBe(6);
        expect(matchLifecycle.rows.find(row => (
            row.table_name === 'matches' && row.column_name === 'played_at'
        )).column_default).toBeNull();
    });

    it('keeps the baseline schema immutable', () => {
        expect(readBaselineSchema()).toContain('CREATE TABLE IF NOT EXISTS users');
    });

    it('reapplies the authoritative-ratings migration safely', async () => {
        await expect(db.query(AUTHORITATIVE_RATINGS_SQL)).resolves.toBeDefined();
        await expect(db.query(MATCH_LIFECYCLE_SQL)).resolves.toBeDefined();
        await expect(db.query(PUBLIC_SEARCH_BOUNDARY_SQL)).resolves.toBeDefined();
        await expect(db.query(TOURNAMENT_DOMAIN_SQL)).resolves.toBeDefined();
        await expect(db.query(AUTHENTICATION_LIFECYCLE_SQL)).resolves.toBeDefined();
    });

    it('documents the reconciliation migration as irreversible', async () => {
        await expect(reconciliationDown()).rejects.toThrow('intentionally irreversible');
        await expect(clubManagementDown()).rejects.toThrow('intentionally irreversible');
        await expect(membershipLifecycleDown()).rejects.toThrow('intentionally irreversible');
        await expect(playerLifecycleDown()).rejects.toThrow('intentionally irreversible');
        await expect(authoritativeRatingsDown()).rejects.toThrow('intentionally irreversible');
        await expect(matchLifecycleDown()).rejects.toThrow('intentionally irreversible');
        await expect(publicSearchBoundaryDown()).rejects.toThrow('intentionally irreversible');
        await expect(tournamentDomainDown()).rejects.toThrow('intentionally irreversible');
        await expect(authenticationLifecycleDown()).rejects.toThrow('intentionally irreversible');
    });
});
