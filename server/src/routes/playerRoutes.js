import { Router } from 'express';
import {
    getPlayers,
    getPlayer,
    createPlayer,
    updatePlayer,
    deletePlayer,
    claimPlayer,
    getPendingLinks,
    approveLink,
    rejectLink,
    unlinkPlayer,
} from '../controllers/playerController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireClubMember, requireSelfOrAdmin } from '../middleware/requireRole.js';
import {
    validate,
    createPlayerSchema,
    updatePlayerSchema,
    unlinkPlayerSchema,
} from '../middleware/validate.js';

const router = Router({ mergeParams: true }); // mergeParams to access :clubId from parent

// All player routes require authentication and club membership
router.use(requireAuth, requireClubMember);

// ── Player CRUD ───────────────────────────────────────────────────────────────

// GET /api/v1/clubs/:clubId/players
router.get('/', getPlayers);

// POST /api/v1/clubs/:clubId/players
router.post('/', requireRole('admin'), validate(createPlayerSchema), createPlayer);

// GET /api/v1/clubs/:clubId/players/:playerId
router.get('/:playerId', getPlayer);

// PATCH /api/v1/clubs/:clubId/players/:playerId
// Admin can edit any player; linked player can only edit their own
router.patch('/:playerId', requireSelfOrAdmin, validate(updatePlayerSchema), updatePlayer);

// DELETE /api/v1/clubs/:clubId/players/:playerId
router.delete('/:playerId', requireRole('admin'), deletePlayer);

// ── Player link management ────────────────────────────────────────────────────

// POST /api/v1/clubs/:clubId/players/:playerId/claim
// Any authenticated club member can request to claim an unlinked player
router.post('/:playerId/claim', claimPlayer);

// GET /api/v1/clubs/:clubId/links/pending
router.get('/links/pending', requireRole('admin'), getPendingLinks);

// PATCH /api/v1/clubs/:clubId/links/:linkId/approve
router.patch('/links/:linkId/approve', requireRole('admin'), approveLink);

// PATCH /api/v1/clubs/:clubId/links/:linkId/reject
router.patch('/links/:linkId/reject', requireRole('admin'), rejectLink);

// DELETE /api/v1/clubs/:clubId/players/:playerId/unlink
router.delete('/:playerId/unlink', requireRole('admin'), validate(unlinkPlayerSchema), unlinkPlayer);

export default router;