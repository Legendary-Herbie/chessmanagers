import { Router } from 'express';
import {
    getMyClub,
    getClub,
    createClub,
    updateClub,
    getMembers,
    removeMember,
    createInvite,
    listInvites,
    revokeInvite,
    joinByToken,
} from '../controllers/clubController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireClubMember, requireClubAdmin } from '../middleware/requireRole.js';
import { validate, updateClubSchema } from '../middleware/validate.js';

const router = Router();

// GET /api/v1/clubs/mine — authenticated
router.get('/mine', requireAuth, getMyClub);

// POST /api/v1/clubs — system admin only
router.post('/', requireAuth, requireRole('admin'), createClub);

// Public: GET /api/v1/clubs/:clubId
// Returns public club info; includes membership info when authenticated
router.get('/:clubId', getClub);

// PATCH /api/v1/clubs/:clubId — club admin only
router.patch('/:clubId', requireAuth, requireClubAdmin, validate(updateClubSchema), updateClub);

// GET /api/v1/clubs/:clubId/members — club admin only
router.get('/:clubId/members', requireAuth, requireClubAdmin, getMembers);

// DELETE /api/v1/clubs/:clubId/members/:userId — club admin only
router.delete('/:clubId/members/:userId', requireAuth, requireClubAdmin, removeMember);

// Invite management (club admins)
router.post('/:clubId/invites', requireAuth, requireClubAdmin, createInvite);
router.get('/:clubId/invites', requireAuth, requireClubAdmin, listInvites);
router.delete('/:clubId/invites/:inviteId', requireAuth, requireClubAdmin, revokeInvite);

// Join by token (authenticated user)
router.post('/join-by-token', requireAuth, joinByToken);

export default router;