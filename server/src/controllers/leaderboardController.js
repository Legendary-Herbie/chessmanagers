import { LeaderboardModel } from '../models/Leaderboard.js';
import { PlayerModel } from '../models/Player.js';

export async function getLeaderboard(req, res, next) {
    try {
        const { clubId } = req.params;
        const { category = 'blitz', limit = 50, offset = 0, q = '' } = req.validatedQuery;
        const leaderboard = await LeaderboardModel.getByClub(clubId, {
            category, limit, offset, q,
        });
        // `players` is retained as a deprecated compatibility projection while
        // first-party clients use the canonical `leaderboard` contract.
        const players = leaderboard.entries.map(entry => ({
            id: entry.playerId,
            name: entry.playerName,
            selected_category: entry.selectedCategory,
            rating: entry.selectedRating,
            peak_rating: entry.peakRating,
            blitz_rating: entry.blitzRating,
            rapid_rating: entry.rapidRating,
            classical_rating: entry.classicalRating,
            played: entry.categoryGames,
            wins: entry.categoryWins,
            draws: entry.categoryDraws,
            losses: entry.categoryLosses,
        }));
        res.json({ leaderboard, players });
    } catch (error) {
        next(error);
    }
}

export async function getRatingHistory(req, res, next) {
    try {
        const { clubId, playerId } = req.params;
        const { category = 'blitz', limit = 30 } = req.validatedQuery;
        const player = await PlayerModel.findByClubAndId(clubId, playerId, req.user.id);
        if (!player) return res.status(404).json({ error: 'Player not found.' });
        const history = await LeaderboardModel.getRatingHistory(clubId, playerId, { category, limit });
        res.json({ history });
    } catch (error) {
        next(error);
    }
}

export async function getPlayerStatistics(req, res, next) {
    try {
        const { clubId, playerId } = req.params;
        const player = await PlayerModel.findByClubAndId(clubId, playerId, req.user.id);
        if (!player) return res.status(404).json({ error: 'Player not found.' });
        const statistics = await LeaderboardModel.getPlayerStatistics(clubId, playerId);
        res.json({ statistics });
    } catch (error) {
        next(error);
    }
}

export async function getHeadToHeadSummary(req, res, next) {
    try {
        const { clubId, playerAId, playerBId } = req.params;
        const [playerA, playerB] = await Promise.all([
            PlayerModel.findByClubAndId(clubId, playerAId, req.user.id),
            PlayerModel.findByClubAndId(clubId, playerBId, req.user.id),
        ]);
        if (!playerA || !playerB) return res.status(404).json({ error: 'Player not found.' });
        const headToHead = await LeaderboardModel.getHeadToHead(clubId, playerAId, playerBId);
        res.json({ headToHead });
    } catch (error) {
        next(error);
    }
}

export async function getClubStats(req, res, next) {
    try {
        const stats = await LeaderboardModel.getClubStats(req.params.clubId);
        res.json({ stats });
    } catch (error) {
        next(error);
    }
}

export async function getClubDashboard(req, res, next) {
    try {
        const { category = 'blitz' } = req.validatedQuery;
        const dashboard = await LeaderboardModel.getDashboardStats(req.params.clubId, {
            category,
            includeAdmin: req.clubContext.capabilities.canManageMemberships,
        });
        res.json({ dashboard });
    } catch (error) {
        next(error);
    }
}
