import db from '../database/database.js';
import env from '../config/env.js';
import { calculateNewRatings } from '../utils/ratings.js';

const CATEGORIES = new Set(['blitz', 'rapid', 'classical']);
const LEGACY_COLUMNS = {
    blitz: 'blitz_rating',
    rapid: 'rapid_rating',
    classical: 'classical_rating',
};
const scheduledScopes = new Set();
let backgroundDrain = null;

function assertCategory(category) {
    if (!CATEGORIES.has(category)) throw new Error(`Unsupported rating category: ${category}`);
}

export async function enqueueRatingRecalculation({ clubId, category, affectedFrom }, trx) {
    assertCategory(category);
    const query = trx?.query?.bind(trx) ?? db.query.bind(db);
    return query(
        `INSERT INTO rating_recalculation_jobs (club_id, category, affected_from)
         VALUES ($1, $2, $3)
         ON CONFLICT (club_id, category) WHERE status = 'pending'
         DO UPDATE SET affected_from = LEAST(rating_recalculation_jobs.affected_from, EXCLUDED.affected_from),
                       updated_at = NOW()
         RETURNING id, club_id, category, affected_from, status`,
        [clubId, category, affectedFrom]
    ).then(result => result.first);
}

async function ensureRatingStates(trx, clubId, category) {
    await trx.query(
        `INSERT INTO player_rating_state (
            club_id, player_id, category, start_rating, current_rating, completed_rated_games, peak_rating
         )
         SELECT player.club_id, player.id, settings.category,
                settings.initial_rating, settings.initial_rating, 0, NULL
         FROM players player
         JOIN club_rating_settings settings ON settings.club_id = player.club_id AND settings.category = $2
         WHERE player.club_id = $1
         ON CONFLICT (player_id, category) DO NOTHING`,
        [clubId, category]
    );
}

export async function replayRatingCategory(trx, clubId, category, affectedFrom = null) {
    assertCategory(category);
    const settings = await trx.query(
        `SELECT initial_rating, rating_floor, established_k_factor,
                provisional_k_factor, provisional_games
         FROM club_rating_settings
         WHERE club_id = $1 AND category = $2
         FOR SHARE`,
        [clubId, category]
    ).then(result => result.first);
    if (!settings) throw new Error(`Rating settings missing for ${clubId}/${category}`);

    await ensureRatingStates(trx, clubId, category);
    const rows = await trx.query(
        `SELECT state.player_id, state.start_rating, player.name,
                CASE WHEN $3::TIMESTAMPTZ IS NULL THEN state.start_rating ELSE COALESCE((
                    SELECT history.rating_after
                    FROM rating_history history
                    WHERE history.club_id = state.club_id
                      AND history.category = state.category
                      AND history.player_id = state.player_id
                      AND history.played_at < $3
                    ORDER BY history.played_at DESC, history.match_id DESC
                    LIMIT 1
                ), state.start_rating) END AS seed_rating,
                CASE WHEN $3::TIMESTAMPTZ IS NULL THEN 0 ELSE (
                    SELECT COUNT(*)::INTEGER
                    FROM rating_history history
                    WHERE history.club_id = state.club_id
                      AND history.category = state.category
                      AND history.player_id = state.player_id
                      AND history.played_at < $3
                ) END AS seed_games,
                CASE WHEN $3::TIMESTAMPTZ IS NULL THEN NULL ELSE (
                    SELECT MAX(history.rating_after)::INTEGER
                    FROM rating_history history
                    WHERE history.club_id = state.club_id
                      AND history.category = state.category
                      AND history.player_id = state.player_id
                      AND history.played_at < $3
                ) END AS seed_peak
         FROM player_rating_state state
         JOIN players player ON player.id = state.player_id AND player.club_id = state.club_id
         WHERE state.club_id = $1 AND state.category = $2
         ORDER BY state.player_id
         FOR UPDATE OF state`,
        [clubId, category, affectedFrom]
    ).then(result => result.rows);

    const states = new Map(rows.map(row => [row.player_id, {
        id: row.player_id,
        name: row.name,
        rating: row.seed_rating,
        completedRatedGames: row.seed_games,
        peakRating: row.seed_peak,
    }]));
    const matches = await trx.query(
        `SELECT id, white_player_id, black_player_id, result, played_at
         FROM matches
         WHERE club_id = $1 AND rating_category = $2
           AND is_rated = TRUE AND status = 'active'
           AND ($3::TIMESTAMPTZ IS NULL OR played_at >= $3)
         ORDER BY played_at ASC, id ASC`,
        [clubId, category, affectedFrom]
    ).then(result => result.rows);

    await trx.query(
        `DELETE FROM rating_history
         WHERE club_id = $1 AND category = $2
           AND ($3::TIMESTAMPTZ IS NULL OR played_at >= $3)`,
        [clubId, category, affectedFrom]
    );

    const engineSettings = {
        initialRating: settings.initial_rating,
        ratingFloor: settings.rating_floor,
        establishedKFactor: settings.established_k_factor,
        provisionalKFactor: settings.provisional_k_factor,
        provisionalGames: settings.provisional_games,
        roundRatings: true,
    };

    for (const match of matches) {
        const white = states.get(match.white_player_id);
        const black = states.get(match.black_player_id);
        if (!white || !black) throw new Error(`Match ${match.id} references a player without rating state`);
        const { newWhiteRating, newBlackRating } = calculateNewRatings(
            white.rating,
            black.rating,
            match.result,
            white,
            black,
            engineSettings
        );
        await trx.query(
            `INSERT INTO rating_history (
                club_id, category, player_id, match_id, rating_before, rating_after, played_at
             ) VALUES
                ($1, $2, $3, $4, $5, $6, $7),
                ($1, $2, $8, $4, $9, $10, $7)`,
            [
                clubId, category, white.id, match.id, white.rating, newWhiteRating, match.played_at,
                black.id, black.rating, newBlackRating,
            ]
        );
        states.set(white.id, {
            ...white,
            rating: newWhiteRating,
            completedRatedGames: white.completedRatedGames + 1,
            peakRating: white.peakRating === null ? newWhiteRating : Math.max(white.peakRating, newWhiteRating),
        });
        states.set(black.id, {
            ...black,
            rating: newBlackRating,
            completedRatedGames: black.completedRatedGames + 1,
            peakRating: black.peakRating === null ? newBlackRating : Math.max(black.peakRating, newBlackRating),
        });
    }

    for (const state of states.values()) {
        await trx.query(
            `UPDATE player_rating_state
             SET current_rating = $3, completed_rated_games = $4,
                 peak_rating = $5, updated_at = NOW()
             WHERE club_id = $1 AND player_id = $2 AND category = $6`,
            [
                clubId, state.id, state.rating, state.completedRatedGames,
                state.peakRating, category,
            ]
        );
    }

    const legacyColumn = LEGACY_COLUMNS[category];
    await trx.query(
        `UPDATE players player
         SET ${legacyColumn} = state.current_rating,
             rating = CASE WHEN $2 = 'blitz' THEN state.current_rating ELSE player.rating END,
             updated_at = NOW()
         FROM player_rating_state state
         WHERE state.club_id = $1 AND state.category = $2
           AND state.player_id = player.id AND player.club_id = state.club_id`,
        [clubId, category]
    );

    return { matchesProcessed: matches.length, playersUpdated: states.size };
}

