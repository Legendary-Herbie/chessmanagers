import { pair as pairDutch } from '@echecs/swiss/dutch';

function playerOrder(a, b) {
    return (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER)
        || (b.rating ?? 0) - (a.rating ?? 0)
        || a.name.localeCompare(b.name)
        || a.id.localeCompare(b.id);
}

export function bergerSchedule(sourcePlayers) {
    const players = [...sourcePlayers].sort(playerOrder).map(player => player.id);
    if (players.length < 2) return [];
    if (players.length % 2) players.push(null);
    const count = players.length;
    const rotation = [...players];
    const rounds = [];
    for (let roundIndex = 0; roundIndex < count - 1; roundIndex += 1) {
        const pairings = [];
        for (let board = 0; board < count / 2; board += 1) {
            let first = rotation[board];
            let second = rotation[count - 1 - board];
            if (board === 0 ? roundIndex % 2 === 1 : (board + roundIndex) % 2 === 1) {
                [first, second] = [second, first];
            }
            if (first === null || second === null) {
                pairings.push({ whitePlayerId: first ?? second, blackPlayerId: null, isBye: true });
            } else {
                pairings.push({ whitePlayerId: first, blackPlayerId: second, isBye: false });
            }
        }
        rounds.push(pairings);
        rotation.splice(1, 0, rotation.pop());
    }
    return rounds;
}

function numericResult(result) {
    if (result === 'white') return 1;
    if (result === 'black') return 0;
    return 0.5;
}

export function swissPairings(participants, completedPairings) {
    const active = participants.filter(player => player.status === 'active').sort(playerOrder);
    const players = active.map((player, index) => ({
        id: player.id,
        rating: player.rating,
        receivedBye: player.byeCount > 0,
        avoid: completedPairings.filter(pairing => (
            pairing.whitePlayerId === player.id || pairing.blackPlayerId === player.id
        )).map(pairing => pairing.whitePlayerId === player.id
            ? pairing.blackPlayerId : pairing.whitePlayerId).filter(Boolean),
        seating: completedPairings.filter(pairing => !pairing.isBye && (
            pairing.whitePlayerId === player.id || pairing.blackPlayerId === player.id
        )).map(pairing => pairing.whitePlayerId === player.id ? 1 : -1),
        rank: index + 1,
    }));
    const byRound = new Map();
    for (const pairing of completedPairings.filter(value => !value.isBye && value.result)) {
        const games = byRound.get(pairing.roundNumber) || [];
        games.push({
            white: pairing.whitePlayerId,
            black: pairing.blackPlayerId,
            result: numericResult(pairing.result),
        });
        byRound.set(pairing.roundNumber, games);
    }
    const games = [...byRound.entries()].sort(([a], [b]) => a - b).map(([, round]) => round);
    const generated = pairDutch(players, games, true, true);
    return [
        ...generated.pairings.map(pairing => ({
            whitePlayerId: pairing.white,
            blackPlayerId: pairing.black,
            isBye: false,
        })),
        ...generated.byes.map(bye => ({
            whitePlayerId: bye.player,
            blackPlayerId: null,
            isBye: true,
        })),
    ];
}

function pointsFor(pairing, playerId) {
    if (pairing.isBye) return pairing.whitePlayerId === playerId ? 1 : 0;
    if (pairing.result === 'draw') return 0.5;
    if (pairing.result === 'white') return pairing.whitePlayerId === playerId ? 1 : 0;
    if (pairing.result === 'black') return pairing.blackPlayerId === playerId ? 1 : 0;
    return 0;
}

export function calculateStandings(participants, pairings) {
    const completed = pairings.filter(pairing => pairing.status === 'completed');
    const rows = participants.map(player => {
        const games = completed.filter(pairing => (
            pairing.whitePlayerId === player.id || pairing.blackPlayerId === player.id
        ));
        return {
            playerId: player.id,
            playerName: player.name,
            matchPoints: games.reduce((sum, pairing) => sum + pointsFor(pairing, player.id), 0),
            played: games.filter(pairing => !pairing.isBye).length,
            wins: games.filter(pairing => !pairing.isBye && pointsFor(pairing, player.id) === 1).length,
            draws: games.filter(pairing => !pairing.isBye && pointsFor(pairing, player.id) === 0.5).length,
            losses: games.filter(pairing => !pairing.isBye && pointsFor(pairing, player.id) === 0).length,
            buchholz: 0,
            sonnebornBerger: 0,
            directHeadToHead: 0,
        };
    });
    const byId = new Map(rows.map(row => [row.playerId, row]));
    for (const row of rows) {
        const games = completed.filter(pairing => !pairing.isBye && (
            pairing.whitePlayerId === row.playerId || pairing.blackPlayerId === row.playerId
        ));
        for (const game of games) {
            const opponentId = game.whitePlayerId === row.playerId ? game.blackPlayerId : game.whitePlayerId;
            const opponent = byId.get(opponentId);
            row.buchholz += opponent?.matchPoints ?? 0;
            row.sonnebornBerger += (opponent?.matchPoints ?? 0) * pointsFor(game, row.playerId);
        }
    }
    for (const row of rows) {
        const tied = new Set(rows.filter(other => other.matchPoints === row.matchPoints
            && other.buchholz === row.buchholz
            && other.sonnebornBerger === row.sonnebornBerger).map(other => other.playerId));
        row.directHeadToHead = completed.filter(pairing => !pairing.isBye
            && tied.has(pairing.whitePlayerId) && tied.has(pairing.blackPlayerId)
            && (pairing.whitePlayerId === row.playerId || pairing.blackPlayerId === row.playerId))
            .reduce((sum, pairing) => sum + pointsFor(pairing, row.playerId), 0);
    }
    rows.sort((a, b) => b.matchPoints - a.matchPoints || b.buchholz - a.buchholz
        || b.sonnebornBerger - a.sonnebornBerger || b.directHeadToHead - a.directHeadToHead
        || a.playerName.localeCompare(b.playerName));
    return rows.map((row, index) => ({ rank: index + 1, ...row }));
}
