import db from '../database/database.js';
import { MatchModel } from '../models/Match.js';
import {
    enqueueRatingRecalculation,
    replayRatingCategory,
    scheduleRatingRecalculation,
} from './RatingService.js';
import { notifyLinkedPlayers } from './NotificationService.js';

const failure = (code, details = {}) => ({ ok: false, code, ...details });

async function notifyMatchParticipants(trx, match, eventType, dedupeKey) {
    const players = await trx.query(
        `SELECT id, name FROM players
         WHERE club_id = $1 AND id IN ($2, $3)`,
        [match.club_id, match.white_player_id, match.black_player_id]
    ).then(result => new Map(result.rows.map(player => [player.id, player.name])));
    await notifyLinkedPlayers({
        trx,
        clubId: match.club_id,
        playerIds: [match.white_player_id, match.black_player_id],
        eventType,
        dedupeKey,
        payload: {
            matchId: match.id,
            whitePlayerId: match.white_player_id,
            whitePlayerName: players.get(match.white_player_id),
            blackPlayerId: match.black_player_id,
            blackPlayerName: players.get(match.black_player_id),
            result: match.result,
            ratingCategory: match.rating_category,
            playedAt: new Date(match.played_at).toISOString(),
        },
    });
}

async function validateParticipants(trx, clubId, whitePlayerId, blackPlayerId) {
    if (whitePlayerId === blackPlayerId) return failure('SAME_PLAYER');
    const players = await trx.query(
        `SELECT id FROM players
         WHERE club_id = $1 AND id IN ($2, $3)
           AND status = 'active' AND deleted_at IS NULL
         FOR SHARE`,
        [clubId, whitePlayerId, blackPlayerId]
    ).then(result => result.rows);
    return players.length === 2 ? { ok: true } : failure('PLAYERS_NOT_ACTIVE_IN_CLUB');
}

async function validateTournament(trx, values) {
    if (!values.tournamentId) return { ok: true };
    const tournament = await trx.query(
        `SELECT id, club_id, rating_category, is_rated
         FROM tournaments WHERE id = $1 AND club_id = $2 FOR SHARE`,
        [values.tournamentId, values.clubId]
    ).then(result => result.first);
    if (!tournament) return failure('TOURNAMENT_NOT_FOUND');
    if (tournament.rating_category !== values.ratingCategory || tournament.is_rated !== values.isRated) {
        return failure('TOURNAMENT_RATING_MISMATCH');
    }
    const roster = await trx.query(
        `SELECT player_id FROM tournament_players
         WHERE tournament_id = $1 AND player_id IN ($2, $3)`,
        [values.tournamentId, values.whitePlayerId, values.blackPlayerId]
    ).then(result => result.rows);
    return roster.length === 2 ? { ok: true } : failure('TOURNAMENT_ROSTER_MISMATCH');
}

async function lockTournamentPairing(trx, values, matchId = null) {
    if (!values.tournamentPairingId && !matchId) return { ok: true, pairing: null };
    const pairing = await trx.query(
        `SELECT * FROM tournament_pairings
         WHERE club_id = $1
           AND (($2::TEXT IS NOT NULL AND id = $2) OR ($3::TEXT IS NOT NULL AND match_id = $3))
         FOR UPDATE`,
        [values.clubId, values.tournamentPairingId ?? null, matchId]
    ).then(result => result.first);
    if (!pairing) {
        return values.tournamentPairingId
            ? failure('TOURNAMENT_PAIRING_NOT_FOUND')
            : { ok: true, pairing: null };
    }
    const matchesPairing = pairing.tournament_id === values.tournamentId
        && pairing.white_player_id === values.whitePlayerId
        && pairing.black_player_id === values.blackPlayerId
        && !pairing.is_bye;
    if (!matchesPairing) return failure('TOURNAMENT_PAIRING_MISMATCH');
    if (values.tournamentPairingId && (pairing.status !== 'scheduled' || pairing.match_id)) {
        return failure('TOURNAMENT_PAIRING_ALREADY_COMPLETED');
    }
    return { ok: true, pairing };
}

async function completeTournamentPairing(trx, pairing, match) {
    if (!pairing) return;
    await trx.query(
        `UPDATE tournament_pairings
         SET result = $1, match_id = $2, status = 'completed', updated_at = NOW()
         WHERE id = $3`,
        [match.result, match.id, pairing.id]
    );
    await trx.query(
        `UPDATE tournament_rounds round
         SET status = 'completed', completed_at = NOW()
         WHERE round.id = $1 AND NOT EXISTS (
            SELECT 1 FROM tournament_pairings pairing
            WHERE pairing.round_id = round.id AND pairing.status <> 'completed'
         )`,
        [pairing.round_id]
    );
    const tournament = await trx.query(
        'SELECT id, name FROM tournaments WHERE id = $1 AND club_id = $2',
        [pairing.tournament_id, pairing.club_id]
    ).then(result => result.first);
    await notifyLinkedPlayers({
        trx,
        clubId: pairing.club_id,
        playerIds: [pairing.white_player_id, pairing.black_player_id],
        eventType: 'tournament.result',
        dedupeKey: `tournament-result:${pairing.id}:${new Date(match.updated_at ?? match.created_at).toISOString()}`,
        payload: {
            tournamentId: pairing.tournament_id,
            tournamentName: tournament.name,
            roundNumber: pairing.round_number,
            pairingId: pairing.id,
            result: match.result,
        },
    });
}

