import db from '../database/database.js';
import { TournamentModel } from '../models/Tournament.js';
import { createMatch, updateMatch } from './MatchService.js';
import { notifyLinkedPlayers } from './NotificationService.js';
import { bergerSchedule, calculateStandings, swissPairings } from './TournamentPairingService.js';

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
        isBye: row.is_bye,
        status: row.status,
    };
}

function eligibleParticipants(participants, roundNumber) {
    return participants.filter(player => player.status === 'active'
        && player.playerStatus === 'active'
        && player.registrationRound <= roundNumber);
}

function chooseRoundRobinPairings(participants, completedPairings) {
    const played = new Set(completedPairings.filter(pairing => !pairing.isBye).map(pairing => (
        [pairing.whitePlayerId, pairing.blackPlayerId].sort().join(':')
    )));
    const byeCounts = new Map(participants.map(player => [player.id, player.byeCount]));
    const candidates = bergerSchedule(participants).map((round, index) => {
        const remaining = round.filter(pairing => pairing.isBye
            ? (byeCounts.get(pairing.whitePlayerId) ?? 0) === 0
            : !played.has([pairing.whitePlayerId, pairing.blackPlayerId].sort().join(':')));
        return {
            index,
            pairings: remaining,
            games: remaining.filter(pairing => !pairing.isBye).length,
            repeatByes: remaining.filter(pairing => pairing.isBye
                && (byeCounts.get(pairing.whitePlayerId) ?? 0) > 0).length,
        };
    }).filter(candidate => candidate.pairings.length > 0);
    candidates.sort((a, b) => b.games - a.games || a.repeatByes - b.repeatByes || a.index - b.index);
    return candidates[0]?.pairings ?? [];
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

export async function generateNextRound({ clubId, tournamentId }) {
    return db.transaction(async trx => {
        const tournament = await TournamentModel.findById(tournamentId, clubId, {
            forUpdate: true, trx,
        });
        if (!tournament) return failure('TOURNAMENT_NOT_FOUND');
        if (tournament.status !== 'active') return failure('TOURNAMENT_NOT_ACTIVE');
        if (!['swiss', 'round_robin'].includes(tournament.type)) {
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
        let generated;
        try {
            generated = tournament.type === 'swiss'
                ? swissPairings(eligible, completedPairings)
                : chooseRoundRobinPairings(eligible, completedPairings);
        } catch (error) {
            return failure('PAIRING_FAILED', { reason: error.message });
        }
        if (!generated.length) return failure('TOURNAMENT_COMPLETE');

        const round = await trx.query(
            `INSERT INTO tournament_rounds (club_id, tournament_id, round_number)
             VALUES ($1, $2, $3) RETURNING *`,
            [clubId, tournamentId, roundNumber]
        ).then(result => result.first);
        const pairings = [];
        for (const [index, pairing] of generated.entries()) {
            const created = await trx.query(
                `INSERT INTO tournament_pairings (
                    club_id, tournament_id, round_id, round_number, board,
                    white_player_id, black_player_id, result, is_bye, status
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [clubId, tournamentId, round.id, roundNumber, index + 1,
                    pairing.whitePlayerId, pairing.blackPlayerId,
                    pairing.isBye ? 'bye' : null, pairing.isBye,
                    pairing.isBye ? 'completed' : 'scheduled']
            ).then(result => result.first);
            pairings.push(toPairing(created));
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
            `UPDATE tournaments SET current_round = $1, updated_at = NOW() WHERE id = $2`,
            [roundNumber, tournamentId]
        );
        return { ok: true, round, pairings, alreadyGenerated: false };
    });
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
    return {
        ok: true,
        tournament,
        participants,
        rounds,
        standings: calculateStandings(participants, pairings),
    };
}

export async function recordPairingResult({
    clubId, tournamentId, pairingId, actorUserId, result, playedAt, notes, confirmDuplicate,
}) {
    const pairing = await db.query(
        `SELECT pairing.*, tournament.rating_category, tournament.is_rated
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
            changes: { result, playedAt, notes, confirmDuplicate },
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
        isRated: pairing.is_rated,
        tournamentId,
        tournamentPairingId: pairingId,
        playedAt,
        notes: notes ?? null,
        confirmDuplicate,
    });
    return { ...created, created: true };
}

export { calculateStandings } from './TournamentPairingService.js';
