import db from '../database/database.js';

export const EXPORT_COLUMNS = {
    players: [
        'player_id', 'name', 'federation_id', 'status', 'created_at', 'archived_at', 'deleted_at',
    ],
    matches: [
        'match_id', 'played_at', 'white_player_id', 'white_player_name', 'black_player_id',
        'black_player_name', 'result', 'rating_category', 'is_rated', 'status', 'tournament_id',
        'tournament_name', 'notes', 'void_reason', 'voided_at', 'delete_reason', 'deleted_at',
        'created_at',
    ],
    ratings: [
        'player_id', 'player_name', 'category', 'start_rating', 'current_rating',
        'completed_rated_games', 'peak_rating', 'player_status', 'archived_at', 'deleted_at',
    ],
};

const isoDate = value => value instanceof Date ? value.toISOString() : value;

export function escapeSpreadsheetCell(value) {
    const normalized = isoDate(value);
    if (typeof normalized !== 'string') return normalized;
    return /^(?:\s*[=+\-@]|[\t\r])/.test(normalized) ? `'${normalized}` : normalized;
}

export function protectSpreadsheetRows(rows) {
    return rows.map(row => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, escapeSpreadsheetCell(value)])
    ));
}

async function recordAudit(trx, { clubId, actorUserId, exportType, filters, rowCount }) {
    await trx.query(
        `INSERT INTO data_export_audit (club_id, actor_user_id, export_type, filters_json, row_count)
         VALUES ($1, $2, $3, $4::JSONB, $5)`,
        [clubId, actorUserId, exportType, JSON.stringify(filters), rowCount]
    );
}

async function exportRows({ clubId, actorUserId, exportType, filters, query, params }) {
    return db.transaction(async trx => {
        const rows = await trx.query(query, params).then(result => result.rows);
        await recordAudit(trx, {
            clubId,
            actorUserId,
            exportType,
            filters,
            rowCount: rows.length,
        });
        return protectSpreadsheetRows(rows);
    });
}

export async function exportPlayers(clubId, actorUserId, { includeInactive = false } = {}) {
    const lifecycleFilter = includeInactive
        ? ''
        : "AND player.status = 'active' AND player.deleted_at IS NULL";
    return exportRows({
        clubId,
        actorUserId,
        exportType: 'players',
        filters: { includeInactive },
        query: `
            SELECT player.id AS player_id, player.name, player.federation_id,
                   player.status, player.created_at, player.archived_at, player.deleted_at
            FROM players player
            WHERE player.club_id = $1 ${lifecycleFilter}
            ORDER BY LOWER(player.name), player.id`,
        params: [clubId],
    });
}

export async function exportMatches(clubId, actorUserId, { category } = {}) {
    const categoryFilter = category ? 'AND match.rating_category = $2' : '';
    return exportRows({
        clubId,
        actorUserId,
        exportType: 'matches',
        filters: { category: category || null },
        query: `
            SELECT match.id AS match_id, match.played_at,
                   match.white_player_id, white_player.name AS white_player_name,
                   match.black_player_id, black_player.name AS black_player_name,
                   match.result, match.rating_category,
                   CASE WHEN match.is_rated THEN 'true' ELSE 'false' END AS is_rated,
                   match.status,
                   match.tournament_id, tournament.name AS tournament_name, match.notes,
                   match.void_reason, match.voided_at, match.delete_reason, match.deleted_at,
                   match.created_at
            FROM matches match
            JOIN players white_player
              ON white_player.id = match.white_player_id AND white_player.club_id = match.club_id
            JOIN players black_player
              ON black_player.id = match.black_player_id AND black_player.club_id = match.club_id
            LEFT JOIN tournaments tournament
              ON tournament.id = match.tournament_id AND tournament.club_id = match.club_id
            WHERE match.club_id = $1 ${categoryFilter}
            ORDER BY match.played_at, match.id`,
        params: category ? [clubId, category] : [clubId],
    });
}

export async function exportRatings(
    clubId,
    actorUserId,
    { category, includeInactive = false } = {}
) {
    const conditions = ['player.club_id = $1'];
    const params = [clubId];
    if (!includeInactive) {
        conditions.push("player.status = 'active'", 'player.deleted_at IS NULL');
    }
    if (category) {
        params.push(category);
        conditions.push(`state.category = $${params.length}`);
    }

    return exportRows({
        clubId,
        actorUserId,
        exportType: 'ratings',
        filters: { category: category || null, includeInactive },
        query: `
            SELECT player.id AS player_id, player.name AS player_name, state.category,
                   state.start_rating, state.current_rating, state.completed_rated_games,
                   state.peak_rating, player.status AS player_status,
                   player.archived_at, player.deleted_at
            FROM player_rating_state state
            JOIN players player
              ON player.id = state.player_id AND player.club_id = state.club_id
            WHERE ${conditions.join(' AND ')}
            ORDER BY CASE state.category
                        WHEN 'blitz' THEN 1 WHEN 'rapid' THEN 2 ELSE 3
                     END,
                     state.current_rating DESC, LOWER(player.name), player.id`,
        params,
    });
}
