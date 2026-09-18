import { pair as pairDutch } from '@echecs/swiss/dutch';

export function playerOrder(a, b) {
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

function knockoutWinner(pairing) {
    if (pairing.isBye) return pairing.whitePlayerId;
    if (pairing.result === 'white') return pairing.whitePlayerId;
    if (pairing.result === 'black') return pairing.blackPlayerId;
    return null;
}

export function knockoutProgress(pairings) {
    const completed = pairings.filter(game => game.result);
    const stages = [...new Set(pairings.filter(game => !game.isPlayoff).map(game => game.roundNumber))].sort((a, b) => a - b);
    const stageStart = Math.max(0, ...pairings.filter(game => !game.isPlayoff).map(game => game.roundNumber));
    const slots = new Map();
    for (const game of [...pairings].filter(game => game.roundNumber >= stageStart).sort((a, b) => a.roundNumber - b.roundNumber)) {
        slots.set(game.bracketSlot, game);
    }
    const current = [...slots.values()];
    return {
        championId: current.length === 1 ? knockoutWinner(current[0]) : null,
        needsPlayoff: current.some(game => game.result === 'draw'),
        eliminationRounds: new Map(completed.filter(game => ['white', 'black'].includes(game.result)).map(game => [
            game.result === 'white' ? game.blackPlayerId : game.whitePlayerId, stages.filter(round => round <= game.roundNumber).length,
        ])),
    };
}

export function knockoutPairings(participants, completedPairings, roundNumber = 1) {
    if (roundNumber === 1) {
        const seeded = [...participants].sort(playerOrder);
        if (seeded.length < 2) return [];
        const bracketSize = 2 ** Math.ceil(Math.log2(seeded.length));
        let seedSlots = [1, 2];
        for (let size = 4; size <= bracketSize; size *= 2) seedSlots = seedSlots.flatMap(seed => [seed, size + 1 - seed]);
        const padded = seedSlots.map(seed => seeded[seed - 1] ?? null);
        return Array.from({ length: bracketSize / 2 }, (_, index) => {
            const white = padded[index * 2];
            const black = padded[index * 2 + 1];
            if (!white || !black) {
                return { whitePlayerId: (white ?? black).id, blackPlayerId: null, isBye: true, bracketSlot: index + 1, isPlayoff: false };
            }
            return { whitePlayerId: white.id, blackPlayerId: black.id, isBye: false, bracketSlot: index + 1, isPlayoff: false };
        });
    }
    const stageStart = Math.max(0, ...completedPairings.filter(game => !game.isPlayoff).map(game => game.roundNumber));
    const latestBySlot = new Map();
    for (const pairing of completedPairings
        .filter(value => value.bracketSlot != null && value.roundNumber >= stageStart)
        .sort((a, b) => (a.roundNumber - b.roundNumber) || (a.board - b.board))) {
        latestBySlot.set(pairing.bracketSlot, pairing);
    }
    const previous = [...latestBySlot.values()].sort((a, b) => a.bracketSlot - b.bracketSlot);
    if (!previous.length || previous.some(pairing => !pairing.result)) return [];
    const drawn = previous.filter(pairing => pairing.result === 'draw');
    if (drawn.length) {
        if (drawn.some(pairing => [pairing.whitePlayerId, pairing.blackPlayerId].some(id => !participants.some(player => player.id === id)))) {
            throw new Error('A player in the tiebreak game is no longer eligible.');
        }
        return drawn.map(pairing => ({
            whitePlayerId: pairing.blackPlayerId,
            blackPlayerId: pairing.whitePlayerId,
            isBye: false,
            bracketSlot: pairing.bracketSlot,
            isPlayoff: true,
        }));
    }
    const winners = previous.map(knockoutWinner);
    if (winners.some(winner => !winner) || winners.length === 1) return [];
    if (winners.some(id => !participants.some(player => player.id === id))) throw new Error('An advancing player is no longer eligible.');
    return Array.from({ length: winners.length / 2 }, (_, index) => ({
        whitePlayerId: winners[index * 2],
        blackPlayerId: winners[index * 2 + 1],
        isBye: false,
        bracketSlot: index + 1,
        isPlayoff: false,
    }));
}

function numericResult(result) {
    if (result === 'white') return 1;
    if (result === 'black') return 0;
    return 0.5;
}

export function swissPairings(participants, completedPairings, roundNumber = Math.max(0, ...completedPairings.map(game => game.roundNumber ?? 0)) + 1) {
    const active = participants.filter(player => player.status === 'active'
        && (player.playerStatus ?? 'active') === 'active' && (player.registrationRound ?? 1) <= roundNumber).sort(playerOrder);
    const players = active.map(player => ({ id: player.id, rating: player.rating }));
    const byRound = new Map();
    for (const pairing of completedPairings.filter(value => value.result)) {
        const games = byRound.get(pairing.roundNumber) || [];
        games.push({
            white: pairing.whitePlayerId,
            black: pairing.isBye ? '' : pairing.blackPlayerId,
            result: pairing.isBye ? 1 : numericResult(pairing.result),
        });
        byRound.set(pairing.roundNumber, games);
    }
    const games = Array.from({ length: roundNumber - 1 }, (_, index) => byRound.get(index + 1) ?? []);
    const generated = pairDutch(players, games);
    const result = [
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
    validateSwissPairings(active, completedPairings, result, roundNumber);
    return result;
}

export function validateSwissPairings(eligible, history, pairings, roundNumber = Math.max(0, ...history.map(game => game.roundNumber ?? 0)) + 1) {
    const players = new Map(eligible.map(player => [player.id, player]));
    const seen = new Set();
    const opponents = new Set(history.filter(game => !game.isBye)
        .map(game => [game.whitePlayerId, game.blackPlayerId].sort().join(':')));
    let byes = 0;
    const fail = () => { throw new Error('Swiss pairing output violates roster, opponent, bye, or color constraints.'); };
    function include(id) {
        const player = players.get(id);
        if (!player || player.status !== 'active' || (player.playerStatus ?? 'active') !== 'active'
            || (player.registrationRound ?? 1) > roundNumber || seen.has(id)) fail();
        seen.add(id);
    }
    function color(id, next) {
        const colors = history.filter(game => !game.isBye && (game.whitePlayerId === id || game.blackPlayerId === id))
            .sort((a, b) => a.roundNumber - b.roundNumber)
            .map(game => game.whitePlayerId === id ? 1 : -1);
        if (Math.abs(colors.reduce((sum, value) => sum + value, next)) > 2
            || (colors.length >= 2 && colors.at(-1) === next && colors.at(-2) === next)) fail();
    }
    for (const pairing of pairings) {
        include(pairing.whitePlayerId);
        if (pairing.isBye) {
            if (pairing.blackPlayerId != null || ++byes > 1) fail();
            const hadBye = id => (players.get(id)?.byeCount ?? 0) > 0 || history.some(game => game.isBye && game.whitePlayerId === id);
            if (hadBye(pairing.whitePlayerId) && eligible.some(player => !hadBye(player.id))) fail();
        } else {
            include(pairing.blackPlayerId);
            if (opponents.has([pairing.whitePlayerId, pairing.blackPlayerId].sort().join(':'))) fail();
            color(pairing.whitePlayerId, 1);
            color(pairing.blackPlayerId, -1);
        }
    }
    if (seen.size !== players.size || byes !== eligible.length % 2) fail();
}

function pointsFor(pairing, playerId) {
    if (pairing.isBye) return pairing.whitePlayerId === playerId ? 1 : 0;
    if (pairing.result === 'draw') return 0.5;
    if (pairing.result === 'white') return pairing.whitePlayerId === playerId ? 1 : 0;
    if (pairing.result === 'black') return pairing.blackPlayerId === playerId ? 1 : 0;
    return 0;
}

export function calculateStandings(participants, pairings, tiebreaks = ['buchholz', 'sonnebornBerger', 'directHeadToHead']) {
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
    // Resolve only the still-tied groups at each configured criterion. Head-to-head
    // uses that group's mini-table; later criteria only split the remaining ties.
    function split(group, key) {
        const buckets = new Map();
        for (const row of group) {
            const value = row[key];
            if (!buckets.has(value)) buckets.set(value, []);
            buckets.get(value).push(row);
        }
        return [...buckets.entries()].sort(([a], [b]) => b - a).map(([, values]) => values);
    }
    let groups = split(rows, 'matchPoints');
    for (const key of tiebreaks) {
        groups = groups.flatMap(group => {
            if (key === 'directHeadToHead') {
                const tied = new Set(group.map(row => row.playerId));
                for (const row of group) {
                    row.directHeadToHead = completed.filter(pairing => !pairing.isBye
                        && tied.has(pairing.whitePlayerId) && tied.has(pairing.blackPlayerId)
                        && (pairing.whitePlayerId === row.playerId || pairing.blackPlayerId === row.playerId))
                        .reduce((sum, pairing) => sum + pointsFor(pairing, row.playerId), 0);
                }
            }
            return split(group, key);
        });
    }
    const ordered = groups.flatMap(group => group.sort((a, b) => a.playerName.localeCompare(b.playerName) || a.playerId.localeCompare(b.playerId)));
    return ordered.map((row, index) => ({ rank: index + 1, ...row }));
}
