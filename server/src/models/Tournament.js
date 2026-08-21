import db from '../database/database.js';
import { notifyLinkedPlayers } from '../services/NotificationService.js';

const queryFor = trx => trx ? trx.query.bind(trx) : db.query.bind(db);

export const TournamentModel = {
    create: async ({ clubId, name, type, startDate, endDate = null, ratingCategory, isRated }) => db.query(
        `INSERT INTO tournaments (
            club_id, name, type, start_date, end_date, status, rating_category, is_rated
         ) VALUES ($1, $2, $3, $4, $5, 'upcoming', $6, $7)
         RETURNING *`,
        [clubId, name, type, startDate, endDate, ratingCategory, isRated]
    ).then(result => result.first),

    findById: async (id, clubId, { includeDeleted = false, forUpdate = false, trx = null } = {}) => queryFor(trx)(
        `SELECT * FROM tournaments
         WHERE id = $1 AND club_id = $2 AND ($3::BOOLEAN OR deleted_at IS NULL)
         ${forUpdate ? 'FOR UPDATE' : ''}`,
        [id, clubId, includeDeleted]
    ).then(result => result.first),

    findByClub: async (clubId, { status, q = '', limit = 50, offset = 0 } = {}) => {
        const params = [clubId];
        const conditions = ['club_id = $1', 'deleted_at IS NULL'];
        if (status) {
            params.push(status);
            conditions.push(`status = $${params.length}`);
        }
        if (q) {
            params.push(q);
            conditions.push(`name ILIKE '%' || $${params.length} || '%'`);
        }
        params.push(limit, offset);
        return db.query(
            `SELECT *, COUNT(*) OVER ()::INTEGER AS total_count
             FROM tournaments
             WHERE ${conditions.join(' AND ')}
             ORDER BY start_date DESC, id DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        ).then(result => ({
            tournaments: result.rows,
            total: result.rows[0]?.total_count ?? 0,
        }));
    },

    getPlayers: async (tournamentId, clubId, trx = null) => queryFor(trx)(
        `SELECT p.id, p.public_id, p.name, p.bio, p.photo_url,
                p.blitz_rating, p.rapid_rating, p.classical_rating,
                p.status AS player_status,
                tp.joined_at, tp.registration_round, tp.status,
                tp.withdrawn_round, tp.bye_count, tp.seed,
                state.current_rating AS rating
         FROM tournament_players tp
         JOIN tournaments t ON t.id = tp.tournament_id AND t.club_id = $2
         JOIN players p ON p.id = tp.player_id AND p.club_id = t.club_id
         LEFT JOIN player_rating_state state
           ON state.player_id = p.id AND state.club_id = t.club_id
          AND state.category = t.rating_category
         WHERE tp.tournament_id = $1
         ORDER BY COALESCE(tp.seed, 2147483647), p.name, p.id`,
        [tournamentId, clubId]
    ).then(result => result.rows),

    getRounds: async (tournamentId, clubId, trx = null) => queryFor(trx)(
        `SELECT round.* FROM tournament_rounds round
         WHERE round.tournament_id = $1 AND round.club_id = $2
         ORDER BY round.round_number`,
        [tournamentId, clubId]
    ).then(result => result.rows),

    getPairings: async (tournamentId, clubId, trx = null) => queryFor(trx)(
        `SELECT pairing.*,
                white_player.name AS white_player_name,
                black_player.name AS black_player_name
         FROM tournament_pairings pairing
         JOIN tournament_rounds round ON round.id = pairing.round_id
           AND round.tournament_id = pairing.tournament_id
           AND round.club_id = pairing.club_id
         LEFT JOIN players white_player ON white_player.id = pairing.white_player_id
         LEFT JOIN players black_player ON black_player.id = pairing.black_player_id
         WHERE pairing.tournament_id = $1 AND pairing.club_id = $2
         ORDER BY pairing.round_number, pairing.board`,
        [tournamentId, clubId]
    ).then(result => result.rows),

    addPlayer: async (tournamentId, playerId, clubId) => db.transaction(async trx => {
        const tournament = await TournamentModel.findById(tournamentId, clubId, { forUpdate: true, trx });
        if (!tournament) return { ok: false, code: 'TOURNAMENT_NOT_FOUND' };
        if (tournament.status === 'completed') return { ok: false, code: 'TOURNAMENT_COMPLETED' };
        const player = await trx.query(
            `SELECT id FROM players
             WHERE id = $1 AND club_id = $2 AND status = 'active' AND deleted_at IS NULL
             FOR SHARE`,
            [playerId, clubId]
        ).then(result => result.first);
        if (!player) return { ok: false, code: 'PLAYER_NOT_FOUND' };
        const entry = await trx.query(
            `INSERT INTO tournament_players (
                tournament_id, player_id, registration_round, status, seed
             ) VALUES (
                $1, $2, $3, 'active',
                COALESCE((SELECT MAX(seed) + 1 FROM tournament_players WHERE tournament_id = $1), 1)
             )
             ON CONFLICT (tournament_id, player_id) DO NOTHING
             RETURNING *`,
            [tournamentId, playerId, tournament.current_round + 1]
        ).then(result => result.first);
        if (entry) {
            await notifyLinkedPlayers({
                trx,
                clubId,
                playerIds: [playerId],
                eventType: 'tournament.registered',
                dedupeKey: `tournament:${tournamentId}:registered:${playerId}:${new Date(entry.joined_at).toISOString()}`,
                payload: { tournamentId, tournamentName: tournament.name, playerId },
            });
        }
        return entry ? { ok: true, entry } : { ok: false, code: 'PLAYER_ALREADY_REGISTERED' };
    }),

    removePlayer: async (tournamentId, playerId, clubId) => db.transaction(async trx => {
        const tournament = await TournamentModel.findById(tournamentId, clubId, { forUpdate: true, trx });
        if (!tournament) return { ok: false, code: 'TOURNAMENT_NOT_FOUND' };
        if (tournament.current_round > 0) return { ok: false, code: 'TOURNAMENT_ALREADY_STARTED' };
        const removed = await trx.query(
            `DELETE FROM tournament_players
             WHERE tournament_id = $1 AND player_id = $2 RETURNING player_id, joined_at`,
            [tournamentId, playerId]
        ).then(result => result.first);
        if (removed) {
            await notifyLinkedPlayers({
                trx,
                clubId,
                playerIds: [playerId],
                eventType: 'tournament.removed',
                dedupeKey: `tournament:${tournamentId}:removed:${playerId}:${new Date(removed.joined_at).toISOString()}`,
                payload: { tournamentId, tournamentName: tournament.name, playerId },
            });
        }
        return removed ? { ok: true, removed } : { ok: false, code: 'PLAYER_NOT_REGISTERED' };
    }),

    withdrawPlayer: async (tournamentId, playerId, clubId) => db.transaction(async trx => {
        const tournament = await TournamentModel.findById(tournamentId, clubId, { forUpdate: true, trx });
        if (!tournament) return { ok: false, code: 'TOURNAMENT_NOT_FOUND' };
        if (tournament.status === 'completed') return { ok: false, code: 'TOURNAMENT_COMPLETED' };
        const entry = await trx.query(
            `UPDATE tournament_players
             SET status = 'withdrawn', withdrawn_round = $3
             WHERE tournament_id = $1 AND player_id = $2 AND status = 'active'
             RETURNING *`,
            [tournamentId, playerId, tournament.current_round]
        ).then(result => result.first);
        if (entry) {
            await notifyLinkedPlayers({
                trx,
                clubId,
                playerIds: [playerId],
                eventType: 'tournament.withdrawn',
                dedupeKey: `tournament:${tournamentId}:withdrawn:${playerId}`,
                payload: { tournamentId, tournamentName: tournament.name, playerId },
            });
        }
        return entry ? { ok: true, entry } : { ok: false, code: 'PLAYER_NOT_ACTIVE' };
    }),

    update: async (id, clubId, { name, startDate, endDate }) => db.query(
        `UPDATE tournaments
         SET name = COALESCE($1, name), start_date = COALESCE($2, start_date),
             end_date = CASE WHEN $3::BOOLEAN THEN $4::TIMESTAMPTZ ELSE end_date END,
             updated_at = NOW()
         WHERE id = $5 AND club_id = $6 AND deleted_at IS NULL
         RETURNING *`,
        [name, startDate, endDate !== undefined, endDate ?? null, id, clubId]
    ).then(result => result.first),

    setStatus: async (id, clubId, status) => db.transaction(async trx => {
        const tournament = await trx.query(
            `UPDATE tournaments SET status = $1, updated_at = NOW()
             WHERE id = $2 AND club_id = $3 AND deleted_at IS NULL RETURNING *`,
            [status, id, clubId]
        ).then(result => result.first);
        if (!tournament) return null;
        const playerIds = await trx.query(
            'SELECT player_id FROM tournament_players WHERE tournament_id = $1',
            [id]
        ).then(result => result.rows.map(row => row.player_id));
        await notifyLinkedPlayers({
            trx,
            clubId,
            playerIds,
            eventType: 'tournament.status',
            dedupeKey: `tournament:${id}:status:${status}`,
            payload: { tournamentId: id, tournamentName: tournament.name, status },
        });
        return tournament;
    }),

    delete: async (id, clubId, reason = null) => db.query(
        `UPDATE tournaments
         SET deleted_at = NOW(), delete_reason = $3, updated_at = NOW()
         WHERE id = $1 AND club_id = $2 AND deleted_at IS NULL RETURNING id`,
        [id, clubId, reason]
    ).then(result => result.first),
};
