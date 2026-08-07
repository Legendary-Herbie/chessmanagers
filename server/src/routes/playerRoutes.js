import { Router } from 'express';
import {
    getPlayers,
    getPlayer,
    createPlayer,
    createPlayersBulk,
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
} from '../middleware/validate.js';

const router = Router({ mergeParams: true }); // mergeParams to access :clubId from parent

// All player routes require authentication and club membership
router.use(requireAuth, requireClubMember);

// ── Static & Special Routes (MUST be placed before /:playerId to avoid route collision) ──

// GET /api/v1/clubs/:clubId/players
router.get('/', getPlayers);

// POST /api/v1/clubs/:clubId/players
router.post('/', requireRole('admin'), validate(createPlayerSchema), createPlayer);

// POST /api/v1/clubs/:clubId/players/bulk — admin only
router.post('/bulk', requireRole('admin'), createPlayersBulk);

// GET /api/v1/clubs/:clubId/players/links/pending — admin only
router.get('/links/pending', requireRole('admin'), getPendingLinks);
// Also accept legacy/client variant: /player-links/pending
router.get('/player-links/pending', requireRole('admin'), getPendingLinks);

// PATCH /api/v1/clubs/:clubId/players/links/:linkId/approve — admin only
router.patch('/links/:linkId/approve', requireRole('admin'), approveLink);
// Also accept legacy/client variant: /player-links/:linkId/approve
router.patch('/player-links/:linkId/approve', requireRole('admin'), approveLink);

// PATCH /api/v1/clubs/:clubId/players/links/:linkId/reject — admin only
router.patch('/links/:linkId/reject', requireRole('admin'), rejectLink);
// Also accept legacy/client variant: /player-links/:linkId/reject
router.patch('/player-links/:linkId/reject', requireRole('admin'), rejectLink);

// ── Parameterized /:playerId Routes ──────────────────────────────────────────

// GET /api/v1/clubs/:clubId/players/:playerId
router.get('/:playerId', getPlayer);

// PATCH /api/v1/clubs/:clubId/players/:playerId
// Admin can edit any player; linked player can only edit their own
router.patch('/:playerId', requireSelfOrAdmin, validate(updatePlayerSchema), updatePlayer);

// DELETE /api/v1/clubs/:clubId/players/:playerId
router.delete('/:playerId', requireRole('admin'), deletePlayer);

// ── Player link actions on specific player ───────────────────────────────────

// POST /api/v1/clubs/:clubId/players/:playerId/claim
// Any authenticated club member can request to claim an unlinked player
router.post('/:playerId/claim', claimPlayer);

// DELETE /api/v1/clubs/:clubId/players/:playerId/unlink — admin only
router.delete('/:playerId/unlink', requireRole('admin'), unlinkPlayer);

export default router;