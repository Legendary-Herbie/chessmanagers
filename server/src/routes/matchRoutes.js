import { Router } from 'express';
import {
    getMatches,
    getMatch,
    createMatch,
    updateMatch,
    deleteMatch,
    voidMatch,
    getPlayerMatches,
    getHeadToHead,
} from '../controllers/matchController.js';
import { requireAuth } from '../middleware/auth.js';
import { loadClubContext, requireActiveClubMember, requireClubAdmin } from '../middleware/requireRole.js';
import {
    validate,
    validateRequest,
    clubParamsSchema,
    clubMatchParamsSchema,
    clubPlayerParamsSchema,
    clubHeadToHeadParamsSchema,
    matchListQuerySchema,
    paginationQuerySchema,
    createMatchSchema,
    updateMatchSchema,
    voidMatchSchema,
    deleteMatchSchema,
} from '../middleware/validate.js';

const router = Router({ mergeParams: true });

// All match routes require authentication and club membership
router.use(requireAuth, validateRequest({ params: clubParamsSchema }), loadClubContext, requireActiveClubMember);

// GET /api/v1/clubs/:clubId/matches
// Supports query params: ?type=casual&tournamentId=x&playerId=x&limit=50&offset=0
router.get('/', validateRequest({ query: matchListQuerySchema }), getMatches);

// POST /api/v1/clubs/:clubId/matches
router.post('/', requireClubAdmin, validate(createMatchSchema), createMatch);

// GET /api/v1/clubs/:clubId/matches/:matchId
router.get('/:matchId', validateRequest({ params: clubMatchParamsSchema }), getMatch);

// PATCH /api/v1/clubs/:clubId/matches/:matchId
router.patch('/:matchId', validateRequest({ params: clubMatchParamsSchema }), requireClubAdmin, validate(updateMatchSchema), updateMatch);

router.post('/:matchId/void', validateRequest({ params: clubMatchParamsSchema }), requireClubAdmin, validate(voidMatchSchema), voidMatch);

// DELETE /api/v1/clubs/:clubId/matches/:matchId
router.delete('/:matchId', validateRequest({ params: clubMatchParamsSchema, body: deleteMatchSchema }), requireClubAdmin, deleteMatch);

// ── Player-scoped match routes ─────────────────────────────────────────────────

// GET /api/v1/clubs/:clubId/players/:playerId/matches
router.get('/players/:playerId/matches', validateRequest({ params: clubPlayerParamsSchema, query: paginationQuerySchema }), getPlayerMatches);

// GET /api/v1/clubs/:clubId/players/:playerAId/vs/:playerBId
router.get('/players/:playerAId/vs/:playerBId', validateRequest({ params: clubHeadToHeadParamsSchema }), getHeadToHead);

export default router;
