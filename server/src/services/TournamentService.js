import db from '../database/database.js';
import { TournamentModel } from '../models/Tournament.js';
import { createMatch, updateMatch } from './MatchService.js';
import { notifyLinkedPlayers } from './NotificationService.js';
import { bergerSchedule, calculateStandings, knockoutPairings, knockoutProgress, playerOrder, swissPairings } from './TournamentPairingService.js';

const failure = (code, details = {}) => ({ ok: false, code, ...details });

function toParticipant(row) {
    return {
        id: row.id,
        name: row.name,
        rating: row.rating ?? 0,
        status: row.status,
        playerStatus: row.player_status,
        registrationRound: row.registration_round,
        withdrawnRound: row.withdrawn_round,
        byeCount: row.bye_count,
        seed: row.seed,
        joinedAt: row.joined_at,
    };
}

function toPairing(row) {
    return {
        id: row.id,
        roundId: row.round_id,
        roundNumber: row.round_number,
        board: row.board,
        whitePlayerId: row.white_player_id,
        whitePlayerName: row.white_player_name,
        blackPlayerId: row.black_player_id,
        blackPlayerName: row.black_player_name,
        result: row.result,
        matchId: row.match_id,
        playedAt: row.match_played_at ?? null,
        notes: row.match_notes ?? null,
        isBye: row.is_bye,
        status: row.status,
        bracketSlot: row.bracket_slot,
        isPlayoff: row.is_playoff,
        ratingCategory: row.rating_category,
    };
}

function eligibleParticipants(participants, roundNumber) {
    return participants.filter(player => player.status === 'active'
        && player.playerStatus === 'active'
        && player.registrationRound <= roundNumber);
}

async function currentRoundPayload(trx, tournament) {
    if (!tournament.current_round) return null;
    const round = await trx.query(
        `SELECT * FROM tournament_rounds
         WHERE tournament_id = $1 AND club_id = $2 AND round_number = $3`,
        [tournament.id, tournament.club_id, tournament.current_round]
    ).then(result => result.first);
    if (!round || round.status === 'completed') return null;
    const pairings = await trx.query(
        `SELECT * FROM tournament_pairings
         WHERE tournament_id = $1 AND club_id = $2 AND round_number = $3
         ORDER BY board`,
        [tournament.id, tournament.club_id, tournament.current_round]
    ).then(result => result.rows);
    return { round, pairings: pairings.map(toPairing), alreadyGenerated: true };
}