async function nextPendingJob(scope = {}) {
    const conditions = ["(status = 'pending' OR (status = 'failed' AND attempts < 3))"];
    const values = [];
    if (scope.clubId) {
        values.push(scope.clubId);
        conditions.push(`club_id = $${values.length}`);
    }
    if (scope.category) {
        values.push(scope.category);
        conditions.push(`category = $${values.length}`);
    }
    return db.query(
        `SELECT id, club_id, category, affected_from FROM rating_recalculation_jobs
         WHERE ${conditions.join(' AND ')}
         ORDER BY affected_from ASC, created_at ASC, id ASC
         LIMIT 1`,
        values
    ).then(result => result.first);
}

export async function processNextRatingJob(scope = {}) {
    const candidate = await nextPendingJob(scope);
    if (!candidate) return null;
    let claimedJobId = null;
    try {
        return await db.transaction(async (trx) => {
            await trx.query(
                'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
                [candidate.club_id, candidate.category]
            );
            const job = await trx.query(
                `SELECT * FROM rating_recalculation_jobs
                 WHERE id = $1 AND (status = 'pending' OR (status = 'failed' AND attempts < 3))
                 FOR UPDATE`,
                [candidate.id]
            ).then(result => result.first);
            if (!job) return { skipped: true };
            claimedJobId = job.id;
            await trx.query(
                `UPDATE rating_recalculation_jobs
                 SET status = 'running', attempts = attempts + 1, started_at = NOW(),
                     completed_at = NULL, last_error = NULL, updated_at = NOW()
                 WHERE id = $1`,
                [job.id]
            );
            const result = await replayRatingCategory(
                trx,
                job.club_id,
                job.category,
                job.affected_from
            );
            await trx.query(
                `UPDATE rating_recalculation_jobs
                 SET status = 'completed', completed_at = NOW(), updated_at = NOW()
                 WHERE id = $1`,
                [job.id]
            );
            return { jobId: job.id, clubId: job.club_id, category: job.category, ...result };
        });
    } catch (error) {
        if (claimedJobId) {
            await db.query(
                `UPDATE rating_recalculation_jobs
                 SET status = 'failed', attempts = attempts + 1,
                     last_error = LEFT($2, 2000), updated_at = NOW()
                 WHERE id = $1 AND status IN ('pending', 'failed')`,
                [claimedJobId, error.message]
            );
        }
        throw error;
    }
}

export async function drainRatingRecalculationJobs(scope = {}) {
    const results = [];
    while (true) {
        const result = await processNextRatingJob(scope);
        if (!result) return results;
        if (!result.skipped) results.push(result);
    }
}

export function scheduleRatingRecalculation(clubId, category) {
    if (env.NODE_ENV === 'test') return;
    const key = `${clubId}:${category}`;
    if (scheduledScopes.has(key)) return;
    scheduledScopes.add(key);
    queueMicrotask(async () => {
        try {
            await drainRatingRecalculationJobs({ clubId, category });
        } catch (error) {
            console.error(`[RATING] Recalculation failed for ${key}`, error);
        } finally {
            scheduledScopes.delete(key);
        }
    });
}

function runBackgroundDrain() {
    if (backgroundDrain) return backgroundDrain;
    backgroundDrain = drainRatingRecalculationJobs()
        .catch(error => {
            console.error('[RATING] Background recalculation failed', error);
        })
        .finally(() => {
            backgroundDrain = null;
        });
    return backgroundDrain;
}

export function startRatingRecalculationWorker() {
    void runBackgroundDrain();
    const interval = setInterval(runBackgroundDrain, 5_000);
    interval.unref();
    return interval;
}
