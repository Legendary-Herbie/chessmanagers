import db from '../database/database.js';

// Read-only model — all leaderboard data is derived from players and matches.
export const LeaderboardModel = {

    // Club leaderboard — all players ranked by current rating.
    // Includes win/draw/loss counts and recent activity for sparklines.
    getByClub: async (clubId, { limit = 50, offset = 0 } = {}) => {
        return db.query(
            `SELECT
                p.id,
                p.name,
                p.rating,
                pl.status                                                   AS link_status,
                COUNT(m.id)                                                 AS played,
                SUM(CASE
                    WHEN m.white_player_id = p.id AND m.result = 'white' THEN 1
                    WHEN m.black_player_id = p.id AND m.result = 'black' THEN 1
                    ELSE 0
                END)                                                        AS wins,
                SUM(CASE WHEN m.result = 'draw' THEN 1 ELSE 0 END)         AS draws,
                SUM(CASE
                    WHEN m.white_player_id = p.id AND m.result = 'black' THEN 1
                    WHEN m.black_player_id = p.id AND m.result = 'white' THEN 1
                    ELSE 0
                END)                                                        AS losses,
                MAX(m.played_at)                                            AS last_active
             FROM players p
             LEFT JOIN matches m ON
                (m.white_player_id = p.id OR m.black_player_id = p.id)
                AND m.club_id = p.club_id
             LEFT JOIN player_links pl ON pl.player_id = p.id AND pl.status = 'approved'
             WHERE p.club_id = $1
             GROUP BY p.id, p.name, p.rating, pl.status
             ORDER BY p.rating DESC
             LIMIT $2 OFFSET $3`,
            [clubId, limit, offset]
        ).then(r => r.rows);
    },

    // Rating history for a single player over time — used for sparklines and graphs.
    getRatingHistory: async (playerId, { limit = 30 } = {}) => {
        return db.query(
            `SELECT
                m.played_at,
                rh.rating_after  AS rating
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
                    WHEN black_player_id = $2 AND result = 'black' THEN 1
                    ELSE 0
                END) AS player_a_wins,
                SUM(CASE
                    WHEN white_player_id = $3 AND result = 'white' THEN 1
                    WHEN black_player_id = $4 AND result = 'black' THEN 1
                    ELSE 0
                END) AS player_b_wins,
                SUM(CASE WHEN result = 'draw' THEN 1 ELSE 0 END) AS draws,
                COUNT(*) AS total
             FROM matches
             WHERE
                (white_player_id = $5 AND black_player_id = $6)
                OR
                (white_player_id = $7 AND black_player_id = $8)`,
            [playerAId, playerAId, playerBId, playerBId,
             playerAId, playerBId, playerBId, playerAId]
        ).then(r => r.first);
    },

    // Club-wide analytics for the admin dashboard.
    getClubStats: async (clubId) => {
        return db.query(
            `SELECT
                COUNT(DISTINCT p.id)                    AS total_players,
                COUNT(DISTINCT m.id)                    AS total_matches,
                COUNT(DISTINCT t.id)                    AS total_tournaments,
                ROUND(AVG(p.rating), 0)                 AS average_rating,
                MAX(p.rating)                           AS highest_rating,
                MIN(p.rating)                           AS lowest_rating
             FROM players p
             LEFT JOIN matches     m ON m.club_id = p.club_id
             LEFT JOIN tournaments t ON t.club_id = p.club_id
             WHERE p.club_id = $1`,
            [clubId]
        ).then(r => r.first);
    },
};