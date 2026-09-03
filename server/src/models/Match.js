import db from '../database/database.js';

const qry = trx => trx ? trx.query.bind(trx) : db.query.bind(db);

function legacyType(isRated, tournamentId) {
    if (tournamentId) return 'tournament';
    return isRated ? 'rated' : 'casual';
}

export const MatchModel = {
    create: async ({ clubId, whitePlayerId, blackPlayerId, result, ratingCategory,
        isRated, tournamentId = null, notes = null, playedAt }, trx) => qry(trx)(
        `INSERT INTO matches (
            club_id, white_player_id, black_player_id, result,
            rating_category, is_rated, tournament_id, notes, played_at,
            type, time_control, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $5, 'active')
         RETURNING *`,
        [clubId, whitePlayerId, blackPlayerId, result, ratingCategory,
            isRated, tournamentId, notes, playedAt, legacyType(isRated, tournamentId)]
    ).then(result => result.first),

    findById: async (id, clubId, { includeDeleted = false, forUpdate = false, trx = null } = {}) => qry(trx)(
        `SELECT match.*, white_player.name AS white_player_name,
                black_player.name AS black_player_name
         FROM matches match
         JOIN players white_player ON white_player.id = match.white_player_id
         JOIN players black_player ON black_player.id = match.black_player_id
         WHERE match.id = $1 AND match.club_id = $2
           AND ($3::BOOLEAN OR match.status <> 'deleted')
         ${forUpdate ? 'FOR UPDATE OF match' : ''}`,
        [id, clubId, includeDeleted]
    ).then(result => result.first),

    findByClub: async (clubId, { q = '', ratingCategory, isRated, status, tournamentId,
        playerId, playedFrom, playedTo, sortBy = 'playedAt', sortDirection = 'desc',
        limit = 50, offset = 0 } = {}) => {
        const conditions = ["match.club_id = $1", "match.status <> 'deleted'"];
        const params = [clubId];
        const add = (sql, value) => {
            params.push(value);
            conditions.push(sql.replaceAll('?', `$${params.length}`));
        };
        if (ratingCategory) add('match.rating_category = ?', ratingCategory);
        if (isRated !== undefined) add('match.is_rated = ?', isRated);
        if (status) add('match.status = ?', status);
        if (tournamentId) add('match.tournament_id = ?', tournamentId);
        if (playerId) add('(match.white_player_id = ? OR match.black_player_id = ?)', playerId);
        if (playedFrom) add('match.played_at >= ?', playedFrom);
        if (playedTo) add('match.played_at <= ?', playedTo);
        if (q) add(`(white_player.name ILIKE '%' || ? || '%'
            OR black_player.name ILIKE '%' || ? || '%'
            OR COALESCE(match.notes, '') ILIKE '%' || ? || '%')`, q);
        params.push(limit, offset);
        const sortColumn = sortBy === 'createdAt' ? 'match.created_at' : 'match.played_at';
        const direction = sortDirection === 'asc' ? 'ASC' : 'DESC';
        return db.query(
            `SELECT match.*, white_player.name AS white_player_name,
                    black_player.name AS black_player_name, COUNT(*) OVER ()::INTEGER AS total_count
             FROM matches match
             JOIN players white_player ON white_player.id = match.white_player_id
             JOIN players black_player ON black_player.id = match.black_player_id
             WHERE ${conditions.join(' AND ')}
             ORDER BY ${sortColumn} ${direction}, match.id ${direction}
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        ).then(result => ({ matches: result.rows, total: result.rows[0]?.total_count ?? 0 }));
    },

    findByPlayer: async (clubId, playerId, { limit = 20, offset = 0 } = {}) => db.query(
        `SELECT match.*, white_player.name AS white_player_name,
                black_player.name AS black_player_name
         FROM matches match
         JOIN players white_player ON white_player.id = match.white_player_id
         JOIN players black_player ON black_player.id = match.black_player_id
         WHERE match.club_id = $1 AND match.status <> 'deleted'
           AND (match.white_player_id = $2 OR match.black_player_id = $2)
         ORDER BY match.played_at DESC, match.id DESC
         LIMIT $3 OFFSET $4`,
        [clubId, playerId, limit, offset]
    ).then(result => result.rows),

    findHeadToHead: async (clubId, playerAId, playerBId) => db.query(
        `SELECT match.*, white_player.name AS white_player_name,
                black_player.name AS black_player_name
         FROM matches match
         JOIN players white_player ON white_player.id = match.white_player_id
         JOIN players black_player ON black_player.id = match.black_player_id
         WHERE match.club_id = $1 AND match.status = 'active' AND (
            (match.white_player_id = $2 AND match.black_player_id = $3) OR
            (match.white_player_id = $3 AND match.black_player_id = $2)
         ) ORDER BY match.played_at DESC, match.id DESC`,
        [clubId, playerAId, playerBId]
    ).then(result => result.rows),

    findPossibleDuplicate: async ({ clubId, whitePlayerId, blackPlayerId, result,
        ratingCategory, isRated, tournamentId, playedAt, excludeMatchId = null }, trx) => qry(trx)(
        `SELECT * FROM matches
         WHERE club_id = $1 AND status = 'active'
           AND white_player_id = $2 AND black_player_id = $3
           AND result = $4 AND rating_category = $5 AND is_rated = $6
           AND tournament_id IS NOT DISTINCT FROM $7::TEXT
           AND played_at BETWEEN $8::TIMESTAMPTZ - INTERVAL '5 minutes'
                             AND $8::TIMESTAMPTZ + INTERVAL '5 minutes'
           AND ($9::TEXT IS NULL OR id <> $9)
         ORDER BY ABS(EXTRACT(EPOCH FROM (played_at - $8::TIMESTAMPTZ))), id LIMIT 1`,
        [clubId, whitePlayerId, blackPlayerId, result, ratingCategory,
            isRated, tournamentId, playedAt, excludeMatchId]
    ).then(result => result.first),

    hasLaterRatedMatch: async (clubId, ratingCategory, playedAt, trx) => qry(trx)(
        `SELECT EXISTS (SELECT 1 FROM matches
         WHERE club_id = $1 AND rating_category = $2
           AND is_rated = TRUE AND status = 'active' AND played_at > $3) AS exists`,
        [clubId, ratingCategory, playedAt]
    ).then(result => result.first.exists),

    update: async (id, clubId, values, trx) => qry(trx)(
        `UPDATE matches SET
             white_player_id = $3, black_player_id = $4, result = $5,
             rating_category = $6, time_control = $6, is_rated = $7,
             tournament_id = $8, type = $9, notes = $10, played_at = $11,
             updated_at = NOW()
         WHERE id = $1 AND club_id = $2 AND status = 'active'
         RETURNING *`,
        [id, clubId, values.whitePlayerId, values.blackPlayerId, values.result,
            values.ratingCategory, values.isRated, values.tournamentId,
            legacyType(values.isRated, values.tournamentId), values.notes, values.playedAt]
    ).then(result => result.first),

    void: async (id, clubId, actorUserId, reason, trx) => qry(trx)(
        `UPDATE matches SET status = 'voided', void_reason = $4,
             voided_at = NOW(), voided_by = $3, updated_at = NOW()
         WHERE id = $1 AND club_id = $2 AND status = 'active' RETURNING *`,
        [id, clubId, actorUserId, reason]
    ).then(result => result.first),

    softDelete: async (id, clubId, actorUserId, reason, trx) => qry(trx)(
        `UPDATE matches SET status = 'deleted', delete_reason = $4,
             deleted_at = NOW(), deleted_by = $3, updated_at = NOW()
         WHERE id = $1 AND club_id = $2 AND status IN ('active', 'voided') RETURNING *`,
        [id, clubId, actorUserId, reason]
    ).then(result => result.first),

    recordAudit: async ({ clubId, matchId, actorUserId, eventType,
        reason = null, oldState = null, newState = null }, trx) => qry(trx)(
        `INSERT INTO match_audit_events
            (club_id, match_id, actor_user_id, event_type, reason, old_state, new_state)
         VALUES ($1, $2, $3, $4, $5, $6::JSONB, $7::JSONB) RETURNING *`,
        [clubId, matchId, actorUserId, eventType, reason,
            oldState ? JSON.stringify(oldState) : null,
            newState ? JSON.stringify(newState) : null]
    ).then(result => result.first),

    deleteRatingHistory: async (id, clubId, trx) => qry(trx)(
        'DELETE FROM rating_history WHERE match_id = $1 AND club_id = $2',
        [id, clubId]
    ),
};
