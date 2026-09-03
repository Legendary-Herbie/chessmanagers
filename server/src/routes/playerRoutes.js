import { Router } from 'express';
import {
    archivePlayer,
    claimPlayer,
    createPlayer,
    createPlayersBulk,
    deletePlayer,
    getInactivePlayers,
    getPlayer,
    getPlayers,
    getRosterSummary,
    restorePlayer,
    unlinkPlayer,
    updateOwnPlayerProfile,
    updatePlayer,
    approveLink,
    rejectLink,
} from '../controllers/playerController.js';
import { getHeadToHead, getPlayerMatches } from '../controllers/matchController.js';
import {
    getHeadToHeadSummary,
    getPlayerStatistics,
    getRatingHistory,
} from '../controllers/leaderboardController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadPlayerPhoto } from '../controllers/imageController.js';
import { uploadSingleImage } from '../middleware/imageUpload.js';
import {
    loadClubContext,
    requireActiveClubMember,
    requireClubAdmin,
    requireSelfOrClubAdmin,
} from '../middleware/requireRole.js';
import {
    clubParamsSchema,
    clubPlayerParamsSchema,
    clubLinkParamsSchema,
    clubHeadToHeadParamsSchema,
    createPlayerSchema,
    createPlayersBulkSchema,
    emptyBodySchema,
    playerUnlinkSchema,
    playerLinkDecisionSchema,
    updatePlayerAdminSchema,
    updatePlayerSelfSchema,
    validate,
    validateRequest,
    playerListQuerySchema,
    paginationQuerySchema,
    ratingHistoryQuerySchema,
} from '../middleware/validate.js';

const router = Router({ mergeParams: true });

router.use(requireAuth, validateRequest({ params: clubParamsSchema }), loadClubContext, requireActiveClubMember);

router.get('/', validateRequest({ query: playerListQuerySchema }), getPlayers);
router.post('/', requireClubAdmin, validate(createPlayerSchema), createPlayer);
router.post('/bulk', requireClubAdmin, validate(createPlayersBulkSchema), createPlayersBulk);
router.get('/summary', getRosterSummary);
router.get('/inactive', requireClubAdmin, getInactivePlayers);

// Compatibility aliases for clients created before player-link routes were split.
router.patch('/links/:linkId/approve', validateRequest({ params: clubLinkParamsSchema }), requireClubAdmin, validate(emptyBodySchema), approveLink);
router.patch('/links/:linkId/reject', validateRequest({ params: clubLinkParamsSchema }), requireClubAdmin, validate(playerLinkDecisionSchema), rejectLink);

// Canonical player-history resources. Legacy aliases remain under the match and
// leaderboard routers so existing external clients do not break.
router.get('/:playerId/matches', validateRequest({ params: clubPlayerParamsSchema, query: paginationQuerySchema }), getPlayerMatches);
router.get('/:playerId/rating-history', validateRequest({ params: clubPlayerParamsSchema, query: ratingHistoryQuerySchema }), getRatingHistory);
router.get('/:playerId/statistics', validateRequest({ params: clubPlayerParamsSchema }), getPlayerStatistics);
router.get('/:playerAId/vs/:playerBId', validateRequest({ params: clubHeadToHeadParamsSchema }), getHeadToHead);
router.get('/:playerAId/vs/:playerBId/summary', validateRequest({ params: clubHeadToHeadParamsSchema }), getHeadToHeadSummary);

router.get('/:playerId', validateRequest({ params: clubPlayerParamsSchema }), getPlayer);
router.patch('/:playerId', validateRequest({ params: clubPlayerParamsSchema }), requireSelfOrClubAdmin, validate(updatePlayerAdminSchema), updatePlayer);
router.patch('/:playerId/profile', validateRequest({ params: clubPlayerParamsSchema }), requireSelfOrClubAdmin, validate(updatePlayerSelfSchema), updateOwnPlayerProfile);
router.patch('/:playerId/archive', validateRequest({ params: clubPlayerParamsSchema }), requireClubAdmin, validate(emptyBodySchema), archivePlayer);
router.patch('/:playerId/restore', validateRequest({ params: clubPlayerParamsSchema }), requireClubAdmin, validate(emptyBodySchema), restorePlayer);
router.delete('/:playerId', validateRequest({ params: clubPlayerParamsSchema }), requireClubAdmin, validate(emptyBodySchema), deletePlayer);

router.post('/:playerId/claim', validateRequest({ params: clubPlayerParamsSchema }), validate(emptyBodySchema), claimPlayer);
router.post('/:playerId/photo', validateRequest({ params: clubPlayerParamsSchema }), requireSelfOrClubAdmin, uploadSingleImage, uploadPlayerPhoto);
router.delete('/:playerId/unlink', validateRequest({ params: clubPlayerParamsSchema }), requireSelfOrClubAdmin, validate(playerUnlinkSchema), unlinkPlayer);

export default router;
