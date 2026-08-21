import { MatchModel } from '../models/Match.js';
import { PlayerModel } from '../models/Player.js';
import {
    createMatch as createMatchRecord,
    updateMatch as updateMatchRecord,
    voidMatch as voidMatchRecord,
    deleteMatch as deleteMatchRecord,
} from '../services/MatchService.js';
import { toMatchDto } from '../utils/matchDtos.js';

const FAILURES = {
    MATCH_NOT_FOUND: [404, 'Match not found.'],
    MATCH_NOT_ACTIVE: [409, 'Only an active match can be changed.'],
    SAME_PLAYER: [400, 'White and black must be different players.'],
    PLAYERS_NOT_ACTIVE_IN_CLUB: [404, 'Both players must be active players in this club.'],
    TOURNAMENT_NOT_FOUND: [404, 'Tournament not found in this club.'],
    TOURNAMENT_ROSTER_MISMATCH: [400, 'Both players must be on the tournament roster.'],
    TOURNAMENT_RATING_MISMATCH: [400, 'The match rating category and rated setting must match the tournament.'],
    TOURNAMENT_PAIRING_NOT_FOUND: [404, 'Tournament pairing not found.'],
    TOURNAMENT_PAIRING_MISMATCH: [409, 'The match does not match its tournament pairing.'],
    TOURNAMENT_PAIRING_ALREADY_COMPLETED: [409, 'This tournament pairing already has a result.'],
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
    const [status, message] = FAILURES[result.code] ?? [400, 'The match operation could not be completed.'];
    return res.status(status).json({ error: message, code: result.code });
}

export async function getMatches(req, res, next) {
    try {
        const result = await MatchModel.findByClub(req.params.clubId, req.validatedQuery);
        const { limit = 50, offset = 0 } = req.validatedQuery;
        res.json({
            matches: result.matches.map(match => {
                const row = { ...match };
                delete row.total_count;
                return toMatchDto(row);
            }),
            total: result.total,
            limit,
            offset,
        });
    } catch (error) {
        next(error);
    }
}

export async function getMatch(req, res, next) {
    try {
        const match = await MatchModel.findById(req.params.matchId, req.params.clubId);
        if (!match) return res.status(404).json({ error: 'Match not found.' });
        res.json({ match: toMatchDto(match) });
    } catch (error) {
        next(error);
    }
}

export async function createMatch(req, res, next) {
    try {
        const result = await createMatchRecord({
            clubId: req.params.clubId,
            actorUserId: req.user.id,
            ...req.validated,
        });
        if (!result.ok) return sendFailure(res, result);
        res.status(201).json({
            match: toMatchDto(result.match),
            ratingStatus: result.ratingStatus,
            ratingResult: result.ratingResult,
        });
    } catch (error) {
        next(error);
    }
}

export async function updateMatch(req, res, next) {
    try {
        const result = await updateMatchRecord({
            clubId: req.params.clubId,
            matchId: req.params.matchId,
            actorUserId: req.user.id,
            changes: req.validated,
        });
        if (!result.ok) return sendFailure(res, result);
        res.json({ match: toMatchDto(result.match), ratingStatus: result.ratingStatus });
    } catch (error) {
        next(error);
    }
}

export async function voidMatch(req, res, next) {
    try {
        const result = await voidMatchRecord({
            clubId: req.params.clubId,
            matchId: req.params.matchId,
            actorUserId: req.user.id,
            reason: req.validated.reason,
        });
        if (!result.ok) return sendFailure(res, result);
        res.json({ match: toMatchDto(result.match), ratingStatus: result.ratingStatus });
    } catch (error) {
        next(error);
    }
}

export async function deleteMatch(req, res, next) {
    try {
        const result = await deleteMatchRecord({
            clubId: req.params.clubId,
            matchId: req.params.matchId,
            actorUserId: req.user.id,
            reason: req.validated.reason ?? null,
        });
        if (!result.ok) return sendFailure(res, result);
        res.json({ match: toMatchDto(result.match), ratingStatus: result.ratingStatus });
    } catch (error) {
        next(error);
    }
}

export async function getPlayerMatches(req, res, next) {
    try {
        const { clubId, playerId } = req.params;
        const player = await PlayerModel.findById(playerId);
        if (!player || player.club_id !== clubId) return res.status(404).json({ error: 'Player not found.' });
        const matches = await MatchModel.findByPlayer(clubId, playerId, req.validatedQuery);
        res.json({ matches: matches.map(toMatchDto) });
    } catch (error) {
        next(error);
    }
}

export async function getHeadToHead(req, res, next) {
    try {
        const { clubId, playerAId, playerBId } = req.params;
        const [playerA, playerB] = await Promise.all([
            PlayerModel.findById(playerAId),
            PlayerModel.findById(playerBId),
        ]);
        if (!playerA || !playerB || playerA.club_id !== clubId || playerB.club_id !== clubId) {
            return res.status(404).json({ error: 'Player not found.' });
        }
        const matches = await MatchModel.findHeadToHead(clubId, playerAId, playerBId);
        res.json({ matches: matches.map(toMatchDto) });
    } catch (error) {
        next(error);
    }
}
