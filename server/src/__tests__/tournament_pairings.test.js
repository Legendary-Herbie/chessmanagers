import { describe, expect, it } from 'vitest';
import {
    bergerSchedule,
    calculateStandings,
    knockoutPairings,
    swissPairings,
    validateSwissPairings,
} from '../services/TournamentPairingService.js';

function players(count) {
    return Array.from({ length: count }, (_, index) => ({
        id: String.fromCharCode(97 + index),
        name: `Player ${index + 1}`,
        rating: 1800 - index * 50,
        seed: index + 1,
        status: 'active',
        byeCount: 0,
    }));
}

function opponentKey(pairing) {
    return [pairing.whitePlayerId, pairing.blackPlayerId].sort().join(':');
}

describe('deterministic tournament pairing engines', () => {
    it('replays a drawn knockout slot before advancing the bracket', () => {
        const roster = players(4);
        const firstRound = knockoutPairings(roster, [], 1);
        const completed = firstRound.map((pairing, index) => ({
            ...pairing,
            roundNumber: 1,
            board: index + 1,
            result: index === 0 ? 'draw' : 'white',
        }));

        const playoff = knockoutPairings(roster, completed, 2);
        expect(playoff).toHaveLength(1);
        expect(playoff[0]).toMatchObject({
            whitePlayerId: completed[0].blackPlayerId,
            blackPlayerId: completed[0].whitePlayerId,
            bracketSlot: completed[0].bracketSlot,
            isPlayoff: true,
        });

        const nextRound = knockoutPairings(roster, [
            ...completed,
            { ...playoff[0], roundNumber: 2, board: 1, result: 'black' },
        ], 3);
        expect(nextRound).toHaveLength(1);
        expect(nextRound[0].whitePlayerId).toBe(playoff[0].blackPlayerId);
        expect(nextRound[0].blackPlayerId).toBe(completed[1].whitePlayerId);
    });

    it.each([6, 7, 8, 9, 10, 11, 12])('validates %i-player Swiss fields over several rounds', count => {
        const roster = players(count);
        const history = [];
        for (let roundNumber = 1; roundNumber <= 3; roundNumber++) {
            const round = swissPairings(roster, history, roundNumber);
            expect(() => validateSwissPairings(roster, history, round, roundNumber)).not.toThrow();
            expect(new Set(round.flatMap(game => [game.whitePlayerId, game.blackPlayerId].filter(Boolean))).size).toBe(count);
            for (const [index, pairing] of round.entries()) {
                history.push({ ...pairing, roundNumber, status: 'completed', result: pairing.isBye ? 'bye' : ['white', 'draw', 'black'][index % 3] });
                if (pairing.isBye) roster.find(player => player.id === pairing.whitePlayerId).byeCount++;
            }
        }
    });

    it('rejects malformed Swiss output and ineligible players before persistence', () => {
        const roster = players(4);
        const game = (whitePlayerId, blackPlayerId) => ({ whitePlayerId, blackPlayerId, isBye: false });
        for (const round of [[game('a', 'b')], [game('a', 'b'), game('a', 'd')], [game('a', 'b'), game('c', 'unknown')],
            [{ whitePlayerId: 'a', isBye: true }, { whitePlayerId: 'b', isBye: true }, game('c', 'd')]]) {
            expect(() => validateSwissPairings(roster, [], round)).toThrow();
        }
        const round = [game('a', 'b'), game('c', 'd')];
        expect(() => validateSwissPairings(roster, [game('b', 'a')], round)).toThrow();
        expect(() => validateSwissPairings(roster.map(player => ({ ...player, registrationRound: 3 })), [], round, 2)).toThrow();
        expect(() => validateSwissPairings(roster.map(player => ({ ...player, status: 'withdrawn' })), [], round)).toThrow();
        expect(() => validateSwissPairings(roster, [game('a', 'x'), game('a', 'y')], round)).toThrow();
    });

    it('resolves a three-way tie sequentially with optional, middle, shortened and empty criteria', () => {
        const roster = ['a','b','c','d','e','f','g','h'].map(id => ({ id, name: ({ a: 'Zed', b: 'Ann', c: 'Ben' })[id] ?? id }));
        const games = [['a','b','white'],['b','c','white'],['c','a','white'],
            ['a','d','draw'],['b','e','draw'],['c','f','draw'],['d','g','white'],['d','h','white'],['e','g','white'],['e','h','white']]
            .map(([whitePlayerId, blackPlayerId, result]) => ({ whitePlayerId, blackPlayerId, result, status: 'completed', isBye: false }));
        const tiedOrder = criteria => calculateStandings(roster, games, criteria).filter(row => ['a','b','c'].includes(row.playerId)).map(row => row.playerId);
        expect(tiedOrder([])).toEqual(['b','c','a']);
        expect(tiedOrder(['buchholz'])).toEqual(['b','a','c']);
        expect(tiedOrder(['buchholz','sonnebornBerger'])).toEqual(['b','a','c']);
        expect(tiedOrder(['buchholz','directHeadToHead','sonnebornBerger'])).toEqual(['a','b','c']);
        expect(calculateStandings(roster, games, ['buchholz']).every(row => row.directHeadToHead === 0)).toBe(true);
    });
    it('generates the Berger table golden schedule for four players', () => {
        expect(bergerSchedule(players(4))).toEqual([
            [
                { whitePlayerId: 'a', blackPlayerId: 'd', isBye: false },
                { whitePlayerId: 'c', blackPlayerId: 'b', isBye: false },
            ],
            [
                { whitePlayerId: 'c', blackPlayerId: 'a', isBye: false },
                { whitePlayerId: 'd', blackPlayerId: 'b', isBye: false },
            ],
            [
                { whitePlayerId: 'a', blackPlayerId: 'b', isBye: false },
                { whitePlayerId: 'd', blackPlayerId: 'c', isBye: false },
            ],
        ]);
    });

    it('gives each odd Round-Robin participant one deterministic bye', () => {
        const schedule = bergerSchedule(players(5));
        const games = schedule.flat().filter(pairing => !pairing.isBye);
        const byes = schedule.flat().filter(pairing => pairing.isBye);
        expect(schedule).toHaveLength(5);
        expect(new Set(games.map(opponentKey)).size).toBe(10);
        expect(byes.map(pairing => pairing.whitePlayerId).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('uses Dutch Swiss pairing without repeat opponents and avoids a second bye', () => {
        const participants = players(5);
        participants[4].byeCount = 1;
        const completed = [
            { roundNumber: 1, whitePlayerId: 'a', blackPlayerId: 'b', result: 'white', isBye: false },
            { roundNumber: 1, whitePlayerId: 'c', blackPlayerId: 'd', result: 'draw', isBye: false },
            { roundNumber: 1, whitePlayerId: 'e', blackPlayerId: null, result: 'bye', isBye: true },
        ];
        const generated = swissPairings(participants, completed);
        const previousOpponents = new Set(completed.filter(pairing => !pairing.isBye).map(opponentKey));
        expect(generated.filter(pairing => !pairing.isBye)
            .every(pairing => !previousOpponents.has(opponentKey(pairing)))).toBe(true);
        expect(generated.filter(pairing => pairing.isBye)).toHaveLength(1);
        expect(generated.find(pairing => pairing.isBye).whitePlayerId).not.toBe('e');
    });

    it('keeps Swiss colors balanced across deterministic rounds', () => {
        const participants = players(4);
        const completed = [];
        for (let roundNumber = 1; roundNumber <= 3; roundNumber += 1) {
            const round = swissPairings(participants, completed);
            for (const pairing of round) {
                completed.push({ ...pairing, roundNumber, result: pairing.isBye ? 'bye' : 'draw' });
            }
        }
        for (const player of participants) {
            const colors = completed.filter(pairing => !pairing.isBye && (
                pairing.whitePlayerId === player.id || pairing.blackPlayerId === player.id
            )).map(pairing => pairing.whitePlayerId === player.id ? 1 : -1);
            expect(Math.abs(colors.reduce((sum, color) => sum + color, 0))).toBeLessThanOrEqual(1);
        }
        expect(new Set(completed.filter(pairing => !pairing.isBye).map(opponentKey)).size).toBe(6);
    });

    it('changes tied-player ordering when head-to-head is moved before Buchholz', () => {
        const participants = ['a','b','c','d','e'].map(id => ({ id, name:id }));
        const completed = [['b','a'],['a','c'],['d','b'],['c','d'],['c','e']].map(([whitePlayerId,blackPlayerId]) => ({ whitePlayerId, blackPlayerId, status:'completed', result:'white', isBye:false }));
        const standard = calculateStandings(participants, completed).map(row => row.playerId);
        const directFirst = calculateStandings(participants, completed, ['directHeadToHead','buchholz']).map(row => row.playerId);
        expect(standard.indexOf('a')).toBeLessThan(standard.indexOf('b'));
        expect(directFirst.indexOf('b')).toBeLessThan(directFirst.indexOf('a'));
    });

    it('orders standings by match points, Buchholz, Sonneborn-Berger, then direct result', () => {
        const participants = players(3);
        const completed = [
            { status: 'completed', whitePlayerId: 'a', blackPlayerId: 'b', result: 'white', isBye: false },
            { status: 'completed', whitePlayerId: 'a', blackPlayerId: 'c', result: 'black', isBye: false },
            { status: 'completed', whitePlayerId: 'b', blackPlayerId: 'c', result: 'white', isBye: false },
        ];
        const standings = calculateStandings(participants, completed);
        expect(standings.map(row => row.playerId)).toEqual(['a', 'b', 'c']);
        expect(standings.map(row => row.matchPoints)).toEqual([1, 1, 1]);
        expect(standings.every(row => row.buchholz === 2)).toBe(true);
        expect(standings.every(row => row.sonnebornBerger === 1)).toBe(true);
        expect(standings.every(row => row.directHeadToHead === 1)).toBe(true);
    });
});
