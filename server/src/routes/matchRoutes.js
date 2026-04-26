import { Router } from 'express';
import {
    getMatches,
    getMatch,
    createMatch,
    updateMatch,
    deleteMatch,
    getPlayerMatches,
    getHeadToHead,
} from '../controllers/matchController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireClubMember } from '../middleware/requireRole.js';
import { validate, createMatchSchema, updateMatchSchema } from '../middleware/validate.js';

const router = Router({ mergeParams: true });

// All match routes require authentication and club membership
router.use(requireAuth, requireClubMember);

// GET /api/v1/clubs/:clubId/matches
// Supports query params: ?type=casual&tournamentId=x&playerId=x&limit=50&offset=0
router.get('/', getMatches);

// POST /api/v1/clubs/:clubId/matches
router.post('/', requireRole('admin'), validate(createMatchSchema), createMatch);

// GET /api/v1/clubs/:clubId/matches/:matchId
router.get('/:matchId', getMatch);

// PATCH /api/v1/clubs/:clubId/matches/:matchId
router.patch('/:matchId', requireRole('admin'), validate(updateMatchSchema), updateMatch);

// DELETE /api/v1/clubs/:clubId/matches/:matchId
router.delete('/:matchId', requireRole('admin'), deleteMatch);

// ── Player-scoped match routes ─────────────────────────────────────────────────

// GET /api/v1/clubs/:clubId/players/:playerId/matches
router.get('/players/:playerId/matches', getPlayerMatches);

// GET /api/v1/clubs/:clubId/players/:playerAId/vs/:playerBId
router.get('/players/:playerAId/vs/:playerBId', getHeadToHead);

export default router;