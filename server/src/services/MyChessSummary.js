import db from '../database/database.js';
import { LeaderboardModel } from '../models/Leaderboard.js';
import { MatchModel } from '../models/Match.js';
import { toMatchDto } from '../utils/matchDtos.js';
export async function getMyChessSummary(clubId, player) {
    const [statistics, recent, pairings, ratingChanges] = await Promise.all([
        LeaderboardModel.getPlayerStatistics(clubId, player.id),
        MatchModel.findByClub(clubId, { playerId: player.id, status: 'active', limit: 3 }),
        db.query(`SELECT pairing.id, pairing.board, pairing.round_number AS "roundNumber", tournament.id AS "tournamentId", tournament.name AS "tournamentName",
            CASE WHEN pairing.white_player_id = $2 THEN 'White' ELSE 'Black' END AS color, opponent.name AS "opponentName"
            FROM tournament_pairings pairing JOIN tournaments tournament ON tournament.id = pairing.tournament_id AND tournament.club_id = pairing.club_id
            JOIN players opponent ON opponent.id = CASE WHEN pairing.white_player_id = $2 THEN pairing.black_player_id ELSE pairing.white_player_id END AND opponent.club_id = pairing.club_id
            WHERE pairing.club_id = $1 AND (pairing.white_player_id = $2 OR pairing.black_player_id = $2)
                AND pairing.status <> 'completed' AND NOT pairing.is_bye AND tournament.status = 'active' AND tournament.deleted_at IS NULL
            ORDER BY tournament.start_date, pairing.round_number, pairing.board LIMIT 5`, [clubId, player.id]),
        db.query(`SELECT DISTINCT ON (category) category, rating_after - rating_before AS change
            FROM rating_history WHERE club_id = $1 AND player_id = $2
            ORDER BY category, played_at DESC, match_id DESC`, [clubId, player.id]),
    ]);
    for (const row of ratingChanges.rows) statistics.categories[row.category].lastRatingChange = row.change;
    return { player, categories: statistics.categories, recentMatches: recent.matches.map(toMatchDto), pairings: pairings.rows };
}
