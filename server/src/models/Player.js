import db from '../database/database.js';

const qry = (trx) => trx ? trx.query.bind(trx) : db.query.bind(db);
const failure = (code) => ({ ok: false, code });

const PLAYER_FIELDS = `
    p.id, p.club_id, p.name, p.rating, p.start_rating,
    p.blitz_rating, p.rapid_rating, p.classical_rating,
    p.games, p.wins, p.draws, p.losses, p.last_played,
    p.bio, p.photo_url, p.date_of_birth, p.federation_id,
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
        'SELECT category, initial_rating FROM club_rating_settings WHERE club_id = $1',
        [clubId]
    ).then(result => Object.fromEntries(result.rows.map(row => [row.category, row.initial_rating])));
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

async function createRatingStates(trx, clubId, playerIds) {
    if (!playerIds.length) return;
    await trx.query(
        `INSERT INTO player_rating_state (
            club_id, player_id, category, start_rating, current_rating, completed_rated_games, peak_rating
         )
         SELECT player.club_id, player.id, settings.category,
                settings.initial_rating, settings.initial_rating, 0, NULL
         FROM players player
         JOIN club_rating_settings settings ON settings.club_id = player.club_id
         WHERE player.club_id = $1 AND player.id = ANY($2::TEXT[])
         ON CONFLICT (player_id, category) DO NOTHING`,
        [clubId, playerIds]
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

    create: async ({ clubId, actorUserId, name, rating = null, bio = null, photoUrl = null, dateOfBirth = null, federationId = null }) => (
        db.transaction(async (trx) => {
            const configured = await ratingConfiguration(trx, clubId);
            const blitzRating = rating ?? configured.blitz ?? 1500;
            const rapidRating = rating ?? configured.rapid ?? 1500;
            const classicalRating = rating ?? configured.classical ?? 1500;
            const player = await trx.query(
                `INSERT INTO players (
                    club_id, name, rating, start_rating, blitz_rating, rapid_rating, classical_rating,
                    bio, photo_url, date_of_birth, federation_id
                 ) VALUES ($1, $2, $3, $3, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING *`,
                [clubId, name, blitzRating, rapidRating, classicalRating, bio, photoUrl, dateOfBirth, federationId]
            ).then(result => result.first);
            await createRatingStates(trx, clubId, [player.id]);
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
        const placeholders = players.map((player, index) => {
            const explicitRating = player.rating ?? null;
            const blitzRating = explicitRating ?? configured.blitz ?? 1500;
            const rapidRating = explicitRating ?? configured.rapid ?? 1500;
            const classicalRating = explicitRating ?? configured.classical ?? 1500;
            const start = index * 6;
            values.push(clubId, player.name, blitzRating, rapidRating, classicalRating, player.bio ?? null);
            return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 3}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6})`;
        });
        const created = await trx.query(
            `INSERT INTO players (club_id, name, rating, start_rating, blitz_rating, rapid_rating, classical_rating, bio)
             VALUES ${placeholders.join(', ')}
             RETURNING *`,
            values
        ).then(result => result.rows);
        await createRatingStates(trx, clubId, created.map(player => player.id));
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
        const { assignments, values } = updateAssignments(changes, {
            name: 'name', bio: 'bio', photoUrl: 'photo_url', dateOfBirth: 'date_of_birth', federationId: 'federation_id',
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
        const { assignments, values } = updateAssignments(changes, { bio: 'bio', photoUrl: 'photo_url' });
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
