import crypto from 'node:crypto';
import db from '../database/database.js';

const qry = (trx) => trx ? trx.query.bind(trx) : db.query.bind(db);
const failure = (code) => ({ ok: false, code });

const PLAYER_FIELDS = `
    p.id, p.club_id, p.name, p.rating, p.start_rating,
    p.blitz_rating, p.rapid_rating, p.classical_rating,
    p.games, p.wins, p.draws, p.losses, p.last_played,
    p.bio, p.photo_url, p.date_of_birth, p.federation_id,
    p.name_locked, p.chesscom_username, p.lichess_username,
    p.status, p.archived_at, p.deleted_at, p.created_at, p.updated_at`;

const PLAYER_RATINGS_JOIN = `
    LEFT JOIN LATERAL (
        SELECT jsonb_object_agg(
            state.category,
            jsonb_build_object(
                'start_rating', state.start_rating,
                'current_rating', state.current_rating,
                'completed_rated_games', state.completed_rated_games,
                'peak_rating', state.peak_rating
            )
        ) AS ratings
        FROM player_rating_state state
        WHERE state.club_id = p.club_id AND state.player_id = p.id
    ) rating_state ON TRUE`;

async function ratingConfiguration(trx, clubId) {
    return trx.query(
        'SELECT category, initial_rating, rating_floor FROM club_rating_settings WHERE club_id = $1',
        [clubId]
    ).then(result => Object.fromEntries(result.rows.map(row => [row.category, {
        initialRating: row.initial_rating,
        ratingFloor: row.rating_floor,
    }])));
}

const RATING_CATEGORIES = ['blitz', 'rapid', 'classical'];

function resolveStartRatings({ rating = null, startRatings = null }, configured) {
    const resolved = Object.fromEntries(RATING_CATEGORIES.map(category => [
        category,
        startRatings?.[category] ?? rating ?? configured[category]?.initialRating ?? 1500,
    ]));

    for (const category of RATING_CATEGORIES) {
        const floor = configured[category]?.ratingFloor ?? 500;
        if (resolved[category] < floor) {
            throw Object.assign(
                new Error(`${category[0].toUpperCase()}${category.slice(1)} starting rating cannot be below the club rating floor of ${floor}.`),
                { status: 400, code: 'START_RATING_BELOW_FLOOR' }
            );
        }
    }

    return resolved;
}

async function recordLifecycleEvent(trx, {
    clubId, playerId, actorUserId, eventType, fromStatus = null, toStatus, payload = {},
}) {
    await trx.query(
        `INSERT INTO player_lifecycle_events (
            club_id, player_id, actor_user_id, event_type, from_status, to_status, payload_json
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB)`,
        [clubId, playerId, actorUserId, eventType, fromStatus, toStatus, JSON.stringify(payload)]
    );
}

async function createRatingStates(trx, clubId, playerRatings) {
    if (!playerRatings.length) return;
    const values = [];
    const placeholders = [];
    for (const { playerId, ratings } of playerRatings) {
        for (const category of RATING_CATEGORIES) {
            const start = values.length;
            values.push(clubId, playerId, category, ratings[category]);
            placeholders.push(`($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 4}, 0, NULL)`);
        }
    }
    await trx.query(
        `INSERT INTO player_rating_state (
            club_id, player_id, category, start_rating, current_rating, completed_rated_games, peak_rating
         ) VALUES ${placeholders.join(', ')}
         ON CONFLICT (player_id, category) DO NOTHING`,
        values
    );
}

function updateAssignments(payload, allowedFields) {
    const assignments = [];
    const values = [];
    for (const [apiField, column] of Object.entries(allowedFields)) {
        if (!Object.prototype.hasOwnProperty.call(payload, apiField)) continue;
        values.push(payload[apiField] ?? null);
        assignments.push(`${column} = $${values.length}`);
    }
    return { assignments, values };
}

