import db from '../database/database.js';
import { enqueueRatingRecalculation } from '../services/RatingService.js';

// Represents a chess club. All players, matches, and tournaments
// are scoped under a club.
import crypto from 'crypto';

function createSlug(name) {
    const stem = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'club';
    return `${stem}-${crypto.randomBytes(4).toString('hex')}`;
}

const RATING_CATEGORIES = ['blitz', 'rapid', 'classical'];
const DEFAULT_RATING_SETTINGS = {
    initialRating: 1500,
    ratingFloor: 500,
    establishedKFactor: 32,
    provisionalKFactor: 40,
    provisionalGames: 10,
};

function mergeStructuredSettings(current = {}, changes = {}) {
    const merged = { ...current, ...changes };
    for (const key of ['contacts', 'presentation', 'notifications']) {
        if (changes[key]) merged[key] = { ...(current[key] || {}), ...changes[key] };
    }
    return merged;
}

async function upsertRatingSettings(trx, clubId, settings = {}) {
    for (const category of RATING_CATEGORIES) {
        const value = { ...DEFAULT_RATING_SETTINGS, ...(settings[category] || {}) };
        await trx.query(
            `INSERT INTO club_rating_settings (
                club_id, category, initial_rating, rating_floor,
                established_k_factor, provisional_k_factor, provisional_games
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (club_id, category) DO UPDATE
             SET initial_rating = EXCLUDED.initial_rating,
                 rating_floor = EXCLUDED.rating_floor,
                 established_k_factor = EXCLUDED.established_k_factor,
                 provisional_k_factor = EXCLUDED.provisional_k_factor,
                 provisional_games = EXCLUDED.provisional_games,
                 updated_at = NOW()`,
            [
                clubId, category, value.initialRating, value.ratingFloor,
                value.establishedKFactor, value.provisionalKFactor, value.provisionalGames,
            ]
        );
    }
}

