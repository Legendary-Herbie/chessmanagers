import jwt from 'jsonwebtoken';
import db from '../database/database.js';
import env from '../config/env.js';

let sequence = 0;

function nextValue(prefix) {
    sequence += 1;
    return `${prefix}_${sequence}`;
}

export async function createUser(overrides = {}) {
    const id = overrides.id || nextValue('usr_test');
    const email = overrides.email || `${id}@example.test`;
    const name = overrides.name || nextValue('Test User');
    const role = overrides.role || 'member';

    return db.query(
        `INSERT INTO users (
            id, email, name, username, full_name, password_hash, role,
            email_verified, email_verified_at
         ) VALUES ($1, $2, $3, $3, $3, $4, $5, $6, CASE WHEN $6 THEN NOW() END)
         RETURNING *`,
        [id, email, name, overrides.passwordHash || 'test-password-hash', role,
            overrides.emailVerified ?? true]
    ).then(result => result.first);
}

export async function createClub(owner, overrides = {}) {
    const id = overrides.id || nextValue('club_test');
    return db.transaction(async (trx) => {
        const club = await trx.query(
            `INSERT INTO clubs
                (id, name, slug, federation, owner_id, description, public_leaderboard,
                 visibility, status, settings_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
             RETURNING *`,
            [
                id,
                overrides.name || nextValue('Test Club'),
                overrides.slug || `${(overrides.name || id).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(-8)}`,
                overrides.federation || 'TEST',
                owner.id,
                overrides.description || null,
                overrides.isPublic ?? true,
                (overrides.isPublic ?? true) ? 'public' : 'private',
                JSON.stringify(overrides.settings || {}),
            ]
        ).then(result => result.first);

        await trx.query(
            `INSERT INTO user_clubs (user_id, club_id, role)
             VALUES ($1, $2, 'owner')`,
            [owner.id, club.id]
        );

        await trx.query(
            `INSERT INTO club_rating_settings (club_id, category)
             VALUES ($1, 'blitz'), ($1, 'rapid'), ($1, 'classical')
             ON CONFLICT DO NOTHING`,
            [club.id]
        );

        return club;
    });
}

export async function addClubMember(club, user, role = 'member') {
    return db.query(
        `INSERT INTO user_clubs (user_id, club_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, club_id) DO UPDATE
         SET role = EXCLUDED.role,
             status = 'ACTIVE_MEMBER',
             revoked_at = NULL,
             rejected_at = NULL,
             status_reason = NULL
         RETURNING *`,
        [user.id, club.id, role]
    ).then(result => result.first);
}

export async function createPlayer(club, overrides = {}) {
    const id = overrides.id || nextValue('player_test');
    const rating = overrides.rating ?? 1500;
    return db.transaction(async (trx) => {
        const player = await trx.query(
            `INSERT INTO players
                (id, club_id, name, rating, start_rating, blitz_rating, rapid_rating, classical_rating, bio)
             VALUES ($1, $2, $3, $4, $4, $4, $4, $4, $5)
             RETURNING *`,
            [id, club.id, overrides.name || nextValue('Test Player'), rating, overrides.bio || null]
        ).then(result => result.first);
        await trx.query(
            `INSERT INTO player_rating_state (
                club_id, player_id, category, start_rating, current_rating, completed_rated_games, peak_rating
             )
             SELECT $1, $2, category, $3, $3, 0, NULL
             FROM club_rating_settings WHERE club_id = $1`,
            [club.id, player.id, rating]
        );
        return player;
    });
}

export async function createPlayerLink(user, player, overrides = {}) {
    const id = overrides.id || nextValue('plink_test');
    return db.query(
        `INSERT INTO player_links (id, player_id, user_id, club_id, status, reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
            id,
            player.id,
            user.id,
            player.club_id,
            overrides.status || 'pending',
            overrides.reviewedAt || null,
        ]
    ).then(result => result.first);
}

export async function createMatch(club, whitePlayer, blackPlayer, overrides = {}) {
    const id = overrides.id || nextValue('match_test');
    return db.query(
        `INSERT INTO matches
              (id, club_id, white_player_id, black_player_id, result, type, time_control,
               rating_category, is_rated, status, played_at, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $10, 'active', $8, $9)
           RETURNING *`,
        [
            id,
            club.id,
            whitePlayer.id,
            blackPlayer.id,
            overrides.result || 'draw',
            overrides.type || 'rated',
            overrides.timeControl || 'blitz',
            overrides.playedAt || new Date('2026-01-01T12:00:00.000Z'),
              overrides.notes || null,
              overrides.isRated ?? (overrides.type !== 'casual'),
          ]
    ).then(result => result.first);
}

export async function createRatingHistory(player, match, overrides = {}) {
    return db.query(
        `INSERT INTO rating_history (player_id, match_id, rating_before, rating_after)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
            player.id,
            match.id,
            overrides.ratingBefore ?? 1500,
            overrides.ratingAfter ?? 1500,
        ]
    ).then(result => result.first);
}

export async function createTournament(club, overrides = {}) {
    const id = overrides.id || nextValue('tour_test');
    return db.query(
        `INSERT INTO tournaments (
            id, club_id, name, type, status, start_date, end_date, settings_json,
            rating_category, is_rated
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
            id,
            club.id,
            overrides.name || nextValue('Test Tournament'),
            overrides.type || 'round_robin',
            overrides.status || 'upcoming',
            overrides.startDate || new Date('2026-02-01T12:00:00.000Z'),
            overrides.endDate || null,
            JSON.stringify(overrides.settings || {}),
            overrides.ratingCategory || 'blitz',
            overrides.isRated ?? true,
        ]
    ).then(result => result.first);
}

export async function createJoinRequest(club, user, overrides = {}) {
    return db.query(
        `INSERT INTO club_join_requests (club_id, user_id, message, status, processed_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
            club.id,
            user.id,
            overrides.message || null,
            overrides.status || 'pending',
            overrides.processedAt || null,
        ]
    ).then(result => result.first);
}

export async function createInvite(club, creator, overrides = {}) {
    const token = overrides.token || nextValue('tkn_test');
    return db.query(
        `INSERT INTO club_invites (club_id, token, created_by, expires_at, revoked)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
            club.id,
            token,
            creator.id,
            overrides.expiresAt || null,
            overrides.revoked ?? false,
        ]
    ).then(result => result.first);
}

export function authToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        env.JWT_SECRET,
        { expiresIn: '5m' }
    );
}

export function authorization(user) {
    return `Bearer ${authToken(user)}`;
}
