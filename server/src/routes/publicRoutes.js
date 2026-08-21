import { Router } from 'express';
import {
    getPublicLeaderboard,
    getPublicClub,
    getPublicPlayer,
    getPublicTournament,
} from '../controllers/publicController.js';
import {
    validateRequest,
    clubParamsSchema,
    clubPlayerParamsSchema,
    clubTournamentParamsSchema,
    leaderboardQuerySchema,
} from '../middleware/validate.js';

const router = Router();

router.get('/clubs/:clubId', validateRequest({ params: clubParamsSchema }), getPublicClub);

router.get(
    '/clubs/:clubId/leaderboard',
    validateRequest({ params: clubParamsSchema, query: leaderboardQuerySchema }),
    getPublicLeaderboard,
);
router.get(
    '/clubs/:clubId/tournaments/:tournamentId',
    validateRequest({ params: clubTournamentParamsSchema }),
    getPublicTournament,
);
router.get(
    '/clubs/:clubId/players/:playerId',
    validateRequest({ params: clubPlayerParamsSchema }),
    getPublicPlayer,
);

export default router;
