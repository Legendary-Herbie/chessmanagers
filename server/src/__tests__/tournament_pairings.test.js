import { describe, expect, it } from 'vitest';
import {
    bergerSchedule,
    calculateStandings,
    swissPairings,
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