async function reopenTournamentPairing(trx, matchId) {
    const pairing = await trx.query(
        `UPDATE tournament_pairings
         SET result = NULL, match_id = NULL, status = 'scheduled', updated_at = NOW()
         WHERE match_id = $1 RETURNING *`,
        [matchId]
    ).then(result => result.first);
    if (pairing) {
        await trx.query(
            `UPDATE tournament_rounds
             SET status = 'paired', completed_at = NULL WHERE id = $1`,
            [pairing.round_id]
        );
    }
}

async function validateResources(trx, values) {
    const participants = await validateParticipants(
        trx, values.clubId, values.whitePlayerId, values.blackPlayerId
    );
    if (!participants.ok) return participants;
    return validateTournament(trx, values);
}

async function possibleDuplicate(trx, values, excludeMatchId = null) {
    await trx.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        [values.clubId, [values.whitePlayerId, values.blackPlayerId].sort().join(':')]
    );
    return MatchModel.findPossibleDuplicate({ ...values, excludeMatchId }, trx);
}

function ratingFieldsChanged(oldMatch, values) {
    return oldMatch.white_player_id !== values.whitePlayerId
        || oldMatch.black_player_id !== values.blackPlayerId
        || oldMatch.result !== values.result
        || oldMatch.rating_category !== values.ratingCategory
        || oldMatch.is_rated !== values.isRated
        || new Date(oldMatch.played_at).getTime() !== new Date(values.playedAt).getTime();
}

async function enqueueAffectedRatings(trx, clubId, oldMatch, newMatch = null) {
    const scopes = new Map();
    if (oldMatch?.is_rated && oldMatch.status === 'active') {
        scopes.set(oldMatch.rating_category, new Date(oldMatch.played_at));
    }
    if (newMatch?.is_rated && newMatch.status === 'active') {
        const existing = scopes.get(newMatch.rating_category);
        const next = new Date(newMatch.played_at);
        scopes.set(newMatch.rating_category, existing && existing < next ? existing : next);
    }
    for (const [category, affectedFrom] of scopes) {
        await enqueueRatingRecalculation({ clubId, category, affectedFrom }, trx);
    }
    return [...scopes.keys()];
}

function scheduleScopes(clubId, categories) {
    for (const category of categories) scheduleRatingRecalculation(clubId, category);
}

export async function createMatch(input) {
    const result = await db.transaction(async trx => {
        const values = { ...input, tournamentId: input.tournamentId ?? null, notes: input.notes ?? null };
        const resourceCheck = await validateResources(trx, values);
        if (!resourceCheck.ok) return resourceCheck;
        const pairingCheck = await lockTournamentPairing(trx, values);
        if (!pairingCheck.ok) return pairingCheck;
        const duplicate = await possibleDuplicate(trx, values);
        if (duplicate && !input.confirmDuplicate) {
            return failure('POSSIBLE_DUPLICATE_MATCH', { duplicate });
        }

        if (values.isRated) {
            await trx.query(
                'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
                [values.clubId, values.ratingCategory]
            );
        }
        const isBackdated = values.isRated
            ? await MatchModel.hasLaterRatedMatch(
                values.clubId, values.ratingCategory, values.playedAt, trx
            )
            : false;
        const match = await MatchModel.create(values, trx);
        const audit = await MatchModel.recordAudit({
            clubId: values.clubId,
            matchId: match.id,
            actorUserId: values.actorUserId,
            eventType: 'match.created',
            newState: match,
        }, trx);
        await completeTournamentPairing(trx, pairingCheck.pairing, match);
        await notifyMatchParticipants(trx, match, 'match.recorded', `match-audit:${audit.id}`);

        if (!values.isRated) return { ok: true, match, ratingStatus: 'unrated', categories: [] };
        if (isBackdated) {
            const categories = await enqueueAffectedRatings(trx, values.clubId, null, match);
            return { ok: true, match, ratingStatus: 'recalculation_pending', categories };
        }
        const ratingResult = await replayRatingCategory(
            trx, values.clubId, values.ratingCategory, match.played_at
        );
        return { ok: true, match, ratingStatus: 'applied', ratingResult, categories: [] };
    });
    if (result.ok) scheduleScopes(input.clubId, result.categories);
    return result;
}

