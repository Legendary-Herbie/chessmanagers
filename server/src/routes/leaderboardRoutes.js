import { Router } from 'express';
import {
    getLeaderboard,
    getRatingHistory,
    getHeadToHeadSummary,
    getClubStats,
} from '../controllers/leaderboardController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireClubMember } from '../middleware/requireRole.js';

const router = Router({ mergeParams: true });

// All leaderboard routes require authentication and club membership
router.use(requireAuth, requireClubMember);

// GET /api/v1/clubs/:clubId/leaderboard
router.get('/', getLeaderboard);

// GET /api/v1/clubs/:clubId/leaderboard/stats
// Allow club admins (owner/admin) to view club stats as well as system admins
import { requireClubAdmin } from '../middleware/requireRole.js';
router.get('/stats', requireClubAdmin, getClubStats);

// GET /api/v1/clubs/:clubId/players/:playerId/rating-history
router.get('/players/:playerId/rating-history', getRatingHistory);

// GET /api/v1/clubs/:clubId/players/:playerAId/vs/:playerBId/summary
router.get('/players/:playerAId/vs/:playerBId/summary', getHeadToHeadSummary);

export default router;