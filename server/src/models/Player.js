import db from '../database/database.js';

// Represents a real-world chess player within a club.
// Players are owned by the club, not the user — a player record exists
// independently of any user account. Users may request to link to a player,
// subject to admin approval (see PlayerLink model).
export const PlayerModel = {

    // ── Create ────────────────────────────────────────────────────────────────

    create: async ({ clubId, name, rating = 1500, bio = null }) => {
        return db.query(
            `INSERT INTO players (club_id, name, rating, bio)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [clubId, name, rating, bio]
        ).then(r => r.first);
    },

    // ── Read ──────────────────────────────────────────────────────────────────

    findById: async (id) => {
        return db.query(
            `SELECT p.*,
                    pl.user_id      AS linked_user_id,
                    pl.status       AS link_status
             FROM players p
             LEFT JOIN player_links pl ON pl.player_id = p.id AND pl.status = 'approved'
             WHERE p.id = $1`,
            [id]
        ).then(r => r.first);
    },

    // All players in a club, with their link status for display.
    findByClub: async (clubId) => {
        return db.query(
            `SELECT p.*,
                    pl.user_id  AS linked_user_id,
                    pl.status   AS link_status
             FROM players p
             LEFT JOIN player_links pl ON pl.player_id = p.id
                 AND pl.status IN ('approved', 'pending')
             WHERE p.club_id = $1
             ORDER BY p.rating DESC`,
            [clubId]
        ).then(r => r.rows);
    },

    // The player linked to a specific approved user account.
    findByUserId: async (userId) => {
        return db.query(
            `SELECT p.*
             FROM players p
             JOIN player_links pl ON pl.player_id = p.id
             WHERE pl.user_id = $1 AND pl.status = 'approved'
             LIMIT 1`,
            [userId]
        ).then(r => r.first);
    },

    // ── Update ────────────────────────────────────────────────────────────────

    update: async (id, { name, bio }) => {
        return db.query(
            `UPDATE players
             SET name       = COALESCE($1, name),
                 bio        = COALESCE($2, bio),
                 updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [name, bio, id]
        ).then(r => r.first);
    },

    // Called after each match to persist the newly calculated rating.
    updateRating: async (id, rating) => {
        return db.query(
            `UPDATE players
             SET rating     = $1,
                 updated_at = NOW()
             WHERE id = $2
             RETURNING id, rating`,
            [rating, id]
        ).then(r => r.first);
    },

    // Update match counters and last_played after a match result.
    // result: 'white' | 'black' | 'draw'
    // isWhite: true if this player played white, false if played black
    recordMatchResult: async (id, result, isWhite) => {
        // Determine if player won, lost, or drew
        let winChange = 0, drawChange = 0, lossChange = 0;

        if (result === 'draw') {
            drawChange = 1;
        } else if ((isWhite && result === 'white') || (!isWhite && result === 'black')) {
            // Player won
            winChange = 1;
        } else {
            // Player lost
            lossChange = 1;
        }

        return db.query(
            `UPDATE players
             SET games       = games + 1,
                 wins        = wins + $1,
                 draws       = draws + $2,
                 losses      = losses + $3,
                 last_played = NOW(),
                 updated_at  = NOW()
             WHERE id = $4
             RETURNING *`,
            [winChange, drawChange, lossChange, id]
        ).then(r => r.first);
    },

    // ── Delete ────────────────────────────────────────────────────────────────

    delete: async (id) => {
        return db.query(
            `DELETE FROM players WHERE id = $1 RETURNING id`,
            [id]
        ).then(r => r.first);
    },
};