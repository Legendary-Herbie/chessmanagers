import db from '../database/database.js';

export const LeaderboardModel = {

    // Club leaderboard — all players ranked by current rating.
    // Delegates win/draw/loss aggregation to the v_club_leaderboard VIEW.
    getByClub: async (clubId, { limit = 50, offset = 0 } = {}) => {
        return db.query(
            `SELECT
                id,
                name,
                rating,
                played,
                wins,
                draws,
                losses,
                last_active,
                link_status,
                points
             FROM v_club_leaderboard
             WHERE club_id = $1
             ORDER BY rating DESC
             LIMIT $2 OFFSET $3`,
            [clubId, limit, offset]
        ).then(r => r.rows);
    },

    // Rating history for a single player over time — used for sparklines and graphs.
    getRatingHistory: async (clubId, playerId, { limit = 30 } = {}) => {
        return db.query(
            `SELECT played_at, rating
             FROM (
                SELECT m.played_at, rh.rating_after AS rating
                FROM rating_history rh
                JOIN matches m ON m.id = rh.match_id
                WHERE rh.player_id = $1 AND m.club_id = $2
                ORDER BY m.played_at DESC, m.created_at DESC, m.id DESC
                LIMIT $3
             ) latest
             ORDER BY played_at ASC`,
            [playerId, clubId, limit]
        ).then(r => r.rows);
    },

    // Head-to-head summary between two players.
    getHeadToHead: async (clubId, playerAId, playerBId) => {
        return db.query(
            `SELECT
                SUM(CASE
                    WHEN white_player_id = $2 AND result = 'white' THEN 1
                    WHEN black_player_id = $2 AND result = 'black' THEN 1
                    ELSE 0
                END)                                    AS player_a_wins,
                SUM(CASE
                    WHEN white_player_id = $3 AND result = 'white' THEN 1
                    WHEN black_player_id = $3 AND result = 'black' THEN 1
                    ELSE 0
                END)                                    AS player_b_wins,
                SUM(CASE WHEN result = 'draw' THEN 1 ELSE 0 END) AS draws,
                COUNT(*)                                AS total
             FROM matches
             WHERE club_id = $1 AND (
                (white_player_id = $2 AND black_player_id = $3)
                OR
                (white_player_id = $3 AND black_player_id = $2))`,
            [clubId, playerAId, playerBId]
        ).then(r => r.first);
    },

    // Club-wide analytics for the admin dashboard.
    getClubStats: async (clubId) => {
        return db.query(
            `SELECT
                (SELECT COUNT(*) FROM players WHERE club_id = $1) AS total_players,
                (SELECT COUNT(*) FROM matches WHERE club_id = $1) AS total_matches,
                (SELECT COUNT(*) FROM tournaments WHERE club_id = $1) AS total_tournaments,
                (SELECT ROUND(AVG(rating), 0) FROM players WHERE club_id = $1) AS average_rating,
                (SELECT MAX(rating) FROM players WHERE club_id = $1) AS highest_rating,
                (SELECT MIN(rating) FROM players WHERE club_id = $1) AS lowest_rating`,
            [clubId]
        ).then(r => r.first);
    },
};
