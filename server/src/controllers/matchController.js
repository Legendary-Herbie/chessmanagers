import { MatchModel } from '../models/Match.js';
import { PlayerModel } from '../models/Player.js';
import { TournamentModel } from '../models/Tournament.js';
import { recalculateRatingsForClub } from '../utils/recalculation.js';
import db from '../database/database.js';

const VALID_RESULTS = ['white', 'black', 'draw'];
const VALID_TYPES = ['casual', 'rated', 'tournament'];
const RATED_TYPES = new Set(['rated', 'tournament']);

function pagination(value, fallback, maximum) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? Math.min(number, maximum) : fallback;
}

async function validateTournamentMatch({ clubId, tournamentId, whitePlayerId, blackPlayerId }) {
    if (!tournamentId) return null;
    const tournament = await TournamentModel.findById(tournamentId, clubId);
    if (!tournament) return null;
    const participants = await TournamentModel.getPlayers(tournamentId, clubId);
    const participantIds = new Set(participants.map(player => player.id));
    return participantIds.has(whitePlayerId) && participantIds.has(blackPlayerId) ? tournament : false;
}

export async function getMatches(req, res, next) {
    try {
        const { clubId } = req.params;
        const { type, tournamentId, playerId, limit, offset } = req.query;
        const matches = await MatchModel.findByClub(clubId, {
            type,
            tournamentId,
            playerId,
            limit: pagination(limit, 50, 100),
            offset: pagination(offset, 0, 100_000),
        });
        res.json({ matches });
    } catch (err) {
        next(err);
    }
}

export async function getMatch(req, res, next) {
    try {
        const match = await MatchModel.findById(req.params.matchId, req.params.clubId);
        if (!match) return res.status(404).json({ error: 'Match not found.' });
        res.json({ match });
    } catch (err) {
        next(err);
    }
}

export async function createMatch(req, res, next) {
    try {
        const { clubId } = req.params;
        const input = req.validated ?? req.body;
        const {
            whitePlayerId, blackPlayerId, result, type = 'casual', tournamentId,
            notes, timeControl = 'blitz', playedAt,
        } = input;

        if (!whitePlayerId || !blackPlayerId || whitePlayerId === blackPlayerId) {
            return res.status(400).json({ error: 'Two different players are required.' });
        }
        if (!VALID_RESULTS.includes(result) || !VALID_TYPES.includes(type)) {
            return res.status(400).json({ error: 'Invalid match result or type.' });
        }
        if ((type === 'tournament') !== Boolean(tournamentId)) {
            return res.status(400).json({ error: 'Tournament matches require a tournament; other matches must not include one.' });
        }

        const [white, black] = await Promise.all([
            PlayerModel.findById(whitePlayerId),
            PlayerModel.findById(blackPlayerId),
        ]);
        if (!white || !black || white.club_id !== clubId || black.club_id !== clubId) {
            return res.status(404).json({ error: 'Both players must belong to this club.' });
        }
        if (tournamentId) {
            const tournament = await validateTournamentMatch({ clubId, tournamentId, whitePlayerId, blackPlayerId });
            if (tournament === null) return res.status(404).json({ error: 'Tournament not found in this club.' });
            if (tournament === false) return res.status(400).json({ error: 'Both players must be in the tournament roster.' });
        }

        const { match } = await db.transaction(async (trx) => {
            const match = await MatchModel.create({
                clubId, whitePlayerId, blackPlayerId, result, type, tournamentId: tournamentId || null,
                notes: notes || null, timeControl, playedAt: playedAt || null,
            }, trx);
            if (RATED_TYPES.has(type)) await recalculateRatingsForClub(clubId, timeControl, trx);
            return { match };
        });
        res.status(201).json({ match });
    } catch (err) {
        next(err);
    }
}

export async function updateMatch(req, res, next) {
    try {
        const { clubId, matchId } = req.params;
        const existing = await MatchModel.findById(matchId, clubId);
        if (!existing) return res.status(404).json({ error: 'Match not found.' });
        const input = req.validated ?? req.body;
        if (input.result && !VALID_RESULTS.includes(input.result)) {
            return res.status(400).json({ error: 'Invalid match result.' });
        }
        const match = await db.transaction(async (trx) => {
            const updated = await MatchModel.updateResult(matchId, clubId, input, trx);
            if (!updated) return null;
            if (RATED_TYPES.has(existing.type)) {
                await recalculateRatingsForClub(clubId, existing.time_control, trx);
                if (updated.time_control !== existing.time_control) {
                    await recalculateRatingsForClub(clubId, updated.time_control, trx);
                }
            }
            return updated;
        });
        if (!match) return res.status(404).json({ error: 'Match not found.' });
        res.json({ match });
    } catch (err) {
        next(err);
    }
}

export async function deleteMatch(req, res, next) {
    try {
        const { clubId, matchId } = req.params;
        const existing = await MatchModel.findById(matchId, clubId);
        if (!existing) return res.status(404).json({ error: 'Match not found.' });
        await db.transaction(async (trx) => {
            await MatchModel.delete(matchId, clubId, trx);
            if (RATED_TYPES.has(existing.type)) {
                await recalculateRatingsForClub(clubId, existing.time_control, trx);
            }
        });
        res.json({ message: 'Match deleted.' });
    } catch (err) {
        next(err);
    }
}

export async function getPlayerMatches(req, res, next) {
    try {
        const { clubId, playerId } = req.params;
        const player = await PlayerModel.findById(playerId);
        if (!player || player.club_id !== clubId) return res.status(404).json({ error: 'Player not found.' });
        const matches = await MatchModel.findByPlayer(clubId, playerId, {
            limit: pagination(req.query.limit, 20, 100),
            offset: pagination(req.query.offset, 0, 100_000),
        });
        res.json({ matches });
    } catch (err) {
        next(err);
    }
}

export async function getHeadToHead(req, res, next) {
    try {
        const { clubId, playerAId, playerBId } = req.params;
        const [playerA, playerB] = await Promise.all([PlayerModel.findById(playerAId), PlayerModel.findById(playerBId)]);
        if (!playerA || !playerB || playerA.club_id !== clubId || playerB.club_id !== clubId) {
            return res.status(404).json({ error: 'Player not found.' });
        }
        const matches = await MatchModel.findHeadToHead(clubId, playerAId, playerBId);
        res.json({ matches });
    } catch (err) {
        next(err);
    }
}
