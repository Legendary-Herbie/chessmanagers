import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { LeaderboardModel } from '../models/Leaderboard.js';
import { TournamentModel } from '../models/Tournament.js';
import { PlayerModel } from '../models/Player.js';


const router = Router();

router.use(optionalAuth);

// GET /api/v1/public/clubs/:clubId/leaderboard
// Shareable public leaderboard view
router.get('/clubs/:clubId/leaderboard', async (req, res, next) => {
    try {
        const players = await LeaderboardModel.getByClub(req.params.clubId, {
            limit:  Number(req.query.limit)  || 50,
            offset: Number(req.query.offset) || 0,
        });
        res.json({ players });
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/public/clubs/:clubId/tournaments/:tournamentId
// Shareable public tournament view
router.get('/clubs/:clubId/tournaments/:tournamentId', async (req, res, next) => {
    try {
        const { clubId, tournamentId } = req.params;
        const tournament = await TournamentModel.findById(tournamentId, clubId);
        if (!tournament) {
            return res.status(404).json({ error: 'Tournament not found.' });
        }
        const [players, standings] = await Promise.all([
            TournamentModel.getPlayers(tournamentId, clubId),
            TournamentModel.getStandings(tournamentId),
        ]);

        res.json({ tournament, players, standings });
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/public/clubs/:clubId/players/:playerId
// Shareable public player profile
router.get('/clubs/:clubId/players/:playerId', async (req, res, next) => {
    try {
        const player = await PlayerModel.findById(req.params.playerId);

        if (!player || player.club_id !== req.params.clubId) {
            return res.status(404).json({ error: 'Player not found.' });
        }

        res.json({ player });
    } catch (err) {
        next(err);
    }
});

export default router;
