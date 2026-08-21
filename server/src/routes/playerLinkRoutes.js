import { Router } from 'express';
import { approveLink, getPendingLinks, rejectLink } from '../controllers/playerController.js';
import { requireAuth } from '../middleware/auth.js';
import { loadClubContext, requireActiveClubMember, requireClubAdmin } from '../middleware/requireRole.js';
import {
    clubLinkParamsSchema,
    clubParamsSchema,
    emptyBodySchema,
    playerLinkDecisionSchema,
    validate,
    validateRequest,
} from '../middleware/validate.js';

const router = Router({ mergeParams: true });

router.use(requireAuth, validateRequest({ params: clubParamsSchema }), loadClubContext, requireActiveClubMember, requireClubAdmin);
router.get('/pending', getPendingLinks);
router.patch('/:linkId/approve', validateRequest({ params: clubLinkParamsSchema }), validate(emptyBodySchema), approveLink);
router.patch('/:linkId/reject', validateRequest({ params: clubLinkParamsSchema }), validate(playerLinkDecisionSchema), rejectLink);

export default router;
