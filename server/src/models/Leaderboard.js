import db from '../database/database.js';

const CATEGORIES = ['blitz', 'rapid', 'classical'];
const emptyStats = () => ({
    games: 0, wins: 0, draws: 0, losses: 0, weightedWinRate: 0,
    currentRating: null, peakRating: null, currentWinStreak: 0, currentLossStreak: 0,
});
function withoutTotalCount(row) {
    const entry = { ...row };
    delete entry.totalCount;
    return entry;
}

export const LeaderboardModel = {
    // Eligibility and rank are calculated before pagination. Account linking is
    // does not affect eligibility or ordering: all roster players rank identically.
    getByClub: async (clubId, { category = 'rapid', limit = 50, offset = 0, q = '' } = {}) => {
        const result = await db.query(
            `WITH eligible AS (
                SELECT player.id AS "playerId", player.public_id AS "publicPlayerId", player.name AS "playerName",
                    EXISTS (SELECT 1 FROM player_links link WHERE link.player_id = player.id
                        AND link.club_id = player.club_id AND link.status = 'approved') AS "isClaimed",
                    $2::TEXT AS "selectedCategory",
                    ROUND(selected.current_rating)::INTEGER AS "selectedRating",
                    selected.current_rating AS "rawSelectedRating",
                    selected.peak_rating AS "peakRating",
                    blitz.current_rating AS "blitzRating",
                    rapid.current_rating AS "rapidRating",
                    classical.current_rating AS "classicalRating",
                    selected_stats.games AS "categoryGames",
                    selected_stats.wins AS "categoryWins",
                    selected_stats.draws AS "categoryDraws",
                    selected_stats.losses AS "categoryLosses",
                    selected_stats.weighted_win_rate AS "weightedWinRate",
                    all_stats.total_games AS "totalGames"
                FROM players player
                JOIN player_rating_state selected ON selected.player_id = player.id
                    AND selected.club_id = player.club_id AND selected.category = $2
                JOIN player_rating_state blitz ON blitz.player_id = player.id
                    AND blitz.club_id = player.club_id AND blitz.category = 'blitz'
                JOIN player_rating_state rapid ON rapid.player_id = player.id
                    AND rapid.club_id = player.club_id AND rapid.category = 'rapid'
                JOIN player_rating_state classical ON classical.player_id = player.id
                    AND classical.club_id = player.club_id AND classical.category = 'classical'
                JOIN LATERAL (
                    SELECT COUNT(*)::INTEGER AS games,
                        COUNT(*) FILTER (WHERE
                            (match.white_player_id = player.id AND match.result = 'white') OR
                            (match.black_player_id = player.id AND match.result = 'black'))::INTEGER AS wins,
                        COUNT(*) FILTER (WHERE match.result = 'draw')::INTEGER AS draws,
                        COUNT(*) FILTER (WHERE
                            (match.white_player_id = player.id AND match.result = 'black') OR
                            (match.black_player_id = player.id AND match.result = 'white'))::INTEGER AS losses,
                        ((COUNT(*) FILTER (WHERE
                            (match.white_player_id = player.id AND match.result = 'white') OR
                            (match.black_player_id = player.id AND match.result = 'black'))
                          + 0.5 * COUNT(*) FILTER (WHERE match.result = 'draw')) / NULLIF(COUNT(*), 0))::DOUBLE PRECISION
                            AS weighted_win_rate
                    FROM matches match
                    WHERE match.club_id = player.club_id AND match.rating_category = $2
                      AND match.is_rated = TRUE AND match.status = 'active'
                      AND (match.white_player_id = player.id OR match.black_player_id = player.id)
                ) selected_stats ON selected_stats.games > 0
                JOIN LATERAL (
                    SELECT COUNT(*)::INTEGER AS total_games FROM matches match
                    WHERE match.club_id = player.club_id AND match.status = 'active'
                      AND (match.white_player_id = player.id OR match.black_player_id = player.id)
                ) all_stats ON TRUE
                WHERE player.club_id = $1 AND player.status = 'active' AND player.deleted_at IS NULL
                  AND ($5 = '' OR player.name ILIKE '%' || $5 || '%')
            ), ranked AS (
                SELECT eligible.*,
                    ROW_NUMBER() OVER (ORDER BY "selectedRating" DESC, "rawSelectedRating" DESC,
                        "weightedWinRate" DESC, "categoryGames" DESC, "playerName" ASC) AS row_rank,
                    COUNT(*) OVER () AS total_count
                FROM eligible
            )
            SELECT row_rank::INTEGER AS rank,
                "playerId", "publicPlayerId", "playerName", "isClaimed", "selectedCategory", "selectedRating", "peakRating",
                "blitzRating", "rapidRating", "classicalRating", "categoryGames", "categoryWins",
                "categoryDraws", "categoryLosses", "weightedWinRate", "totalGames",
                total_count::INTEGER AS "totalCount"
            FROM ranked ORDER BY row_rank LIMIT $3 OFFSET $4`,
            [clubId, category, limit, offset, q]
        );
        return {
            entries: result.rows.map(withoutTotalCount),
            total: result.rows[0]?.totalCount ?? 0,
            limit, offset, category,
        };
    },

    getRatingHistory: async (clubId, playerId, { category = 'rapid', limit = 30 } = {}) => db.query(
        `SELECT played_at AS "playedAt", rating_before AS "ratingBefore",
                rating_after AS "ratingAfter", match_id AS "matchId", category,
                played_at, rating_before, rating_after AS rating, match_id
         FROM (SELECT played_at, rating_before, rating_after, match_id, category
               FROM rating_history WHERE player_id = $1 AND club_id = $2 AND category = $3
               ORDER BY played_at DESC, match_id DESC LIMIT $4) latest
         ORDER BY played_at ASC, match_id ASC`,
        [playerId, clubId, category, limit]
    ).then(result => result.rows),

    getPlayerStatistics: async (clubId, playerId) => {
        const result = await db.query(
            `WITH outcomes AS (
                SELECT match.rating_category AS category, match.played_at, match.id,
                    CASE WHEN (match.white_player_id = $2 AND match.result = 'white')
                              OR (match.black_player_id = $2 AND match.result = 'black') THEN 'win'
                         WHEN match.result = 'draw' THEN 'draw' ELSE 'loss' END AS outcome
                FROM matches match WHERE match.club_id = $1 AND match.is_rated = TRUE
                  AND match.status = 'active'
                  AND (match.white_player_id = $2 OR match.black_player_id = $2)
            ), ordered AS (
                SELECT outcomes.*,
                    COUNT(*) FILTER (WHERE outcome <> 'win') OVER (PARTITION BY category
                        ORDER BY played_at DESC, id DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS win_breaks,
                    COUNT(*) FILTER (WHERE outcome <> 'loss') OVER (PARTITION BY category
                        ORDER BY played_at DESC, id DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS loss_breaks
                FROM outcomes
            ), aggregates AS (
                SELECT category, COUNT(*)::INTEGER AS games,
                    COUNT(*) FILTER (WHERE outcome = 'win')::INTEGER AS wins,
                    COUNT(*) FILTER (WHERE outcome = 'draw')::INTEGER AS draws,
                    COUNT(*) FILTER (WHERE outcome = 'loss')::INTEGER AS losses,
                    COUNT(*) FILTER (WHERE outcome = 'win' AND win_breaks = 0)::INTEGER AS win_streak,
                    COUNT(*) FILTER (WHERE outcome = 'loss' AND loss_breaks = 0)::INTEGER AS loss_streak
                FROM ordered GROUP BY category
            )
            SELECT state.category, state.current_rating AS "currentRating", state.peak_rating AS "peakRating",
                COALESCE(aggregates.games, 0) AS games, COALESCE(aggregates.wins, 0) AS wins,
                COALESCE(aggregates.draws, 0) AS draws, COALESCE(aggregates.losses, 0) AS losses,
                COALESCE(aggregates.win_streak, 0) AS "currentWinStreak",
                COALESCE(aggregates.loss_streak, 0) AS "currentLossStreak"
            FROM player_rating_state state LEFT JOIN aggregates ON aggregates.category = state.category
            WHERE state.club_id = $1 AND state.player_id = $2`,
            [clubId, playerId]
        );
        const categories = Object.fromEntries(CATEGORIES.map(category => [category, emptyStats()]));
        for (const row of result.rows) categories[row.category] = {
            games: row.games, wins: row.wins, draws: row.draws, losses: row.losses,
            weightedWinRate: row.games ? (row.wins + row.draws * 0.5) / row.games : 0,
            currentRating: row.currentRating, peakRating: row.peakRating,
            currentWinStreak: row.currentWinStreak, currentLossStreak: row.currentLossStreak,
        };
        return { playerId, categories };
    },

    getHeadToHead: async (clubId, playerAId, playerBId) => {
        const rows = await db.query(
            `SELECT rating_category AS category, COUNT(*)::INTEGER AS games,
                COUNT(*) FILTER (WHERE (white_player_id = $2 AND result = 'white')
                    OR (black_player_id = $2 AND result = 'black'))::INTEGER AS "playerAWins",
                COUNT(*) FILTER (WHERE (white_player_id = $3 AND result = 'white')
                    OR (black_player_id = $3 AND result = 'black'))::INTEGER AS "playerBWins",
                COUNT(*) FILTER (WHERE result = 'draw')::INTEGER AS draws
             FROM matches WHERE club_id = $1 AND status = 'active' AND is_rated = TRUE
               AND ((white_player_id = $2 AND black_player_id = $3)
                 OR (white_player_id = $3 AND black_player_id = $2))
             GROUP BY rating_category`,
            [clubId, playerAId, playerBId]
        ).then(result => result.rows);
        const categories = Object.fromEntries(CATEGORIES.map(category => [category,
            { games: 0, playerAWins: 0, playerBWins: 0, draws: 0 }]));
        for (const { category, ...summary } of rows) categories[category] = summary;
        const overall = Object.values(categories).reduce((sum, value) => ({
            games: sum.games + value.games, playerAWins: sum.playerAWins + value.playerAWins,
            playerBWins: sum.playerBWins + value.playerBWins, draws: sum.draws + value.draws,
        }), { games: 0, playerAWins: 0, playerBWins: 0, draws: 0 });
        return { overall, categories };
    },

    getClubStats: async (clubId) => db.query(
        `SELECT
            (SELECT COUNT(*)::INTEGER FROM players WHERE club_id = $1 AND status = 'active' AND deleted_at IS NULL) AS "rosterPlayers",
            (SELECT COUNT(*)::INTEGER FROM matches WHERE club_id = $1 AND status = 'active') AS "totalGames",
            (SELECT COUNT(*)::INTEGER FROM matches WHERE club_id = $1 AND status = 'active' AND is_rated = TRUE) AS "ratedGames",
            (SELECT COUNT(*)::INTEGER FROM tournaments WHERE club_id = $1) AS "totalTournaments"`, [clubId]
    ).then(result => result.first),

    // All dashboard metrics use the all-time period. Active players are active
    // roster players with at least one active (non-voided/non-deleted) game.
    getDashboardStats: async (clubId, { category = 'rapid', includeAdmin = false } = {}) => {
        const [metrics, recentMatches, leaderboard, breakdown] = await Promise.all([
            db.query(
                `SELECT
                    (SELECT COUNT(*)::INTEGER FROM user_clubs WHERE club_id = $1 AND status = 'ACTIVE_MEMBER') AS "activeMembers",
                    (SELECT COUNT(*)::INTEGER FROM players WHERE club_id = $1 AND status = 'active' AND deleted_at IS NULL) AS "rosterPlayers",
                    (SELECT COUNT(*)::INTEGER FROM players player WHERE player.club_id = $1
                        AND player.status = 'active' AND player.deleted_at IS NULL
                        AND EXISTS (SELECT 1 FROM matches match WHERE match.club_id = $1 AND match.status = 'active'
                            AND (match.white_player_id = player.id OR match.black_player_id = player.id))) AS "activePlayers",
                    (SELECT COUNT(*)::INTEGER FROM matches WHERE club_id = $1 AND status = 'active') AS "totalGames",
                    (SELECT COUNT(*)::INTEGER FROM matches WHERE club_id = $1 AND status = 'active' AND is_rated = TRUE) AS "ratedGames",
                    (SELECT COUNT(*)::INTEGER FROM tournaments WHERE club_id = $1) AS "totalTournaments"`, [clubId]
            ).then(result => result.first),
            db.query(
                `SELECT match.id, match.result, match.rating_category AS "ratingCategory",
                    match.is_rated AS "isRated", match.played_at AS "playedAt",
                    white_player.id AS "whitePlayerId", white_player.name AS "whitePlayerName",
                    black_player.id AS "blackPlayerId", black_player.name AS "blackPlayerName"
                 FROM matches match
                 JOIN players white_player ON white_player.id = match.white_player_id AND white_player.club_id = match.club_id
                 JOIN players black_player ON black_player.id = match.black_player_id AND black_player.club_id = match.club_id
                 WHERE match.club_id = $1 AND match.status = 'active'
                 ORDER BY match.played_at DESC, match.id DESC LIMIT 5`, [clubId]
            ).then(result => result.rows),
            LeaderboardModel.getByClub(clubId, { category, limit: 5, offset: 0 }),
            db.query(`SELECT rating_category AS category, COUNT(*)::INTEGER AS count
                FROM matches WHERE club_id = $1 AND status = 'active' GROUP BY rating_category`, [clubId]
            ).then(result => result.rows),
        ]);
        const gamesByCategory = { blitz: 0, rapid: 0, classical: 0 };
        for (const row of breakdown) gamesByCategory[row.category] = row.count;
        let admin;
        if (includeAdmin) admin = await db.query(
            `SELECT
                (SELECT COUNT(*)::INTEGER FROM club_join_requests WHERE club_id = $1 AND status = 'pending') AS "pendingJoinRequests",
                (SELECT COUNT(*)::INTEGER FROM player_links link JOIN players player
                    ON player.id = link.player_id AND player.club_id = link.club_id
                    WHERE link.club_id = $1 AND link.status = 'pending') AS "pendingPlayerLinks"`, [clubId]
        ).then(result => result.first);
        return {
            period: 'allTime', selectedCategory: category,
            definitions: {
                activeMembers: 'Current club memberships with ACTIVE_MEMBER status.',
                activePlayers: 'Active roster players with at least one active game.',
                totalGames: 'All active games; voided and deleted games are excluded.',
                ratedGames: 'Active games that affect ratings.',
            },
            metrics: { ...metrics, gamesByCategory }, topPlayers: leaderboard.entries, recentMatches,
            ...(admin ? { admin } : {}),
        };
    },
};
