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
    getRatingHistory: async (playerId, { limit = 30 } = {}) => {
        return db.query(
            `SELECT
                m.played_at,
                rh.rating_after AS rating
             FROM rating_history rh
             JOIN matches m ON m.id = rh.match_id
             WHERE rh.player_id = $1
             ORDER BY m.played_at ASC
             LIMIT $2`,
            [playerId, limit]
        ).then(r => r.rows);
    },

    // Head-to-head summary between two players.
    getHeadToHead: async (playerAId, playerBId) => {
        return db.query(
            `SELECT
                SUM(CASE
                    WHEN white_player_id = $1 AND result = 'white' THEN 1
                    WHEN black_player_id = $1 AND result = 'black' THEN 1
                    ELSE 0
                END)                                    AS player_a_wins,
                SUM(CASE
                    WHEN white_player_id = $2 AND result = 'white' THEN 1
                    WHEN black_player_id = $2 AND result = 'black' THEN 1
                    ELSE 0
                END)                                    AS player_b_wins,
                SUM(CASE WHEN result = 'draw' THEN 1 ELSE 0 END) AS draws,
                COUNT(*)                                AS total
             FROM matches
             WHERE
                (white_player_id = $1 AND black_player_id = $2)
                OR
                (white_player_id = $2 AND black_player_id = $1)`,
            [playerAId, playerBId]
        ).then(r => r.first);
    },

    // Club-wide analytics for the admin dashboard.
    getClubStats: async (clubId) => {
        return db.query(
            `SELECT
                COUNT(DISTINCT p.id)            AS total_players,
                COUNT(DISTINCT m.id)            AS total_matches,
                COUNT(DISTINCT t.id)            AS total_tournaments,
                ROUND(AVG(p.rating), 0)         AS average_rating,
                MAX(p.rating)                   AS highest_rating,
                MIN(p.rating)                   AS lowest_rating
             FROM players p
             LEFT JOIN matches     m ON m.club_id = p.club_id
             LEFT JOIN tournaments t ON t.club_id = p.club_id
             WHERE p.club_id = $1`,
            [clubId]
        ).then(r => r.first);
    },
};