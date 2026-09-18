import { createHash } from 'node:crypto';
import db from '../database/database.js';
import { MatchModel } from '../models/Match.js';
import {
    enqueueRatingRecalculation,
    replayRatingCategory,
    scheduleRatingRecalculation,
} from './RatingService.js';
import { notifyLinkedPlayers } from './NotificationService.js';

const failure = (code, details = {}) => ({ ok: false, code, ...details });

// Serialize results with registration, withdrawal, pairing and lifecycle changes.
// Acquire rating locks first (as deletion does), then tournament and match locks.
async function lockTournament(trx, clubId, tournamentId) {
    if (!tournamentId) return;
    await trx.query('SELECT id FROM tournaments WHERE id = $1 AND club_id = $2 FOR UPDATE', [tournamentId, clubId]);
}

async function lockMatchContext(trx, clubId, matchId, changes = {}) {
    const snapshot = await trx.query('SELECT tournament_id, rating_category, is_rated FROM matches WHERE id = $1 AND club_id = $2', [matchId, clubId]).then(result => result.first);
    if (!snapshot) return failure('MATCH_NOT_FOUND');
    await lockRatingCategories(trx, clubId, [
        ...(snapshot.is_rated ? [snapshot.rating_category] : []),
        ...((changes.isRated ?? snapshot.is_rated) ? [changes.ratingCategory ?? snapshot.rating_category] : []),
    ]);
    for (const id of [...new Set([snapshot.tournament_id, changes.tournamentId].filter(Boolean))].sort()) {
        await lockTournament(trx, clubId, id);
    }
    const match = await MatchModel.findById(matchId, clubId, { includeDeleted: true, forUpdate: true, trx });
    if (!match) return failure('MATCH_NOT_FOUND');
    // Another writer may have changed the lock scope while we waited. Retry safely.
    if (match.tournament_id !== snapshot.tournament_id || match.rating_category !== snapshot.rating_category
        || match.is_rated !== snapshot.is_rated) return failure('MATCH_CHANGED');
    return { ok: true, match };
}

async function lockRatingCategories(trx, clubId, categories) {
    for (const category of [...new Set(categories)].sort()) {
        await trx.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [clubId, category]);
    }
}

async function replayTournamentRatings(trx, clubId, category) {
    const jobs = await trx.query(
        `SELECT id FROM rating_recalculation_jobs
         WHERE club_id = $1 AND category = $2 AND status IN ('pending', 'failed') FOR UPDATE`,
        [clubId, category]
    ).then(result => result.rows.map(job => job.id));
    const result = await replayRatingCategory(trx, clubId, category);
    await trx.query(
        `UPDATE rating_recalculation_jobs SET status = 'completed', completed_at = NOW(),
         last_error = NULL, updated_at = NOW() WHERE id = ANY($1::TEXT[])`, [jobs]
    );
    return result;
}

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
        `SELECT id, club_id, type, rating_category, is_rated, status, deleted_at
         FROM tournaments WHERE id = $1 AND club_id = $2 FOR UPDATE`,
        [values.tournamentId, values.clubId]
    ).then(result => result.first);
    if (!tournament || tournament.deleted_at) return failure('TOURNAMENT_NOT_FOUND');
    const pairing = values.tournamentPairingId
        ? await trx.query(
            'SELECT rating_category FROM tournament_pairings WHERE id = $1 AND club_id = $2',
            [values.tournamentPairingId, values.clubId]
        ).then(result => result.first)
        : null;
    const expectedCategory = pairing?.rating_category ?? tournament.rating_category;
    if (expectedCategory !== values.ratingCategory || tournament.is_rated !== values.isRated) {
        return failure('TOURNAMENT_RATING_MISMATCH');
    }
    if (tournament.status !== 'active') return failure('TOURNAMENT_NOT_ACTIVE');
    const roster = await trx.query(
        `SELECT player_id, status FROM tournament_players
         WHERE tournament_id = $1 AND player_id IN ($2, $3)`,
        [values.tournamentId, values.whitePlayerId, values.blackPlayerId]
    ).then(result => result.rows);
    if (roster.length !== 2) return failure('TOURNAMENT_ROSTER_MISMATCH');
    return roster.every(player => player.status === 'active')
        ? { ok: true } : failure('TOURNAMENT_PLAYER_INELIGIBLE');
}