export async function generateNextRound({ clubId, tournamentId, trx: existingTransaction }) {
    return (existingTransaction ? async fn => fn(existingTransaction) : db.transaction)(async trx => {
        const tournament = await TournamentModel.findById(tournamentId, clubId, {
            forUpdate: true, trx,
        });
        if (!tournament) return failure('TOURNAMENT_NOT_FOUND');
        if (tournament.status !== 'active') return failure('TOURNAMENT_NOT_ACTIVE');
        if (!['swiss', 'round_robin', 'knockout'].includes(tournament.type)) {
            return failure('UNSUPPORTED_TOURNAMENT_FORMAT');
        }

        const existing = await currentRoundPayload(trx, tournament);
        if (existing) return { ok: true, ...existing };

        const roundNumber = tournament.current_round + 1;
        const participantRows = await TournamentModel.getPlayers(tournamentId, clubId, trx);
        const participants = participantRows.map(toParticipant);
        const eligible = eligibleParticipants(participants, roundNumber);
        if (eligible.length < 2) return failure('NOT_ENOUGH_PLAYERS');

        const completedRows = await trx.query(
            `SELECT pairing.* FROM tournament_pairings pairing
             WHERE pairing.tournament_id = $1 AND pairing.club_id = $2
               AND pairing.status = 'completed'
             ORDER BY pairing.round_number, pairing.board`,
            [tournamentId, clubId]
        ).then(result => result.rows);
        const completedPairings = completedRows.map(toPairing);
        const frozenRoster = tournament.round_robin_roster
            ?? [...eligible].sort(playerOrder).map(player => player.id);
        if (tournament.type === 'round_robin' && (eligible.length !== frozenRoster.length
            || frozenRoster.some(id => !eligible.some(player => player.id === id)))) {
            return failure('ROUND_ROBIN_ROSTER_CHANGED');
        }
        let generated;
        try {
            if (tournament.type === 'knockout') {
                generated = knockoutPairings(eligible, completedPairings, roundNumber);
            } else if (tournament.type === 'round_robin') {
                const schedule = bergerSchedule(frozenRoster.map((id, seed) => ({ id, seed, name: id })));
                if (completedPairings.some(game => !schedule[game.roundNumber - 1]?.some(expected =>
                    expected.whitePlayerId === game.whitePlayerId && expected.blackPlayerId === game.blackPlayerId))) {
                    return failure('ROUND_ROBIN_ROSTER_CHANGED');
                }
                generated = schedule[roundNumber - 1] ?? [];
            } else {
                generated = swissPairings(eligible, completedPairings, roundNumber);
            }
        } catch (error) {
            return failure('PAIRING_FAILED', { reason: error.message });
        }
        if (!generated.length) return failure('TOURNAMENT_COMPLETE');

        const round = await trx.query(
            `INSERT INTO tournament_rounds (club_id, tournament_id, round_number)
             VALUES ($1, $2, $3) RETURNING *`,
            [clubId, tournamentId, roundNumber]
        ).then(result => result.first);
        const createdPairings = await trx.query(
            `INSERT INTO tournament_pairings (
                club_id, tournament_id, round_id, round_number, board,
              white_player_id, black_player_id, result, is_bye, status,
              bracket_slot, is_playoff, rating_category
             ) SELECT $1, $2, $3, $4, entry.board::INTEGER,
                    entry.white_id, entry.black_id,
                    CASE WHEN entry.is_bye THEN 'bye' ELSE NULL END,
                    entry.is_bye, CASE WHEN entry.is_bye THEN 'completed' ELSE 'scheduled' END,
                    entry.bracket_slot, entry.is_playoff, entry.rating_category
             FROM UNNEST($5::TEXT[], $6::TEXT[], $7::BOOLEAN[], $8::INTEGER[], $9::BOOLEAN[], $10::TEXT[]) WITH ORDINALITY
                  AS entry(white_id, black_id, is_bye, bracket_slot, is_playoff, rating_category, board)
             RETURNING *`,
            [clubId, tournamentId, round.id, roundNumber,
                generated.map(pairing => pairing.whitePlayerId),
                generated.map(pairing => pairing.blackPlayerId ?? null),
                generated.map(pairing => Boolean(pairing.isBye)),
                generated.map((pairing, index) => pairing.bracketSlot ?? index + 1),
                generated.map(pairing => Boolean(pairing.isPlayoff)),
                generated.map(() => tournament.rating_category)]
        ).then(result => result.rows.sort((a, b) => a.board - b.board));
        const pairings = createdPairings.map(toPairing);
        for (const created of createdPairings) {
            const pairing = toPairing(created);
            await notifyLinkedPlayers({
                trx,
                clubId,
                playerIds: [pairing.whitePlayerId, pairing.blackPlayerId].filter(Boolean),
                eventType: 'tournament.pairing',
                dedupeKey: `tournament-pairing:${created.id}`,
                payload: {
                    tournamentId,
                    tournamentName: tournament.name,
                    roundNumber,
                    pairingId: created.id,
                    ...(pairing.isBye ? { result: 'bye' } : {}),
                },
            });
            if (pairing.isBye) {
                await trx.query(
                    `UPDATE tournament_players SET bye_count = bye_count + 1
                     WHERE tournament_id = $1 AND player_id = $2`,
                    [tournamentId, pairing.whitePlayerId]
                );
            }
        }
        const allByes = pairings.every(pairing => pairing.isBye);
        if (allByes) {
            await trx.query(
                `UPDATE tournament_rounds SET status = 'completed', completed_at = NOW()
                 WHERE id = $1`,
                [round.id]
            );
            round.status = 'completed';
            round.completed_at = new Date();
        }
        await trx.query(
            `UPDATE tournaments SET current_round = $1, updated_at = NOW(),
                round_robin_roster = CASE WHEN type = 'round_robin' THEN $3::TEXT[] ELSE round_robin_roster END WHERE id = $2`,
            [roundNumber, tournamentId, frozenRoster]
        );
        return { ok: true, round, pairings, alreadyGenerated: false };
    });
}

