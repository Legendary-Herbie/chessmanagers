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

    // Full club dashboard payload — everything ClubDashboard.jsx needs in one
    // round trip: summary counters, games-by-time-control breakdown, a top
    // players snapshot, and the most recent matches. Kept as one model
    // method (rather than several controller-level calls) so all the
    // sub-queries can run in parallel via Promise.all.
    getDashboardStats: async (clubId) => {
        const [summary, recentMatches, topPlayers, gamesByCategoryRows] = await Promise.all([
            db.query(
                `SELECT
                    (SELECT COUNT(*) FROM user_clubs WHERE club_id = $1)                          AS total_members,
                    (SELECT COUNT(*) FROM players WHERE club_id = $1)                              AS total_players,
                    (SELECT COUNT(*) FROM players WHERE club_id = $1 AND games > 0)                AS active_players,
                    (SELECT COUNT(*) FROM matches WHERE club_id = $1)                               AS total_matches,
                    (SELECT COUNT(*) FROM tournaments WHERE club_id = $1)                           AS total_tournaments,
                    (SELECT ROUND(AVG(rating), 0) FROM players WHERE club_id = $1)                  AS average_rating,
                    (SELECT MAX(rating) FROM players WHERE club_id = $1)                            AS highest_rating,
                    (SELECT MIN(rating) FROM players WHERE club_id = $1)                            AS lowest_rating,
                    (SELECT COUNT(*) FROM club_join_requests WHERE club_id = $1 AND status = 'pending') AS pending_join_requests,
                    (SELECT COUNT(*) FROM player_links pl
                        JOIN players p ON p.id = pl.player_id
                        WHERE p.club_id = $1 AND pl.status = 'pending')                              AS pending_player_links`,
                [clubId]
            ).then(r => r.first),

            db.query(
                `SELECT m.id, m.result, m.type, m.time_control, m.played_at,
                        wp.name AS white_name, bp.name AS black_name
                 FROM matches m
                 JOIN players wp ON wp.id = m.white_player_id
                 JOIN players bp ON bp.id = m.black_player_id
                 WHERE m.club_id = $1
                 ORDER BY m.played_at DESC, m.created_at DESC
                 LIMIT 5`,
                [clubId]
            ).then(r => r.rows),

            db.query(
                `SELECT id, name, rating, games, wins, draws, losses
                 FROM players
                 WHERE club_id = $1
                 ORDER BY rating DESC, name ASC
                 LIMIT 5`,
                [clubId]
            ).then(r => r.rows),

            db.query(
                `SELECT time_control, COUNT(*)::int AS count
                 FROM matches
                 WHERE club_id = $1
                 GROUP BY time_control`,
                [clubId]
            ).then(r => r.rows),
        ]);

        const games_by_category = { blitz: 0, rapid: 0, classical: 0 };
        for (const row of gamesByCategoryRows) {
            if (row.time_control in games_by_category) {
                games_by_category[row.time_control] = row.count;
            }
        }

        return {
            ...summary,
            games_by_category,
            top_players: topPlayers,
            recent_matches: recentMatches,
        };
    },
};