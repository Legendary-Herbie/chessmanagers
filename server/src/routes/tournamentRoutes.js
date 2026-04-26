import { Router } from 'express';
import {
    getTournaments,
    getTournament,
    createTournament,
    updateTournament,
    setTournamentStatus,
    deleteTournament,
    getTournamentPlayers,
    addTournamentPlayer,
    removeTournamentPlayer,
    getTournamentStandings,
} from '../controllers/tournamentController.js';

import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireClubMember } from '../middleware/requireRole.js';
import {
    validate,
    createTournamentSchema,
    updateTournamentSchema,
    setTournamentStatusSchema,
    addTournamentPlayerSchema,
} from '../middleware/validate.js';

const router = Router({ mergeParams: true });

// All tournament routes require authentication and club membership
router.use(requireAuth, requireClubMember);

// GET /api/v1/clubs/:clubId/tournaments
// Supports query param: ?status=upcoming|active|completed
router.get('/', getTournaments);

// POST /api/v1/clubs/:clubId/tournaments
router.post('/', requireRole('admin'), validate(createTournamentSchema), createTournament);

// GET /api/v1/clubs/:clubId/tournaments/:tournamentId
// Returns tournament + players + standings in one response
router.get('/:tournamentId', getTournament);

// PATCH /api/v1/clubs/:clubId/tournaments/:tournamentId
router.patch('/:tournamentId', requireRole('admin'), validate(updateTournamentSchema), updateTournament);

// PATCH /api/v1/clubs/:clubId/tournaments/:tournamentId/status
router.patch('/:tournamentId/status', requireRole('admin'), validate(setTournamentStatusSchema), setTournamentStatus);

// DELETE /api/v1/clubs/:clubId/tournaments/:tournamentId
router.delete('/:tournamentId', requireRole('admin'), deleteTournament);

// ── Roster management ─────────────────────────────────────────────────────────

// GET /api/v1/clubs/:clubId/tournaments/:tournamentId/players
router.get('/:tournamentId/players', getTournamentPlayers);

// POST /api/v1/clubs/:clubId/tournaments/:tournamentId/players
router.post('/:tournamentId/players', requireRole('admin'), validate(addTournamentPlayerSchema), addTournamentPlayer);

// DELETE /api/v1/clubs/:clubId/tournaments/:tournamentId/players/:playerId
router.delete('/:tournamentId/players/:playerId', requireRole('admin'), removeTournamentPlayer);

// GET /api/v1/clubs/:clubId/tournaments/:tournamentId/standings
router.get('/:tournamentId/standings', getTournamentStandings);

export default router;