export const PlayerModel = {
    findByPublicId: async (clubId, publicPlayerId) => db.query(
        `SELECT * FROM players
         WHERE club_id = $1 AND public_id = $2 AND status = 'active' AND deleted_at IS NULL`,
        [clubId, publicPlayerId]
    ).then(result => result.first),

    create: async ({ clubId, actorUserId, name, rating = null, startRatings = null, bio = null, photoUrl = null, dateOfBirth = null, federationId = null }) => (
        db.transaction(async (trx) => {
            const configured = await ratingConfiguration(trx, clubId);
            const resolvedRatings = resolveStartRatings({ rating, startRatings }, configured);
            const player = await trx.query(
                `INSERT INTO players (
                    club_id, name, rating, start_rating, blitz_rating, rapid_rating, classical_rating,
                    bio, photo_url, date_of_birth, federation_id
                 ) VALUES ($1, $2, $3, $3, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING *`,
                [clubId, name, resolvedRatings.blitz, resolvedRatings.rapid, resolvedRatings.classical, bio, photoUrl, dateOfBirth, federationId]
            ).then(result => result.first);
            await createRatingStates(trx, clubId, [{ playerId: player.id, ratings: resolvedRatings }]);
            await recordLifecycleEvent(trx, {
                clubId, playerId: player.id, actorUserId, eventType: 'player.created', toStatus: 'active',
            });
            return player;
        })
    ),

    createBulk: async ({ clubId, actorUserId, players }) => db.transaction(async (trx) => {
        if (!players?.length) return [];
        const configured = await ratingConfiguration(trx, clubId);
        const values = [];
        const resolvedPlayers = players.map(player => ({
            ...player,
            id: `player_${crypto.randomBytes(16).toString('hex')}`,
            resolvedRatings: resolveStartRatings(player, configured),
        }));
        const placeholders = resolvedPlayers.map((player, index) => {
            const start = index * 7;
            values.push(player.id, clubId, player.name, player.resolvedRatings.blitz, player.resolvedRatings.rapid, player.resolvedRatings.classical, player.bio ?? null);
            return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 4}, $${start + 4}, $${start + 5}, $${start + 6}, $${start + 7})`;
        });
        const created = await trx.query(
            `INSERT INTO players (id, club_id, name, rating, start_rating, blitz_rating, rapid_rating, classical_rating, bio)
             VALUES ${placeholders.join(', ')}
             RETURNING *`,
            values
        ).then(result => result.rows);
        await createRatingStates(trx, clubId, resolvedPlayers.map(player => ({
            playerId: player.id,
            ratings: player.resolvedRatings,
        })));
        for (const player of created) {
            await recordLifecycleEvent(trx, {
                clubId, playerId: player.id, actorUserId, eventType: 'player.created', toStatus: 'active',
                payload: { source: 'bulk_roster_entry' },
            });
        }
        return created;
    }),

    // Internal read used by match/rating services. Never send this row directly to clients.
    findById: async (id, trx = null) => qry(trx)(
        `SELECT p.*, link.status AS link_status
         FROM players p
         LEFT JOIN player_links link ON link.player_id = p.id AND link.club_id = p.club_id AND link.status = 'approved'
         WHERE p.id = $1`,
        [id]
    ).then(result => result.first),

    findByClubAndId: async (clubId, playerId, viewerUserId) => db.query(
        `SELECT ${PLAYER_FIELDS}, COALESCE(rating_state.ratings, '{}'::JSONB) AS ratings,
                link.status AS link_status,
                COALESCE(link.user_id = $3, FALSE) AS is_self
         FROM players p
         ${PLAYER_RATINGS_JOIN}
         LEFT JOIN LATERAL (
            SELECT pl.user_id, pl.status
            FROM player_links pl
            WHERE pl.club_id = p.club_id AND pl.player_id = p.id
              AND pl.status IN ('pending', 'approved')
            ORDER BY CASE pl.status WHEN 'approved' THEN 0 ELSE 1 END, pl.created_at DESC
            LIMIT 1
         ) link ON TRUE
         WHERE p.club_id = $1 AND p.id = $2`,
        [clubId, playerId, viewerUserId]
    ).then(result => result.first),

    findByClub: async (clubId, viewerUserId = null, { q = '', limit = 50, offset = 0 } = {}) => db.query(
        `SELECT ${PLAYER_FIELDS}, COALESCE(rating_state.ratings, '{}'::JSONB) AS ratings,
                link.status AS link_status,
                COALESCE(link.user_id = $2, FALSE) AS is_self,
                COUNT(*) OVER ()::INTEGER AS total_count
         FROM players p
         ${PLAYER_RATINGS_JOIN}
         LEFT JOIN LATERAL (
            SELECT pl.user_id, pl.status
            FROM player_links pl
            WHERE pl.club_id = p.club_id AND pl.player_id = p.id
              AND pl.status IN ('pending', 'approved')
            ORDER BY CASE pl.status WHEN 'approved' THEN 0 ELSE 1 END, pl.created_at DESC
            LIMIT 1
         ) link ON TRUE
         WHERE p.club_id = $1 AND p.status = 'active' AND p.deleted_at IS NULL
           AND ($3 = '' OR p.name ILIKE '%' || $3 || '%' OR COALESCE(p.bio, '') ILIKE '%' || $3 || '%')
         ORDER BY p.rating DESC, p.name ASC
         LIMIT $4 OFFSET $5`,
        [clubId, viewerUserId, q, limit, offset]
    ).then(result => ({
        players: result.rows.map(row => {
            const player = { ...row };
            delete player.total_count;
            return player;
        }),
        total: result.rows[0]?.total_count ?? 0,
    })),

    getRosterSummary: async (clubId) => db.query(
        `SELECT
            COUNT(DISTINCT p.id)::INTEGER AS total_players,
            COUNT(DISTINCT p.id) FILTER (WHERE p.games > 0)::INTEGER AS active_players,
            ROUND(AVG(state.current_rating) FILTER (WHERE state.category = 'blitz'))::INTEGER AS average_blitz,
            ROUND(AVG(state.current_rating) FILTER (WHERE state.category = 'rapid'))::INTEGER AS average_rapid,
            ROUND(AVG(state.current_rating) FILTER (WHERE state.category = 'classical'))::INTEGER AS average_classical
         FROM players p
         LEFT JOIN player_rating_state state
           ON state.club_id = p.club_id AND state.player_id = p.id
         WHERE p.club_id = $1 AND p.status = 'active' AND p.deleted_at IS NULL`,
        [clubId]
    ).then(result => {
        const row = result.first;
        return {
            totalPlayers: row.total_players,
            activePlayers: row.active_players,
            averageRatings: {
                blitz: row.average_blitz,
                rapid: row.average_rapid,
                classical: row.average_classical,
            },
        };
    }),

    findInactiveByClub: async (clubId) => db.query(
        `SELECT ${PLAYER_FIELDS}, COALESCE(rating_state.ratings, '{}'::JSONB) AS ratings
         FROM players p
         ${PLAYER_RATINGS_JOIN}
         WHERE p.club_id = $1 AND p.status = 'inactive' AND p.deleted_at IS NULL
         ORDER BY p.name ASC`,
        [clubId]
    ).then(result => result.rows),

    findByUserId: async (userId, clubId = null) => db.query(
        `SELECT p.* FROM players p
         JOIN player_links pl ON pl.player_id = p.id AND pl.club_id = p.club_id
         WHERE pl.user_id = $1 AND pl.status = 'approved'
           AND ($2::TEXT IS NULL OR p.club_id = $2)
           AND p.status = 'active' AND p.deleted_at IS NULL
         ORDER BY p.created_at ASC, p.id ASC LIMIT 1`,
        [userId, clubId]
    ).then(result => result.first),

    updateAdmin: async ({ clubId, playerId, actorUserId, changes }) => db.transaction(async (trx) => {
        const player = await trx.query(
            'SELECT * FROM players WHERE club_id = $1 AND id = $2 FOR UPDATE',
            [clubId, playerId]
        ).then(result => result.first);
        if (!player) return failure('PLAYER_NOT_FOUND');
        if (player.status === 'deleted') return failure('PLAYER_DELETED');
        const owner = await trx.query('SELECT owner_id FROM clubs WHERE id = $1 FOR SHARE', [clubId]).then(r => r.first);
        if (Object.hasOwn(changes, 'nameLocked') && owner.owner_id !== actorUserId) return failure('OWNER_ONLY_NAME_LOCK');
        if (player.name_locked && Object.hasOwn(changes, 'name') && changes.name !== player.name && owner.owner_id !== actorUserId) return failure('PLAYER_NAME_LOCKED');
        const { assignments, values } = updateAssignments(changes, {
            name: 'name', bio: 'bio', photoUrl: 'photo_url', dateOfBirth: 'date_of_birth', federationId: 'federation_id',
            nameLocked: 'name_locked', chesscomUsername: 'chesscom_username', lichessUsername: 'lichess_username',
        });
        if (!assignments.length) return failure('NO_CHANGES');
        values.push(clubId, playerId);
        const updated = await trx.query(
            `UPDATE players SET ${assignments.join(', ')}, updated_at = NOW()
             WHERE club_id = $${values.length - 1} AND id = $${values.length} RETURNING *`,
            values
        ).then(result => result.first);
        await recordLifecycleEvent(trx, {
            clubId, playerId, actorUserId, eventType: 'player.identity_updated',
            fromStatus: player.status, toStatus: player.status, payload: { fields: Object.keys(changes) },
        });
        return { ok: true, player: updated };
    }),

    updateSelfProfile: async ({ clubId, playerId, userId, changes }) => db.transaction(async (trx) => {
        await trx.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [clubId, userId]);
        const player = await trx.query(
            `SELECT p.* FROM players p
             JOIN player_links pl ON pl.player_id = p.id AND pl.club_id = p.club_id
             JOIN user_clubs membership ON membership.club_id = p.club_id AND membership.user_id = pl.user_id
             WHERE p.club_id = $1 AND p.id = $2 AND pl.user_id = $3
               AND pl.status = 'approved' AND membership.status = 'ACTIVE_MEMBER'
             FOR UPDATE OF p, pl, membership`,
            [clubId, playerId, userId]
        ).then(result => result.first);
        if (!player) return failure('NOT_LINKED_PLAYER');
        if (player.status !== 'active' || player.deleted_at) return failure('PLAYER_NOT_ACTIVE');
        if (player.name_locked && Object.hasOwn(changes, 'name') && changes.name !== player.name) return failure('PLAYER_NAME_LOCKED');
        const { assignments, values } = updateAssignments(changes, {
            bio: 'bio', photoUrl: 'photo_url', name: 'name', federationId: 'federation_id',
            chesscomUsername: 'chesscom_username', lichessUsername: 'lichess_username',
        });
        if (!assignments.length) return failure('NO_CHANGES');
        values.push(clubId, playerId);
        const updated = await trx.query(
            `UPDATE players SET ${assignments.join(', ')}, updated_at = NOW()
             WHERE club_id = $${values.length - 1} AND id = $${values.length} RETURNING *`,
            values
        ).then(result => result.first);
        await recordLifecycleEvent(trx, {
            clubId, playerId, actorUserId: userId, eventType: 'player.profile_updated',
            fromStatus: player.status, toStatus: player.status, payload: { fields: Object.keys(changes) },
        });
        return { ok: true, player: updated };
    }),

    setStatus: async ({ clubId, playerId, actorUserId, fromStatus, toStatus, eventType }) => db.transaction(async (trx) => {
        const player = await trx.query(
            'SELECT * FROM players WHERE club_id = $1 AND id = $2 FOR UPDATE',
            [clubId, playerId]
        ).then(result => result.first);
        if (!player) return failure('PLAYER_NOT_FOUND');
        if (player.status !== fromStatus) return failure('INVALID_PLAYER_STATUS');
        const updated = await trx.query(
            `UPDATE players SET status = $3,
                 archived_at = CASE WHEN $3 = 'inactive' THEN NOW() ELSE NULL END,
                 deleted_at = CASE WHEN $3 = 'deleted' THEN NOW() ELSE deleted_at END,
                 updated_at = NOW()
             WHERE club_id = $1 AND id = $2 RETURNING *`,
            [clubId, playerId, toStatus]
        ).then(result => result.first);
        await recordLifecycleEvent(trx, {
            clubId, playerId, actorUserId, eventType, fromStatus, toStatus,
        });
        return { ok: true, player: updated };
    }),

    update: async (id, { name, bio }) => db.query(
        `UPDATE players SET name = COALESCE($1, name), bio = COALESCE($2, bio), updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [name, bio, id]
    ).then(result => result.first),

    updateRating: async (id, rating, trx) => qry(trx)(
        'UPDATE players SET rating = $1, updated_at = NOW() WHERE id = $2 RETURNING id, rating',
        [rating, id]
    ).then(result => result.first),

    delete: async (id) => db.query(
        `UPDATE players SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status <> 'deleted' RETURNING id`,
        [id]
    ).then(result => result.first),
};
