import { TournamentModel } from '../models/Tournament.js';
import { permanentlyDeleteTournament } from '../services/DeletionService.js';
import {
    generateNextRound,
    saveTournamentSetup,
    getTournamentDetail,
    recordPairingResult,
} from '../services/TournamentService.js';
import { toMatchDto } from '../utils/matchDtos.js';

const FAILURES = {
    TOURNAMENT_NOT_FOUND: [404, 'Tournament not found.'],
    TOURNAMENT_NOT_ACTIVE: [409, 'The tournament must be active before generating a round.'],
    UNSUPPORTED_TOURNAMENT_FORMAT: [409, 'Only Swiss and Round-Robin tournaments are supported.'],
    TOURNAMENT_COMPLETED: [409, 'The tournament is already completed.'],
    TOURNAMENT_ALREADY_STARTED: [409, 'Remove players only before play starts; withdraw them after play starts.'],
    NOT_ENOUGH_PLAYERS: [409, 'At least two eligible active players are required.'],
    TOURNAMENT_COMPLETE: [409, 'All available Round-Robin pairings have been completed.'],
    PAIRING_FAILED: [409, 'A valid deterministic pairing could not be generated.'],
    PAIRING_NOT_FOUND: [404, 'Tournament pairing not found.'],
    BYE_HAS_NO_MATCH: [400, 'A bye is a tournament outcome and cannot have a match result.'],
    PLAYER_NOT_FOUND: [404, 'Active player not found in this club.'],
    PLAYER_ALREADY_REGISTERED: [409, 'Player is already registered in this tournament.'],
    PLAYER_NOT_REGISTERED: [404, 'Player is not registered in this tournament.'],
    PLAYER_NOT_ACTIVE: [409, 'Player is not an active tournament participant.'],
    SAME_PLAYER: [400, 'White and black must be different players.'],
    PLAYERS_NOT_ACTIVE_IN_CLUB: [404, 'Both players must be active players in this club.'],
    TOURNAMENT_ROSTER_MISMATCH: [400, 'Both players must be on the tournament roster.'],
    TOURNAMENT_RATING_MISMATCH: [400, 'The match settings must match the tournament.'],
    TOURNAMENT_PAIRING_NOT_FOUND: [404, 'Tournament pairing not found.'],
    TOURNAMENT_PAIRING_MISMATCH: [409, 'The match does not match this tournament pairing.'],
    TOURNAMENT_PAIRING_ALREADY_COMPLETED: [409, 'This tournament pairing already has a result.'],
    MATCH_NOT_FOUND: [404, 'Tournament match not found.'],
    MATCH_NOT_ACTIVE: [409, 'Only an active tournament match can be edited.'],
};

function sendFailure(res, result) {
    if (result.code === 'POSSIBLE_DUPLICATE_MATCH') {
        return res.status(409).json({
            error: 'A possible duplicate match was found. Confirm to save it anyway.',
            code: result.code,
            requiresConfirmation: true,
            duplicate: result.duplicate,
        });
    }
    const [status, message] = FAILURES[result.code] ?? [400, 'Tournament operation failed.'];
    return res.status(status).json({ error: message, code: result.code });
}

export async function getTournaments(req, res, next) {
    try {
        const result = await TournamentModel.findByClub(req.params.clubId, req.validatedQuery);
        const { limit = 50, offset = 0 } = req.validatedQuery;
        res.json({
            tournaments: result.tournaments.map(row => {
                const tournament = { ...row };
                delete tournament.total_count;
                return tournament;
            }),
            total: result.total,
            limit,
            offset,
        });
    } catch (error) {
        next(error);
    }
}

export async function getTournament(req, res, next) {
    try {
        const result = await getTournamentDetail(req.params.clubId, req.params.tournamentId);
        if (!result.ok) return sendFailure(res, result);
        const detail = { ...result };
        delete detail.ok;
        res.json(detail);
    } catch (error) {
        next(error);
    }
}

export async function createTournament(req, res, next) {
    try {
        const tournament = await TournamentModel.create({ clubId: req.params.clubId, ...req.validated });
        res.status(201).json({ tournament });
    } catch (error) {
        next(error);
    }
}

export async function updateTournament(req, res, next) {
    try {
        const tournament = await TournamentModel.update(
            req.params.tournamentId, req.params.clubId, req.validated
        );
        if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });
        res.json({ tournament });
    } catch (error) {
        next(error);
    }
}

