import { Router } from 'express';
import {
    getMyClub,
    getClub,
    createClub,
    updateClub,
    getMembers,
    removeMember,
} from '../controllers/clubController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireClubMember } from '../middleware/requireRole.js';
import { validate, updateClubSchema } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);

// GET /api/v1/clubs/mine
// Must be declared before /:clubId to avoid 'mine' being treated as an ID
router.get('/mine', getMyClub);

// POST /api/v1/clubs
router.post('/', requireRole('admin'), createClub);

// GET /api/v1/clubs/:clubId
router.get('/:clubId', requireClubMember, getClub);

// PATCH /api/v1/clubs/:clubId
router.patch('/:clubId', requireClubMember, requireRole('admin'), validate(updateClubSchema), updateClub);

// GET /api/v1/clubs/:clubId/members
router.get('/:clubId/members', requireClubMember, requireRole('admin'), getMembers);

// DELETE /api/v1/clubs/:clubId/members/:userId
router.delete('/:clubId/members/:userId', requireClubMember, requireRole('admin'), removeMember);

export default router;