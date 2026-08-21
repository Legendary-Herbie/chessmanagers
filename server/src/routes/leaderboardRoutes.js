import { Router } from 'express';
import {
    getLeaderboard,
    getRatingHistory,
    getPlayerStatistics,
    getHeadToHeadSummary,
    getClubStats,
    getClubDashboard,
} from '../controllers/leaderboardController.js';
import { requireAuth } from '../middleware/auth.js';
import { loadClubContext, requireActiveClubMember, requireClubAdmin } from '../middleware/requireRole.js';
import {
    validateRequest,
    clubParamsSchema,
    clubPlayerParamsSchema,
    clubHeadToHeadParamsSchema,
    leaderboardQuerySchema,
    ratingHistoryQuerySchema,
    dashboardQuerySchema,
} from '../middleware/validate.js';

const router = Router({ mergeParams: true });

// All leaderboard routes require authentication and club membership
router.use(requireAuth, validateRequest({ params: clubParamsSchema }), loadClubContext, requireActiveClubMember);

// GET /api/v1/clubs/:clubId/leaderboard
router.get('/', validateRequest({ query: leaderboardQuerySchema }), getLeaderboard);

// GET /api/v1/clubs/:clubId/leaderboard/stats
// Allow club admins (owner/admin) to view club stats as well as system admins
router.get('/stats', requireClubAdmin, getClubStats);

// GET /api/v1/clubs/:clubId/leaderboard/dashboard
// Full dashboard payload (summary + top players + recent matches + pending
// admin actions) for the club-scoped "Dashboard" tab. Admin-only, same as
// /stats, since it surfaces pending join-request/claim counts.
router.get('/dashboard', validateRequest({ query: dashboardQuerySchema }), getClubDashboard);

// Canonical per-category player statistics.
router.get('/players/:playerId/statistics', validateRequest({ params: clubPlayerParamsSchema }), getPlayerStatistics);

// GET /api/v1/clubs/:clubId/players/:playerId/rating-history
router.get('/players/:playerId/rating-history', validateRequest({ params: clubPlayerParamsSchema, query: ratingHistoryQuerySchema }), getRatingHistory);

// GET /api/v1/clubs/:clubId/players/:playerAId/vs/:playerBId/summary
router.get('/players/:playerAId/vs/:playerBId/summary', validateRequest({ params: clubHeadToHeadParamsSchema }), getHeadToHeadSummary);

export default router;
