import db from '../database/database.js';
import { replayRatingCategory } from './RatingService.js';
import { drainAssetCleanup } from './AssetCleanupService.js';

async function lockRatings(trx, clubId) {
    // Use the rating worker's locks, in a fixed order across deletion requests.
    for (const category of ['blitz', 'classical', 'rapid']) {
        await trx.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [clubId, category]);
    }
}

export async function permanentlyDeleteClub({ clubId, ownerId }) {
    const deleted = await db.transaction(async trx => {
        await lockRatings(trx, clubId);
        const club = await trx.query('SELECT * FROM clubs WHERE id = $1 FOR UPDATE', [clubId]).then(r => r.first);
        if (!club || club.owner_id !== ownerId) return null;

        // File deletion is deferred until commit, with durable retries after failures.
        await trx.query(`INSERT INTO asset_cleanup_jobs (kind, asset_key)
            SELECT 'attachment', storage_key FROM announcement_attachments WHERE club_id = $1
            UNION SELECT 'image', photo_url FROM players WHERE club_id = $1 AND photo_url LIKE '/uploads/images/%'
            UNION SELECT 'image', logo FROM clubs WHERE id = $1 AND logo LIKE '/uploads/images/%'
            ON CONFLICT DO NOTHING`, [clubId]);
        await trx.query(`DELETE FROM notification_outbox WHERE notification_id IN
            (SELECT id FROM notifications WHERE club_id = $1)`, [clubId]);
        await trx.query(`DELETE FROM tournament_players WHERE tournament_id IN
            (SELECT id FROM tournaments WHERE club_id = $1)`, [clubId]);
        // Explicit ownership order keeps restrictive foreign keys as a safety net.
        for (const table of [
            'notifications', 'announcement_attachments', 'announcement_audit_events', 'announcements',
            'tournament_pairings', 'tournament_rounds', 'match_audit_events', 'rating_history', 'matches',
            'tournaments', 'player_link_events', 'player_links', 'player_lifecycle_events',
            'player_rating_state', 'players', 'rating_recalculation_jobs', 'club_rating_settings',
            'club_membership_events', 'club_invites', 'club_join_codes', 'club_join_requests',
            'data_export_audit', 'club_audit_events', 'user_clubs',
        ]) {
            await trx.query(`DELETE FROM ${table} WHERE club_id = $1`, [clubId]);
        }
        await trx.query('DELETE FROM clubs WHERE id = $1', [clubId]);
        return { ...club, status: 'deleted' };
    });
    if (deleted) await drainAssetCleanup();
    return deleted;
}

export async function permanentlyDeleteTournament(clubId, tournamentId) {
    return db.transaction(async trx => {
        await lockRatings(trx, clubId);
        const tournament = await trx.query(
            'SELECT id FROM tournaments WHERE id = $1 AND club_id = $2 FOR UPDATE',
            [tournamentId, clubId]
        ).then(r => r.first);
        if (!tournament) return null;
        const matches = await trx.query(
            'SELECT id, rating_category, is_rated FROM matches WHERE tournament_id = $1 AND club_id = $2 FOR UPDATE',
            [tournamentId, clubId]
        ).then(r => r.rows);
        const matchIds = matches.map(match => match.id);
        // Include earlier categories when a correction is awaiting replay.
        const historicalCategories = await trx.query(
            'SELECT DISTINCT category FROM rating_history WHERE club_id = $1 AND match_id = ANY($2::text[])',
            [clubId, matchIds]
        ).then(r => r.rows.map(row => row.category));
        const categories = new Set([...matches.map(match => match.rating_category), ...historicalCategories]);
        const notifications = await trx.query(`SELECT id FROM notifications WHERE club_id = $1
            AND (payload_json->>'tournamentId' = $2 OR payload_json->>'matchId' = ANY($3::text[]))`,
        [clubId, tournamentId, matchIds]).then(r => r.rows.map(row => row.id));
        await trx.query('DELETE FROM notification_outbox WHERE notification_id = ANY($1::text[])', [notifications]);
        await trx.query('DELETE FROM notifications WHERE id = ANY($1::text[])', [notifications]);
        for (const table of ['tournament_pairings', 'tournament_rounds']) {
            await trx.query(`DELETE FROM ${table} WHERE tournament_id = $1 AND club_id = $2`, [tournamentId, clubId]);
        }
        await trx.query('DELETE FROM tournament_players WHERE tournament_id = $1', [tournamentId]);
        for (const table of ['match_audit_events', 'rating_history']) {
            await trx.query(`DELETE FROM ${table} WHERE club_id = $1 AND match_id = ANY($2::text[])`, [clubId, matchIds]);
        }
        await trx.query('DELETE FROM matches WHERE club_id = $1 AND tournament_id = $2', [clubId, tournamentId]);
        await trx.query('DELETE FROM tournaments WHERE club_id = $1 AND id = $2', [clubId, tournamentId]);
        for (const category of [...categories].sort()) {
            await replayRatingCategory(trx, clubId, category);
        }
        return tournament;
    });
}