async function lockTournamentPairing(trx, values, matchId = null) {
    if (!values.tournamentId && !values.tournamentPairingId && !matchId) return { ok: true, pairing: null };
    const pairing = await trx.query(
        `SELECT * FROM tournament_pairings
         WHERE club_id = $1
           AND (($2::TEXT IS NOT NULL AND id = $2) OR ($2::TEXT IS NULL AND $3::TEXT IS NOT NULL AND match_id = $3)
             OR ($2::TEXT IS NULL AND $3::TEXT IS NULL AND tournament_id = $4
                 AND white_player_id = $5 AND black_player_id = $6
                 AND status = 'scheduled' AND match_id IS NULL))
         ORDER BY round_number DESC LIMIT 1
         FOR UPDATE`,
        [values.clubId, values.tournamentPairingId ?? null, matchId,
            values.tournamentId, values.whitePlayerId, values.blackPlayerId]
    ).then(result => result.first);
    if (!pairing) {
        return values.tournamentPairingId || values.tournamentId
            ? failure('TOURNAMENT_PAIRING_NOT_FOUND')
            : { ok: true, pairing: null };
    }
    const matchesPairing = pairing.tournament_id === values.tournamentId
        && pairing.white_player_id === values.whitePlayerId
        && pairing.black_player_id === values.blackPlayerId
        && !pairing.is_bye
        && (!matchId || (pairing.match_id === matchId && pairing.status === 'completed'));
    if (!matchesPairing) return failure('TOURNAMENT_PAIRING_MISMATCH');
    if (!matchId && (pairing.status !== 'scheduled' || pairing.match_id)) {
        return failure('TOURNAMENT_PAIRING_ALREADY_COMPLETED');
    }
    const round = await trx.query(
        `SELECT round.status, round.round_number, tournament.current_round, tournament.type
         FROM tournament_rounds round
         JOIN tournaments tournament ON tournament.id = round.tournament_id AND tournament.club_id = round.club_id
         WHERE round.id = $1 AND round.tournament_id = $2 AND round.club_id = $3`,
        [pairing.round_id, values.tournamentId, values.clubId]
    ).then(result => result.first);
    // A completed round accepts corrections to its existing games, never new results.
    const correction = matchId && pairing.match_id === matchId && pairing.status === 'completed';
    if (correction && round?.type === 'knockout' && round.current_round > pairing.round_number
        && values.result !== pairing.result) return failure('KNOCKOUT_BRACKET_LOCKED');
    if (!round || round.round_number !== pairing.round_number
        || (correction
            ? !['paired', 'completed'].includes(round.status) || round.round_number > round.current_round
            : round.status !== 'paired' || round.round_number !== round.current_round)) {
        return failure('TOURNAMENT_ROUND_NOT_OPEN');
    }
    const eligible = await trx.query(
        `SELECT player_id FROM tournament_players
         WHERE tournament_id = $1 AND player_id IN ($2, $3)
           AND status = 'active' AND registration_round <= $4`,
        [values.tournamentId, values.whitePlayerId, values.blackPlayerId, round.round_number]
    ).then(result => result.rows);
    if (eligible.length !== 2) return failure('TOURNAMENT_PLAYER_INELIGIBLE');
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
    const blocked = await trx.query(`SELECT pairing.id FROM tournament_pairings pairing
        JOIN tournaments tournament ON tournament.id = pairing.tournament_id AND tournament.club_id = pairing.club_id
        WHERE pairing.match_id = $1 AND tournament.type = 'knockout'
        AND (tournament.current_round > pairing.round_number OR tournament.status <> 'active')`, [matchId]).then(result => result.first);
    if (blocked) throw Object.assign(new Error('This knockout result is locked because play has advanced. Its match cannot be removed.'), { status: 409 });
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
        if (input.clientRequestId) {
            values.clientPayloadHash = createHash('sha256').update(JSON.stringify([
                values.whitePlayerId, values.blackPlayerId, values.result, values.ratingCategory,
                values.isRated, new Date(values.playedAt).toISOString(), values.notes, values.tournamentId,
            ])).digest('hex');
            await trx.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [values.clubId, `${values.actorUserId}:${input.clientRequestId}`]);
            const previous = await trx.query('SELECT * FROM matches WHERE club_id = $1 AND client_user_id = $2 AND client_request_id = $3', [values.clubId, values.actorUserId, input.clientRequestId]).then(result => result.first);
            if (previous) return previous.client_payload_hash === values.clientPayloadHash
                ? { ok: true, match: previous, ratingStatus: 'already_saved', categories: [] }
                : failure('REQUEST_ID_CONFLICT');
        }
        if (values.isRated) await lockRatingCategories(trx, values.clubId, [values.ratingCategory]);
        await lockTournament(trx, values.clubId, values.tournamentId);
        const resourceCheck = await validateResources(trx, values);
        if (!resourceCheck.ok) return resourceCheck;
        const pairingCheck = await lockTournamentPairing(trx, values);
        if (!pairingCheck.ok) return pairingCheck;
        const duplicate = await possibleDuplicate(trx, values);
        if (duplicate && !input.confirmDuplicate) {
            return failure('POSSIBLE_DUPLICATE_MATCH', { duplicate });
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
        if (isBackdated && !pairingCheck.pairing) {
            const categories = await enqueueAffectedRatings(trx, values.clubId, null, match);
            return { ok: true, match, ratingStatus: 'recalculation_pending', categories };
        }
        const ratingResult = pairingCheck.pairing
            ? await replayTournamentRatings(trx, values.clubId, values.ratingCategory)
            : await replayRatingCategory(trx, values.clubId, values.ratingCategory, match.played_at);
        return { ok: true, match, ratingStatus: 'applied', ratingResult, categories: [] };
    });
    if (result.ok) scheduleScopes(input.clubId, result.categories);
    return result;
}

export async function updateMatch({ clubId, matchId, actorUserId, changes, tournamentPairingId = null }) {
    const result = await db.transaction(async trx => {
        const context = await lockMatchContext(trx, clubId, matchId, changes);
        if (!context.ok) return context;
        const existing = context.match;
        if (existing.status !== 'active') return failure('MATCH_NOT_ACTIVE');
        const values = {
            clubId,
            tournamentPairingId,
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
            if (pairingCheck.pairing) {
                // Replay the whole category so earlier queued corrections are included too.
                await replayTournamentRatings(trx, clubId, updated.rating_category);
            } else {
                categories = await enqueueAffectedRatings(trx, clubId, existing, updated);
            }
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
            ratingStatus: categories.length ? 'recalculation_pending'
                : affectsRatings && updated.is_rated && pairingCheck.pairing ? 'applied' : 'unchanged',
            categories,
        };
    });
    if (result.ok) scheduleScopes(clubId, result.categories);
    return result;
}

export async function voidMatch({ clubId, matchId, actorUserId, reason }) {
    const result = await db.transaction(async trx => {
        const context = await lockMatchContext(trx, clubId, matchId);
        if (!context.ok) return context;
        const existing = context.match;
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
        const context = await lockMatchContext(trx, clubId, matchId);
        if (!context.ok) return context;
        const existing = context.match;
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