export const ClubModel = {

    // ── Create ────────────────────────────────────────────────────────────────

    create: async ({
        name, ownerId, description = null, logo = null, contactInfo = null,
        federation = null, visibility = 'private', publicLeaderboard = true,
        settings = {}, ratingSettings = {},
    }) => {
        return db.transaction(async (trx) => {
            const club = await trx.query(
                `INSERT INTO clubs
                    (name, slug, federation, owner_id, description, logo, contact_info,
                     public_leaderboard, visibility, status, settings_json)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)
                 RETURNING *`,
                [
                    name,
                    createSlug(name),
                    federation,
                    ownerId,
                    description,
                    logo,
                    contactInfo,
                    publicLeaderboard,
                    visibility,
                    JSON.stringify(settings),
                ]
            ).then(r => r.first);

            // Add creator as owner in user_clubs with role 'owner'.
            // Callers must NOT also call addMember() for the same user/club —
            // addMember() upserts on conflict and defaults to role 'member',
            // which would silently demote the owner set here.
            await trx.query(
                `INSERT INTO user_clubs (user_id, club_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
                [ownerId, club.id]
            );

            await upsertRatingSettings(trx, club.id, ratingSettings);

            return club;
        });
    },

    // ── Read ──────────────────────────────────────────────────────────────────

    findById: async (id) => {
        return db.query(
            `SELECT * FROM clubs WHERE id = $1`,
            [id]
        ).then(r => r.first);
    },

    findMembershipsByUserId: async (userId) => {
        return db.query(
            `SELECT c.*,
                    uc.role AS member_role,
                    uc.status AS membership_status,
                    uc.joined_at AS membership_joined_at,
                    uc.rejected_at AS membership_rejected_at,
                    uc.revoked_at AS membership_revoked_at,
                    linked_player.id AS linked_player_id,
                    linked_player.name AS linked_player_name,
                    CASE WHEN linked_player.id IS NULL THEN NULL ELSE pl.status END AS link_status
             FROM clubs c
             JOIN user_clubs uc ON uc.club_id = c.id
             LEFT JOIN player_links pl
               ON pl.user_id = uc.user_id
              AND pl.club_id = c.id
              AND pl.status = 'approved'
             LEFT JOIN players linked_player
               ON linked_player.id = pl.player_id
              AND linked_player.club_id = c.id
             WHERE uc.user_id = $1
             ORDER BY
               CASE WHEN uc.status = 'ACTIVE_MEMBER' AND c.status = 'active' AND c.deleted_at IS NULL THEN 0 ELSE 1 END,
               uc.joined_at ASC,
               c.id ASC`,
            [userId]
        ).then(r => r.rows);
    },

    // Transitional single-club lookup for callers not yet migrated.
    findByUserId: async (userId) => {
        const memberships = await ClubModel.findMembershipsByUserId(userId);
        return memberships.find(row => (
            row.membership_status === 'ACTIVE_MEMBER'
            && row.status === 'active'
            && !row.deleted_at
        )) ?? null;
    },

    getRatingSettings: async (clubId, trx = null) => {
        const query = trx ? trx.query.bind(trx) : db.query.bind(db);
        return query(
            `SELECT category, initial_rating, rating_floor, established_k_factor,
                    provisional_k_factor, provisional_games
             FROM club_rating_settings
             WHERE club_id = $1
             ORDER BY category`,
            [clubId]
        ).then(r => r.rows);
    },

    // ── Update ────────────────────────────────────────────────────────────────

    update: async (id, { name, description, logo, contactInfo, federation }) => {
        return db.query(
            `UPDATE clubs
             SET name         = COALESCE($1, name),
                 federation   = COALESCE($2, federation),
                 description  = COALESCE($3, description),
                 logo         = COALESCE($4, logo),
                 contact_info = COALESCE($5, contact_info),
                 updated_at   = NOW()
             WHERE id = $6
             RETURNING *`,
            [name, federation, description, logo, contactInfo, id]
        ).then(r => r.first);
    },

    findPresentationById: async (id) => db.query(
        `SELECT c.*,
                (SELECT COUNT(*)::INTEGER FROM user_clubs membership
                 WHERE membership.club_id = c.id AND membership.status = 'ACTIVE_MEMBER') AS member_count,
                (SELECT COUNT(*)::INTEGER FROM players player
                 WHERE player.club_id = c.id AND player.status = 'active' AND player.deleted_at IS NULL) AS roster_players,
                (SELECT COUNT(*)::INTEGER FROM matches match
                 WHERE match.club_id = c.id AND match.status = 'active' AND match.deleted_at IS NULL) AS total_games,
                COALESCE((
                    SELECT jsonb_object_agg(averages.category, averages.average_rating)
                    FROM (
                        SELECT state.category, ROUND(AVG(state.current_rating))::INTEGER AS average_rating
                        FROM player_rating_state state
                        JOIN players player ON player.id = state.player_id AND player.club_id = state.club_id
                        WHERE state.club_id = c.id AND player.status = 'active' AND player.deleted_at IS NULL
                        GROUP BY state.category
                    ) averages
                ), '{}'::JSONB) AS average_ratings
         FROM clubs c
         WHERE c.id = $1`,
        [id]
    ).then(r => r.first),

    updateManagementSettings: async (clubId, actorUserId, changes) => {
        return db.transaction(async (trx) => {
            const current = await trx.query(
                `SELECT * FROM clubs WHERE id = $1 AND status = 'active' FOR UPDATE`,
                [clubId]
            ).then(r => r.first);
            if (!current) return null;

            const settings = changes.settings
                ? mergeStructuredSettings(current.settings_json, changes.settings)
                : current.settings_json;
            const club = await trx.query(
                `UPDATE clubs
                 SET name = COALESCE($1, name),
                     federation = COALESCE($2, federation),
                     description = CASE WHEN $3::BOOLEAN THEN $4 ELSE description END,
                     logo = CASE WHEN $5::BOOLEAN THEN $6 ELSE logo END,
                     contact_info = CASE WHEN $7::BOOLEAN THEN $8 ELSE contact_info END,
                     visibility = COALESCE($9, visibility),
                     public_leaderboard = COALESCE($10, public_leaderboard),
                     settings_json = $11::JSONB,
                     updated_at = NOW()
                 WHERE id = $12
                 RETURNING *`,
                [
                    changes.name ?? null,
                    changes.federation ?? null,
                    Object.hasOwn(changes, 'description'), changes.description ?? null,
                    Object.hasOwn(changes, 'logo'), changes.logo ?? null,
                    Object.hasOwn(changes, 'contactInfo'), changes.contactInfo ?? null,
                    changes.visibility ?? null,
                    changes.publicLeaderboard ?? null,
                    JSON.stringify(settings || {}),
                    clubId,
                ]
            ).then(r => r.first);

            if (changes.ratingSettings) {
                const existingRows = await ClubModel.getRatingSettings(clubId, trx);
                const existing = Object.fromEntries(existingRows.map(row => [row.category, {
                    initialRating: row.initial_rating,
                    ratingFloor: row.rating_floor,
                    establishedKFactor: row.established_k_factor,
                    provisionalKFactor: row.provisional_k_factor,
                    provisionalGames: row.provisional_games,
                }]));
                await upsertRatingSettings(trx, clubId, { ...existing, ...changes.ratingSettings });
                for (const category of Object.keys(changes.ratingSettings)) {
                    const affectedFrom = await trx.query(
                        `SELECT COALESCE(MIN(played_at), NOW()) AS affected_from
                         FROM matches
                         WHERE club_id = $1 AND rating_category = $2
                           AND is_rated = TRUE AND status = 'active'`,
                        [clubId, category]
                    ).then(result => result.first.affected_from);
                    await enqueueRatingRecalculation({ clubId, category, affectedFrom }, trx);
                }
            }

            await trx.query(
                `INSERT INTO club_audit_events (club_id, actor_user_id, event_type, payload_json)
                 VALUES ($1, $2, 'club.settings_updated', $3::JSONB)`,
                [clubId, actorUserId, JSON.stringify({ fields: Object.keys(changes) })]
            );
            return club;
        });
    },

    updatePresentation: async (clubId, actorUserId, changes) => db.transaction(async (trx) => {
        const current = await trx.query(
            `SELECT * FROM clubs WHERE id = $1 AND status = 'active' FOR UPDATE`,
            [clubId]
        ).then(r => r.first);
        if (!current) return null;

        const settings = changes.settings
            ? mergeStructuredSettings(current.settings_json, changes.settings)
            : current.settings_json;
        const club = await trx.query(
            `UPDATE clubs
             SET federation = COALESCE($1, federation),
                 description = CASE WHEN $2::BOOLEAN THEN $3 ELSE description END,
                 contact_info = CASE WHEN $4::BOOLEAN THEN $5 ELSE contact_info END,
                 settings_json = $6::JSONB,
                 updated_at = NOW()
             WHERE id = $7
             RETURNING *`,
            [
                changes.federation ?? null,
                Object.hasOwn(changes, 'description'), changes.description ?? null,
                Object.hasOwn(changes, 'contactInfo'), changes.contactInfo ?? null,
                JSON.stringify(settings || {}),
                clubId,
            ]
        ).then(r => r.first);
        await trx.query(
            `INSERT INTO club_audit_events (club_id, actor_user_id, event_type, payload_json)
             VALUES ($1, $2, 'club.presentation_updated', $3::JSONB)`,
            [clubId, actorUserId, JSON.stringify({ fields: Object.keys(changes) })]
        );
        return club;
    }),

    // ── Members ───────────────────────────────────────────────────────────────

    transferOwnership: async ({ clubId, currentOwnerId, newOwnerUserId, previousOwnerRole }) => {
        return db.transaction(async (trx) => {
            const club = await trx.query(
                `SELECT * FROM clubs WHERE id = $1 AND status = 'active' FOR UPDATE`,
                [clubId]
            ).then(r => r.first);
            if (!club || club.owner_id !== currentOwnerId || currentOwnerId === newOwnerUserId) return null;

            const memberships = await trx.query(
                `SELECT user_id, role, status FROM user_clubs
                 WHERE club_id = $1 AND user_id IN ($2, $3)
                 FOR UPDATE`,
                [clubId, currentOwnerId, newOwnerUserId]
            ).then(r => r.rows);
            const nextOwner = memberships.find(row => row.user_id === newOwnerUserId);
            const currentOwner = memberships.find(row => row.user_id === currentOwnerId);
            if (!currentOwner || !nextOwner || nextOwner.status !== 'ACTIVE_MEMBER') return null;

            await trx.query(
                `UPDATE user_clubs SET role = $1 WHERE club_id = $2 AND user_id = $3`,
                [previousOwnerRole, clubId, currentOwnerId]
            );
            await trx.query(
                `UPDATE user_clubs SET role = 'owner' WHERE club_id = $1 AND user_id = $2`,
                [clubId, newOwnerUserId]
            );
            const updatedClub = await trx.query(
                `UPDATE clubs SET owner_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
                [newOwnerUserId, clubId]
            ).then(r => r.first);
            await trx.query(
                `INSERT INTO club_audit_events (club_id, actor_user_id, event_type, payload_json)
                 VALUES ($1, $2, 'club.ownership_transferred', $3::JSONB)`,
                [clubId, currentOwnerId, JSON.stringify({
                    previousOwnerUserId: currentOwnerId,
                    newOwnerUserId,
                    previousOwnerRole,
                })]
            );
            return updatedClub;
        });
    },

    setLifecycle: async ({ clubId, ownerId, action, reason = null }) => {
        return db.transaction(async (trx) => {
            const club = await trx.query(
                `SELECT * FROM clubs WHERE id = $1 FOR UPDATE`,
                [clubId]
            ).then(r => r.first);
            if (!club || club.owner_id !== ownerId) return null;

            const transitions = {
                archive: { from: ['active'], to: 'archived', event: 'club.archived' },
                restore: { from: ['archived'], to: 'active', event: 'club.restored' },
            };
            const transition = transitions[action];
            if (!transition || !transition.from.includes(club.status)) return null;

            const updated = await trx.query(
                `UPDATE clubs
                 SET status = $1,
                     archived_at = CASE
                         WHEN $1 = 'archived' THEN NOW()
                         WHEN $1 = 'active' THEN NULL
                         ELSE archived_at
                     END,
                     deleted_at = CASE WHEN $1 = 'deleted' THEN NOW() ELSE deleted_at END,
                     updated_at = NOW()
                 WHERE id = $2
                 RETURNING *`,
                [transition.to, clubId]
            ).then(r => r.first);
            await trx.query(
                `INSERT INTO club_audit_events (club_id, actor_user_id, event_type, payload_json)
                 VALUES ($1, $2, $3, $4::JSONB)`,
                [clubId, ownerId, transition.event, JSON.stringify({ reason })]
            );
            return updated;
        });
    },

    getMembers: async (clubId) => {
        return db.query(
            `SELECT u.id, u.name, u.email, u.role AS system_role, uc.joined_at, uc.role AS club_role
             FROM users u
             JOIN user_clubs uc ON uc.user_id = u.id
             WHERE uc.club_id = $1 AND uc.status = 'ACTIVE_MEMBER'
             ORDER BY uc.joined_at ASC`,
            [clubId]
        ).then(r => r.rows);
    },

    getMembership: async (clubId, userId) => {
        return db.query(
            `SELECT role, status FROM user_clubs
             WHERE club_id = $1 AND user_id = $2 AND status = 'ACTIVE_MEMBER'`,
            [clubId, userId]
        ).then(r => r.first);
    },

    // Adds (or re-roles, via upsert) a member. NEVER call this for a user who
    // was just inserted as 'owner' by create() — it will overwrite that role
    // with whatever `role` defaults to here ('member').
    addMember: async (clubId, userId, role = 'member') => {
        return db.query(
            `INSERT INTO user_clubs (club_id, user_id, role, status)
             VALUES ($1, $2, $3, 'ACTIVE_MEMBER')
             ON CONFLICT (user_id, club_id) DO UPDATE
             SET role = EXCLUDED.role,
                 status = 'ACTIVE_MEMBER',
                 revoked_at = NULL,
                 rejected_at = NULL,
                 status_reason = NULL
             RETURNING *`,
            [clubId, userId, role]
        ).then(r => r.first);
    },

    // Promotes/demotes an existing club member's club-scoped role.
    // Does not touch the global users.role (system_role) column.
    // Guards against ever re-assigning the owner's row via this path —
    // ownership transfer is intentionally out of scope for this helper.
    setMemberRole: async (clubId, userId, role) => {
        if (!['admin', 'member'].includes(role)) {
            throw new Error(`Invalid club role: "${role}". Expected 'admin' or 'member'.`);
        }
        return db.query(
            `UPDATE user_clubs
             SET role = $1
             WHERE club_id = $2 AND user_id = $3
               AND status = 'ACTIVE_MEMBER' AND role <> 'owner'
             RETURNING *`,
            [role, clubId, userId]
        ).then(r => r.first);
    },

    // ── Invite tokens ─────────────────────────────────────────────────────────

    createInvite: async (clubId, createdByUserId, expiresAt = null) => {
        const token = 'tkn_' + crypto.randomBytes(16).toString('hex');
        return db.query(
            `INSERT INTO club_invites (club_id, token, created_by, expires_at)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [clubId, token, createdByUserId, expiresAt]
        ).then(r => r.first);
    },

    revokeInvite: async (clubId, inviteId) => {
        return db.query(
            `UPDATE club_invites SET revoked = TRUE WHERE id = $1 AND club_id = $2 RETURNING *`,
            [inviteId, clubId]
        ).then(r => r.first);
    },

    listInvites: async (clubId) => {
        return db.query(
            `SELECT * FROM club_invites
             WHERE club_id = $1
               AND revoked = FALSE
               AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY created_at DESC`,
            [clubId]
        ).then(r => r.rows);
    },

    // ── Public listing/search ──────────────────────────────────────────────────

    listPublic: async ({ q = '', limit = 50, offset = 0 } = {}) => {
        const search = q ? `%${q}%` : '%';
        return db.query(
            `SELECT c.*, COUNT(*) OVER ()::INTEGER AS total_count
             FROM clubs c
             WHERE c.visibility = 'public'
               AND c.status = 'active'
               AND c.deleted_at IS NULL
               AND (c.name ILIKE $1 OR c.federation ILIKE $1)
             ORDER BY c.name ASC
             LIMIT $2 OFFSET $3`,
            [search, limit, offset]
        ).then(r => r.rows);
    },

    // Returns all clubs (admin/public find) — useful for FindClubs page when public listing is empty
    listAll: async ({ q = '', limit = 50, offset = 0 } = {}) => {
        const search = q ? `%${q}%` : '%';
        return db.query(
            `SELECT c.id, c.name, c.federation, c.description, c.logo, c.public_leaderboard, c.created_at
             FROM clubs c
             WHERE c.name ILIKE $1 OR c.federation ILIKE $1
             ORDER BY c.name ASC
             LIMIT $2 OFFSET $3`,
            [search, limit, offset]
        ).then(r => r.rows);
    },

};