export async function updateMatch({ clubId, matchId, actorUserId, changes }) {
    const result = await db.transaction(async trx => {
        const existing = await MatchModel.findById(matchId, clubId, { forUpdate: true, trx });
        if (!existing) return failure('MATCH_NOT_FOUND');
        if (existing.status !== 'active') return failure('MATCH_NOT_ACTIVE');
        const values = {
            clubId,
            whitePlayerId: changes.whitePlayerId ?? existing.white_player_id,
            blackPlayerId: changes.blackPlayerId ?? existing.black_player_id,
            result: changes.result ?? existing.result,
            ratingCategory: changes.ratingCategory ?? existing.rating_category,
            playedAt: changes.playedAt ?? existing.played_at,
            isRated: changes.isRated ?? existing.is_rated,
            tournamentId: Object.hasOwn(changes, 'tournamentId')
                ? changes.tournamentId
                : existing.tournament_id,
            notes: Object.hasOwn(changes, 'notes') ? changes.notes : existing.notes,
        };
        const pairingCheck = await lockTournamentPairing(trx, values, matchId);
        if (!pairingCheck.ok) return pairingCheck;
        const resourceCheck = await validateResources(trx, values);
        if (!resourceCheck.ok) return resourceCheck;
        const affectsRatings = ratingFieldsChanged(existing, values);
        if (affectsRatings) {
            const duplicate = await possibleDuplicate(trx, values, matchId);
            if (duplicate && !changes.confirmDuplicate) {
                return failure('POSSIBLE_DUPLICATE_MATCH', { duplicate });
            }
        }
        const updated = await MatchModel.update(matchId, clubId, values, trx);
        if (!updated) return failure('MATCH_NOT_ACTIVE');
        let categories = [];
        if (affectsRatings && (existing.is_rated || updated.is_rated)) {
            await MatchModel.deleteRatingHistory(matchId, clubId, trx);
            categories = await enqueueAffectedRatings(trx, clubId, existing, updated);
        }
        const audit = await MatchModel.recordAudit({
            clubId, matchId, actorUserId,
            eventType: 'match.updated',
            reason: changes.reason ?? null,
            oldState: existing,
            newState: updated,
        }, trx);
        await completeTournamentPairing(trx, pairingCheck.pairing, updated);
        await notifyMatchParticipants(trx, updated, 'match.corrected', `match-audit:${audit.id}`);
        return {
            ok: true,
            match: updated,
            ratingStatus: categories.length ? 'recalculation_pending' : 'unchanged',
            categories,
        };
    });
    if (result.ok) scheduleScopes(clubId, result.categories);
    return result;
}

export async function voidMatch({ clubId, matchId, actorUserId, reason }) {
    const result = await db.transaction(async trx => {
        const existing = await MatchModel.findById(matchId, clubId, { forUpdate: true, trx });
        if (!existing) return failure('MATCH_NOT_FOUND');
        if (existing.status !== 'active') return failure('MATCH_NOT_ACTIVE');
        const match = await MatchModel.void(matchId, clubId, actorUserId, reason, trx);
        await reopenTournamentPairing(trx, matchId);
        let categories = [];
        if (existing.is_rated) {
            await MatchModel.deleteRatingHistory(matchId, clubId, trx);
            categories = await enqueueAffectedRatings(trx, clubId, existing);
        }
        const audit = await MatchModel.recordAudit({
            clubId, matchId, actorUserId,
            eventType: 'match.voided', reason,
            oldState: existing, newState: match,
        }, trx);
        await notifyMatchParticipants(trx, existing, 'match.voided', `match-audit:${audit.id}`);
        return { ok: true, match, ratingStatus: categories.length ? 'recalculation_pending' : 'unchanged', categories };
    });
    if (result.ok) scheduleScopes(clubId, result.categories);
    return result;
}

export async function deleteMatch({ clubId, matchId, actorUserId, reason = null }) {
    const result = await db.transaction(async trx => {
        const existing = await MatchModel.findById(matchId, clubId, {
            includeDeleted: true, forUpdate: true, trx,
        });
        if (!existing) return failure('MATCH_NOT_FOUND');
        if (existing.status === 'deleted') return failure('MATCH_NOT_ACTIVE');
        const match = await MatchModel.softDelete(matchId, clubId, actorUserId, reason, trx);
        await reopenTournamentPairing(trx, matchId);
        let categories = [];
        if (existing.is_rated && existing.status === 'active') {
            await MatchModel.deleteRatingHistory(matchId, clubId, trx);
            categories = await enqueueAffectedRatings(trx, clubId, existing);
        }
        const audit = await MatchModel.recordAudit({
            clubId, matchId, actorUserId,
            eventType: 'match.deleted', reason,
            oldState: existing, newState: match,
        }, trx);
        await notifyMatchParticipants(trx, existing, 'match.deleted', `match-audit:${audit.id}`);
        return { ok: true, match, ratingStatus: categories.length ? 'recalculation_pending' : 'unchanged', categories };
    });
    if (result.ok) scheduleScopes(clubId, result.categories);
    return result;
}