export async function setTournamentStatus(req, res, next) {
    try {
        const existing = await TournamentModel.findById(req.params.tournamentId, req.params.clubId);
        if (!existing) return res.status(404).json({ error: 'Tournament not found.' });
        if (existing.status === req.validated.status) {
            return res.json({ tournament: existing });
        }
        const allowed = existing.status === req.validated.status
            || (existing.status === 'upcoming' && req.validated.status === 'active')
            || (existing.status === 'active' && req.validated.status === 'completed')
            || (existing.status === 'completed' && req.validated.status === 'active');
        if (!allowed) {
            return res.status(409).json({ error: `Cannot change a ${existing.status} tournament to ${req.validated.status}.` });
        }
        if (req.validated.status === 'completed' && existing.current_round > 0) {
            const detail = await getTournamentDetail(req.params.clubId, req.params.tournamentId);
            const current = detail.rounds.find(round => round.roundNumber === existing.current_round);
            if (current?.status !== 'completed') {
                return res.status(409).json({ error: 'Complete every pairing in the current round first.' });
            }
        }
        const tournament = await TournamentModel.setStatus(
            req.params.tournamentId, req.params.clubId, req.validated.status
        );
        res.json({ tournament });
    } catch (error) {
        next(error);
    }
}

export async function archiveTournament(req, res, next) {
    try {
        const deleted = await TournamentModel.archive(
            req.params.tournamentId, req.params.clubId, req.validated.reason ?? null
        );
        if (!deleted) return res.status(404).json({ error: 'Tournament not found.' });
        res.json({ message: 'Tournament archived.' });
    } catch (error) {
        next(error);
    }
}

export async function setupTournament(req, res, next) {
    try {
        const result = await saveTournamentSetup({ clubId: req.params.clubId, tournamentId: req.params.tournamentId, ...req.validated });
        if (!result.ok) return sendFailure(res, result);
        res.json(result);
    } catch (error) { next(error); }
}

export async function deleteTournament(req, res, next) {
    try {
        const deleted = await permanentlyDeleteTournament(req.params.clubId, req.params.tournamentId);
        if (!deleted) return res.status(404).json({ error: 'Tournament not found.' });
        res.json({ message: 'Tournament and related records deleted. Ratings recalculated.' });
    } catch (error) {
        next(error);
    }
}

export async function getTournamentPlayers(req, res, next) {
    try {
        const result = await getTournamentDetail(req.params.clubId, req.params.tournamentId);
        if (!result.ok) return sendFailure(res, result);
        res.json({ players: result.participants });
    } catch (error) {
        next(error);
    }
}

export async function addTournamentPlayer(req, res, next) {
    try {
        const result = await TournamentModel.addPlayer(
            req.params.tournamentId, req.validated.playerId, req.params.clubId
        );
        if (!result.ok) return sendFailure(res, result);
        res.status(201).json({ entry: result.entry });
    } catch (error) {
        next(error);
    }
}

export async function removeTournamentPlayer(req, res, next) {
    try {
        const result = await TournamentModel.removePlayer(
            req.params.tournamentId, req.params.playerId, req.params.clubId
        );
        if (!result.ok) return sendFailure(res, result);
        res.json({ message: 'Player removed from tournament.' });
    } catch (error) {
        next(error);
    }
}

export async function withdrawTournamentPlayer(req, res, next) {
    try {
        const result = await TournamentModel.withdrawPlayer(
            req.params.tournamentId, req.params.playerId, req.params.clubId
        );
        if (!result.ok) return sendFailure(res, result);
        res.json({ entry: result.entry });
    } catch (error) {
        next(error);
    }
}

export async function getTournamentStandings(req, res, next) {
    try {
        const result = await getTournamentDetail(req.params.clubId, req.params.tournamentId);
        if (!result.ok) return sendFailure(res, result);
        res.json({ standings: result.standings });
    } catch (error) {
        next(error);
    }
}

export async function createTournamentRound(req, res, next) {
    try {
        const result = await generateNextRound(req.params);
        if (!result.ok) return sendFailure(res, result);
        res.status(result.alreadyGenerated ? 200 : 201).json({
            round: result.round,
            pairings: result.pairings,
            alreadyGenerated: result.alreadyGenerated,
        });
    } catch (error) {
        next(error);
    }
}

export async function setPairingResult(req, res, next) {
    try {
        const result = await recordPairingResult({
            ...req.params,
            actorUserId: req.user.id,
            ...req.validated,
        });
        if (!result.ok) return sendFailure(res, result);
        res.status(result.created ? 201 : 200).json({
            match: toMatchDto(result.match),
            ratingStatus: result.ratingStatus,
        });
    } catch (error) {
        next(error);
    }
}
