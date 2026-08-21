import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
    getMyClub,
    getClubContext,
    listClubs,
    getClub,
    createClub,
    updateClub,
    getMembers,
    setMemberRole,
    createInvite,
    listInvites,
    revokeInvite,
    transferClubOwnership,
    archiveClub,
    restoreClub,
    deleteClub,
} from '../controllers/clubController.js';
import { uploadClubBadge } from '../controllers/imageController.js';
import { uploadSingleImage } from '../middleware/imageUpload.js';
import {
    requestMembership,
    listMembershipRequests,
    approveMembershipRequest,
    rejectMembershipRequest,
    acceptInvite,
    getJoinCode,
    rotateJoinCode,
    revokeJoinCode,
    joinWithCode,
    leaveClub,
    revokeMembership,
} from '../controllers/membershipController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import {
    loadClubContext,
    requireActiveClubMember,
    requireClubAdmin,
    requireClubOwner,
    allowInactiveClubMutation,
} from '../middleware/requireRole.js';
import {
    validate,
    validateRequest,
    clubParamsSchema,
    clubInviteParamsSchema,
    clubJoinRequestParamsSchema,
    clubMemberParamsSchema,
    publicClubListQuerySchema,
    updateClubSchema,
    createClubSchema,
    requestJoinClubSchema,
    joinByTokenSchema,
    joinByCodeSchema,
    createInviteSchema,
    setMemberRoleSchema,
    transferClubOwnershipSchema,
    clubLifecycleSchema,
    membershipReasonSchema,
    emptyBodySchema,
} from '../middleware/validate.js';

const router = Router();
const joinCodeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => req.user.id,
    message: { error: 'Too many join-code attempts. Please try again later.' },
});

// Public listing: GET /api/v1/clubs
// optionalAuth is retained for response personalization; private clubs are
// never exposed through this collection endpoint.
router.get('/', optionalAuth, validateRequest({ query: publicClubListQuerySchema }), listClubs);

// GET /api/v1/clubs/mine
// Must be declared before /:clubId to avoid 'mine' being treated as an ID
router.get('/mine', requireAuth, getMyClub);

router.get(
    '/:clubId/context',
    requireAuth,
    validateRequest({ params: clubParamsSchema }),
    loadClubContext,
    requireActiveClubMember,
    getClubContext,
);

// Public club detail. optionalAuth lets the handler include membership context.
router.get('/:clubId', optionalAuth, validateRequest({ params: clubParamsSchema }), getClub);

router.use(requireAuth);

// POST /api/v1/clubs
// Authenticated users may create and own multiple clubs.
router.post('/', validate(createClubSchema), createClub);

// POST /api/v1/clubs/:clubId/join — authenticated users can request to join or accept invite
router.post('/:clubId/join', validateRequest({ params: clubParamsSchema, body: requestJoinClubSchema }), requestMembership);

// GET /api/v1/clubs/:clubId/join-requests — club admin (owner/admin) only
router.get('/:clubId/join-requests', validateRequest({ params: clubParamsSchema }), loadClubContext, requireActiveClubMember, requireClubAdmin, listMembershipRequests);
// PATCH approve/reject
router.patch('/:clubId/join-requests/:requestId/approve', validateRequest({ params: clubJoinRequestParamsSchema, body: emptyBodySchema }), loadClubContext, requireActiveClubMember, requireClubAdmin, approveMembershipRequest);
router.patch('/:clubId/join-requests/:requestId/reject', validateRequest({ params: clubJoinRequestParamsSchema, body: membershipReasonSchema }), loadClubContext, requireActiveClubMember, requireClubAdmin, rejectMembershipRequest);

// Club invite management — create and revoke invites (club admin only)
router.post('/:clubId/invites', validateRequest({ params: clubParamsSchema, body: createInviteSchema }), loadClubContext, requireActiveClubMember, requireClubAdmin, createInvite);
router.get('/:clubId/invites', validateRequest({ params: clubParamsSchema }), loadClubContext, requireActiveClubMember, requireClubAdmin, listInvites);
router.delete('/:clubId/invites/:inviteId', validateRequest({ params: clubInviteParamsSchema }), loadClubContext, requireActiveClubMember, requireClubAdmin, revokeInvite);

// Public join-by-token endpoint (no clubId required)
router.post('/join-by-token', validate(joinByTokenSchema), acceptInvite);
router.post('/join-by-code', joinCodeLimiter, validate(joinByCodeSchema), joinWithCode);

// PATCH /api/v1/clubs/:clubId
router.patch('/:clubId', validateRequest({ params: clubParamsSchema, body: updateClubSchema }), loadClubContext, requireActiveClubMember, requireClubOwner, updateClub);
router.post('/:clubId/badge', validateRequest({ params: clubParamsSchema }), loadClubContext, requireActiveClubMember, requireClubOwner, uploadSingleImage, uploadClubBadge);
router.post('/:clubId/ownership', validateRequest({ params: clubParamsSchema, body: transferClubOwnershipSchema }), loadClubContext, requireActiveClubMember, requireClubOwner, transferClubOwnership);
router.post('/:clubId/archive', validateRequest({ params: clubParamsSchema, body: clubLifecycleSchema }), loadClubContext, requireActiveClubMember, requireClubOwner, archiveClub);
router.post('/:clubId/restore', validateRequest({ params: clubParamsSchema, body: clubLifecycleSchema }), allowInactiveClubMutation, loadClubContext, requireActiveClubMember, requireClubOwner, restoreClub);
router.delete('/:clubId', validateRequest({ params: clubParamsSchema, body: clubLifecycleSchema }), allowInactiveClubMutation, loadClubContext, requireActiveClubMember, requireClubOwner, deleteClub);

router.post('/:clubId/leave', validateRequest({ params: clubParamsSchema, body: membershipReasonSchema }), loadClubContext, requireActiveClubMember, leaveClub);
router.get('/:clubId/join-code', validateRequest({ params: clubParamsSchema }), loadClubContext, requireActiveClubMember, requireClubAdmin, getJoinCode);
router.post('/:clubId/join-code/rotate', validateRequest({ params: clubParamsSchema, body: emptyBodySchema }), loadClubContext, requireActiveClubMember, requireClubAdmin, rotateJoinCode);
router.delete('/:clubId/join-code', validateRequest({ params: clubParamsSchema, body: emptyBodySchema }), loadClubContext, requireActiveClubMember, requireClubAdmin, revokeJoinCode);

// GET /api/v1/clubs/:clubId/members
router.get('/:clubId/members', validateRequest({ params: clubParamsSchema }), loadClubContext, requireActiveClubMember, requireClubAdmin, getMembers);

// PATCH /api/v1/clubs/:clubId/members/:userId/role — club admin only
// Grants/revokes club-scoped admin permissions for a member. Previously
// there was no route for this at all — club-admin status could only ever
// be acquired by being the club's creator (the owner). requireClubAdmin
// already covers both the owner and any existing club-admin, so this lets
// an owner deputize other members without touching the global user role.
router.patch('/:clubId/members/:userId/role', validateRequest({ params: clubMemberParamsSchema, body: setMemberRoleSchema }), loadClubContext, requireActiveClubMember, requireClubOwner, setMemberRole);

// DELETE /api/v1/clubs/:clubId/members/:userId
router.delete('/:clubId/members/:userId', validateRequest({ params: clubMemberParamsSchema, body: membershipReasonSchema }), loadClubContext, requireActiveClubMember, requireClubAdmin, revokeMembership);

export default router;
