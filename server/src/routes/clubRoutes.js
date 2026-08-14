import { Router } from 'express';
import {
    getMyClub,
    listClubs,
    getClub,
    createClub,
    updateClub,
    requestJoinClub,
    getJoinRequests,
    approveJoin,
    rejectJoin,
    getMembers,
    setMemberRole,
    removeMember,
    createInvite,
    listInvites,
    revokeInvite,
    joinByToken,
} from '../controllers/clubController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { requireClubMember, requireClubAdmin } from '../middleware/requireRole.js';
import { validate, updateClubSchema, createClubSchema, setMemberRoleSchema } from '../middleware/validate.js';

const router = Router();

// Public listing: GET /api/v1/clubs
// optionalAuth lets listClubs() tell a real system admin apart from an
// anonymous/regular visitor, so the ?all=1 escape hatch (which bypasses
// the public_leaderboard/is_public flag entirely) can be gated below.
router.get('/', optionalAuth, listClubs);

// GET /api/v1/clubs/mine
// Must be declared before /:clubId to avoid 'mine' being treated as an ID
router.get('/mine', requireAuth, getMyClub);

// Public club detail. optionalAuth lets the handler include membership context.
router.get('/:clubId', optionalAuth, getClub);

router.use(requireAuth);

// POST /api/v1/clubs
// Allow authenticated users to create a club for their account (first-time creation).
router.post('/', validate(createClubSchema), createClub);

// POST /api/v1/clubs/:clubId/join — authenticated users can request to join or accept invite
router.post('/:clubId/join', requestJoinClub);

// GET /api/v1/clubs/:clubId/join-requests — club admin (owner/admin) only
router.get('/:clubId/join-requests', requireClubMember, requireClubAdmin, getJoinRequests);
// PATCH approve/reject
router.patch('/:clubId/join-requests/:requestId/approve', requireClubMember, requireClubAdmin, approveJoin);
router.patch('/:clubId/join-requests/:requestId/reject', requireClubMember, requireClubAdmin, rejectJoin);

// Club invite management — create and revoke invites (club admin only)
router.post('/:clubId/invites', requireClubMember, requireClubAdmin, createInvite);
router.get('/:clubId/invites', requireClubMember, requireClubAdmin, listInvites);
router.delete('/:clubId/invites/:inviteId', requireClubMember, requireClubAdmin, revokeInvite);

// Public join-by-token endpoint (no clubId required)
router.post('/join-by-token', joinByToken);

// PATCH /api/v1/clubs/:clubId
router.patch('/:clubId', requireClubMember, requireClubAdmin, validate(updateClubSchema), updateClub);

// GET /api/v1/clubs/:clubId/members
router.get('/:clubId/members', requireClubMember, requireClubAdmin, getMembers);

// PATCH /api/v1/clubs/:clubId/members/:userId/role — club admin only
// Grants/revokes club-scoped admin permissions for a member. Previously
// there was no route for this at all — club-admin status could only ever
// be acquired by being the club's creator (the owner). requireClubAdmin
// already covers both the owner and any existing club-admin, so this lets
// an owner deputize other members without touching the global user role.
router.patch('/:clubId/members/:userId/role', requireClubMember, requireClubAdmin, validate(setMemberRoleSchema), setMemberRole);

// DELETE /api/v1/clubs/:clubId/members/:userId
router.delete('/:clubId/members/:userId', requireClubMember, requireClubAdmin, removeMember);

export default router;