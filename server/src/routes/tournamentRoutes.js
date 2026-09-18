import { Router } from 'express';
import {
    getTournaments,
    getTournament,
    createTournament,
    setupTournament,
    updateTournament,
    setTournamentStatus,
    deleteTournament,
    archiveTournament,
    getTournamentPlayers,
    addTournamentPlayer,
    removeTournamentPlayer,
    withdrawTournamentPlayer,
    getTournamentStandings,
    createTournamentRound,
    setPairingResult,
} from '../controllers/tournamentController.js';

import { requireAuth } from '../middleware/auth.js';
import { loadClubContext, requireActiveClubMember, requireClubAdmin } from '../middleware/requireRole.js';
import {
    validate,
    validateRequest,
    clubParamsSchema,
    clubTournamentParamsSchema,
    clubTournamentPlayerParamsSchema,
    clubTournamentPairingParamsSchema,
    tournamentListQuerySchema,
    createTournamentSchema,
    tournamentSetupSchema,
    updateTournamentSchema,
    setTournamentStatusSchema,
    addTournamentPlayerSchema,
    recordTournamentResultSchema,
    tournamentReasonSchema,
    permanentDeletionSchema,
    emptyBodySchema,
} from '../middleware/validate.js';

const router = Router({ mergeParams: true });

// All tournament routes require authentication and club membership
router.use(requireAuth, validateRequest({ params: clubParamsSchema }), loadClubContext, requireActiveClubMember);

// GET /api/v1/clubs/:clubId/tournaments
// Supports query param: ?status=upcoming|active|completed
router.get('/', validateRequest({ query: tournamentListQuerySchema }), getTournaments);

// POST /api/v1/clubs/:clubId/tournaments
router.post('/', requireClubAdmin, validate(createTournamentSchema), createTournament);
router.post('/:tournamentId/setup', validateRequest({ params: clubTournamentParamsSchema }), requireClubAdmin, validate(tournamentSetupSchema), setupTournament);

// GET /api/v1/clubs/:clubId/tournaments/:tournamentId
// Returns tournament + players + standings in one response
router.get('/:tournamentId', validateRequest({ params: clubTournamentParamsSchema }), getTournament);

// PATCH /api/v1/clubs/:clubId/tournaments/:tournamentId
router.patch('/:tournamentId', validateRequest({ params: clubTournamentParamsSchema }), requireClubAdmin, validate(updateTournamentSchema), updateTournament);

// PATCH /api/v1/clubs/:clubId/tournaments/:tournamentId/status
router.patch('/:tournamentId/status', validateRequest({ params: clubTournamentParamsSchema }), requireClubAdmin, validate(setTournamentStatusSchema), setTournamentStatus);

// DELETE /api/v1/clubs/:clubId/tournaments/:tournamentId
router.delete('/:tournamentId', validateRequest({ params: clubTournamentParamsSchema }), requireClubAdmin, validate(permanentDeletionSchema), deleteTournament);
router.post('/:tournamentId/archive', validateRequest({ params: clubTournamentParamsSchema }), requireClubAdmin, validate(tournamentReasonSchema), archiveTournament);

// ── Roster management ─────────────────────────────────────────────────────────

// GET /api/v1/clubs/:clubId/tournaments/:tournamentId/players
router.get('/:tournamentId/players', validateRequest({ params: clubTournamentParamsSchema }), getTournamentPlayers);

// POST /api/v1/clubs/:clubId/tournaments/:tournamentId/players
router.post('/:tournamentId/players', validateRequest({ params: clubTournamentParamsSchema }), requireClubAdmin, validate(addTournamentPlayerSchema), addTournamentPlayer);

// DELETE /api/v1/clubs/:clubId/tournaments/:tournamentId/players/:playerId
router.delete('/:tournamentId/players/:playerId', validateRequest({ params: clubTournamentPlayerParamsSchema }), requireClubAdmin, removeTournamentPlayer);

// PATCH /api/v1/clubs/:clubId/tournaments/:tournamentId/players/:playerId/withdraw
router.patch('/:tournamentId/players/:playerId/withdraw', validateRequest({ params: clubTournamentPlayerParamsSchema }), requireClubAdmin, validate(emptyBodySchema), withdrawTournamentPlayer);

// POST /api/v1/clubs/:clubId/tournaments/:tournamentId/rounds
router.post('/:tournamentId/rounds', validateRequest({ params: clubTournamentParamsSchema }), requireClubAdmin, validate(emptyBodySchema), createTournamentRound);

// POST /api/v1/clubs/:clubId/tournaments/:tournamentId/pairings/:pairingId/result
router.post('/:tournamentId/pairings/:pairingId/result', validateRequest({ params: clubTournamentPairingParamsSchema }), requireClubAdmin, validate(recordTournamentResultSchema), setPairingResult);

// GET /api/v1/clubs/:clubId/tournaments/:tournamentId/standings
router.get('/:tournamentId/standings', validateRequest({ params: clubTournamentParamsSchema }), getTournamentStandings);

export default router;
