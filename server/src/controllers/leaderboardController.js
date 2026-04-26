import { LeaderboardModel } from '../models/Leaderboard.js';

// GET /api/v1/clubs/:clubId/leaderboard
export async function getLeaderboard(req, res, next) {
    try {
        const { clubId } = req.params;
        const { limit, offset } = req.query;

        const players = await LeaderboardModel.getByClub(clubId, {
            limit:  Number(limit)  || 50,
            offset: Number(offset) || 0,
        });

        res.json({ players });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/players/:playerId/rating-history
export async function getRatingHistory(req, res, next) {
    try {
        const { playerId } = req.params;
        const { limit } = req.query;

        const history = await LeaderboardModel.getRatingHistory(playerId, {
            limit: Number(limit) || 30,
        });

        res.json({ history });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/players/:playerAId/vs/:playerBId/summary
// Returns a win/draw/loss summary rather than full match list.
export async function getHeadToHeadSummary(req, res, next) {
    try {
        const { playerAId, playerBId } = req.params;
        const summary = await LeaderboardModel.getHeadToHead(playerAId, playerBId);
        res.json({ summary });
    } catch (err) {
        next(err);
    }
}

// GET /api/v1/clubs/:clubId/stats — admin only
// Dashboard summary cards: total players, matches, tournaments, avg rating.
export async function getClubStats(req, res, next) {
    try {
        const stats = await LeaderboardModel.getClubStats(req.params.clubId);
        res.json({ stats });
    } catch (err) {
        next(err);
    }
}