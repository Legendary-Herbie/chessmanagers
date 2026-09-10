import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import HeadToHeadView from './HeadToHeadView.jsx';
import { playerApi } from '../api/playerApi.js';
vi.mock('../api/playerApi.js', () => ({ playerApi: {
    searchPlayers: vi.fn(), fetchHeadToHead: vi.fn(), fetchHeadToHeadMatches: vi.fn(),
} }));
afterEach(cleanup);
it('searches for an opponent, excludes the current player, and labels the ratio', async () => {
    const alpha = { id: 'a', name: 'Alpha' };
    playerApi.searchPlayers.mockResolvedValue({ players: [alpha, { id: 'b', name: 'Beta' }] });
    playerApi.fetchHeadToHead.mockResolvedValue({ overall: { games: 4, playerAWins: 2, draws: 1, playerBWins: 1 } });
    playerApi.fetchHeadToHeadMatches.mockResolvedValue([]);
    render(<HeadToHeadView clubId="club_1" playerA={alpha} />);
    fireEvent.focus(screen.getByRole('combobox', { name: 'Select opponent' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Beta' }));
    expect(screen.queryByRole('option', { name: 'Alpha' })).toBeNull();
    expect(await screen.findByRole('img', { name: 'Alpha: 2 wins; 1 draws; Beta: 1 wins' })).toBeTruthy();
    expect(playerApi.fetchHeadToHead).toHaveBeenCalledWith('club_1', 'a', 'b', expect.anything());
});