export async function saveTournamentSetup({ clubId, tournamentId, playerIds, start, allActivePlayers = false }) {
    try {
        return await db.transaction(async trx => {
            const tournament = await TournamentModel.findById(tournamentId, clubId, { forUpdate: true, trx });
            if (!tournament) return failure('TOURNAMENT_NOT_FOUND');
            if (tournament.status !== 'upcoming' || tournament.current_round > 0) return failure('TOURNAMENT_ALREADY_STARTED');
            const ids = allActivePlayers ? (await trx.query(
                `SELECT id FROM players WHERE club_id = $1 AND status = 'active' AND deleted_at IS NULL ORDER BY id`,
                [clubId]
            )).rows.map(player => player.id) : playerIds;
            for (const playerId of [...new Set(ids)].sort()) {
                const added = await TournamentModel.addPlayer(tournamentId, playerId, clubId, { trx });
                if (!added.ok && added.code !== 'PLAYER_ALREADY_REGISTERED') throw Object.assign(new Error(added.code), { setupFailure: added });
            }
            if (start) {
                await TournamentModel.setStatus(tournamentId, clubId, 'active', { trx });
                const paired = await generateNextRound({ clubId, tournamentId, trx });
                if (!paired.ok) throw Object.assign(new Error(paired.code), { setupFailure: paired });
                return paired;
            }
            return { ok: true };
        });
    } catch (error) {
        if (error.setupFailure) return error.setupFailure;
        throw error;
    }
}

export async function getTournamentDetail(clubId, tournamentId) {
    const tournament = await TournamentModel.findById(tournamentId, clubId);
    if (!tournament) return failure('TOURNAMENT_NOT_FOUND');
    const [participantRows, roundRows, pairingRows] = await Promise.all([
        TournamentModel.getPlayers(tournamentId, clubId),
        TournamentModel.getRounds(tournamentId, clubId),
        TournamentModel.getPairings(tournamentId, clubId),
    ]);
    const participants = participantRows.map(toParticipant);
    const pairings = pairingRows.map(toPairing);
    const pairingsByRound = new Map();
    for (const pairing of pairings) {
        const values = pairingsByRound.get(pairing.roundNumber) ?? [];
        values.push(pairing);
        pairingsByRound.set(pairing.roundNumber, values);
    }
    const rounds = roundRows.map(round => ({
        id: round.id,
        roundNumber: round.round_number,
        status: round.status,
        pairedAt: round.paired_at,
        completedAt: round.completed_at,
        pairings: pairingsByRound.get(round.round_number) ?? [],
    }));
    const knockout = tournament.type === 'knockout' ? knockoutProgress(pairings) : null;
    let standings = calculateStandings(participants, pairings, tournament.tiebreaks);
    if (knockout) {
        standings = standings.sort((a, b) => (knockout.eliminationRounds.get(b.playerId) ?? Infinity) - (knockout.eliminationRounds.get(a.playerId) ?? Infinity)
            || a.playerName.localeCompare(b.playerName));
        let lastStage;
        let rank = 0;
        standings = standings.map((row, index) => {
            const stage = knockout.eliminationRounds.get(row.playerId) ?? Infinity;
            if (stage !== lastStage) rank = index + 1;
            lastStage = stage;
            return { ...row, rank, knockoutStatus: row.playerId === knockout.championId ? 'Champion' : Number.isFinite(stage) ? 'Eliminated' : 'In contention' };
        });
    }
    return {
        ok: true,
        tournament,
        participants,
        rounds,
        standings,
        ...(knockout ? { knockout: { championId: knockout.championId, needsPlayoff: knockout.needsPlayoff } } : {}),
    };
}

export async function recordPairingResult({
    clubId, tournamentId, pairingId, actorUserId, result, playedAt, notes, confirmDuplicate,
}) {
    const pairing = await db.query(
        `SELECT pairing.*, tournament.rating_category AS tournament_rating_category,
                tournament.is_rated AS tournament_is_rated
         FROM tournament_pairings pairing
         JOIN tournaments tournament ON tournament.id = pairing.tournament_id
           AND tournament.club_id = pairing.club_id
         WHERE pairing.id = $1 AND pairing.tournament_id = $2
           AND pairing.club_id = $3 AND tournament.deleted_at IS NULL`,
        [pairingId, tournamentId, clubId]
    ).then(queryResult => queryResult.first);
    if (!pairing) return failure('PAIRING_NOT_FOUND');
    if (pairing.is_bye) return failure('BYE_HAS_NO_MATCH');
    if (pairing.match_id) {
        const updated = await updateMatch({
            clubId,
            matchId: pairing.match_id,
            actorUserId,
            tournamentPairingId: pairingId,
            changes: { result, playedAt, notes, confirmDuplicate, tournamentId },
        });
        return { ...updated, created: false };
    }
    const created = await createMatch({
        clubId,
        actorUserId,
        whitePlayerId: pairing.white_player_id,
        blackPlayerId: pairing.black_player_id,
        result,
        ratingCategory: pairing.rating_category,
        isRated: pairing.tournament_is_rated,
        tournamentId,
        tournamentPairingId: pairingId,
        playedAt,
        notes: notes ?? null,
        confirmDuplicate,
    });
    return { ...created, created: true };
}

export { calculateStandings } from './TournamentPairingService.js';
