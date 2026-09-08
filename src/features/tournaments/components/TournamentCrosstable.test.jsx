import React from 'react';
import { render, screen, within, cleanup } from '@testing-library/react';
import { afterEach, it, expect } from 'vitest';
import TournamentCrosstable from './TournamentCrosstable.jsx';

afterEach(cleanup);
it('uses server points including byes, preserves repeat opponents, and distinguishes pending from unpaired', () => {
    render(<TournamentCrosstable participants={[{ id: 'a', name: 'Ada', byeCount: 1 }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cora' }]}
        standings={[{ playerId: 'a', rank: 1, matchPoints: 9 }, { playerId: 'b', rank: 2, matchPoints: 0 }]}
        rounds={[
            { roundNumber: 1, pairings: [{ id: 'p1', whitePlayerId: 'a', blackPlayerId: 'b', result: 'white' }] },
            { roundNumber: 2, pairings: [{ id: 'p2', whitePlayerId: 'b', blackPlayerId: 'a', result: 'draw' }] },
            { roundNumber: 3, pairings: [{ id: 'p3', whitePlayerId: 'a', blackPlayerId: 'b', result: null }, { id: 'bye', whitePlayerId: 'c', isBye: true }] },
        ]} />);
    const cell = screen.getByRole('cell', { name: 'Ada against Ben' });
    expect(cell.textContent).toBe('1½?');
    expect(screen.getByRole('cell', { name: 'Ben against Ada' }).textContent).toBe('0½?');
    expect(screen.getByRole('cell', { name: 'Ada against Cora' }).textContent).toBe('·');
    expect(within(screen.getByRole('rowheader', { name: '1. Ada' }).closest('tr')).getByText('9')).toBeTruthy();
});
