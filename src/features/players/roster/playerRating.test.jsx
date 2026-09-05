import React from 'react';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { playerRating } from './playerRating.js';
import { usePlayers } from '../hooks/usePlayers.js';
import { playerApi } from '../api/playerApi.js';
import PlayerCard from '../components/PlayerCard.jsx';
import PlayerTable from './PlayerTable.jsx';
vi.mock('../api/playerApi.js', () => ({ playerApi: { fetchPlayers: vi.fn(), fetchRosterSummary: vi.fn() } }));
afterEach(cleanup);
const players = [
    { id: 'a', name: 'Ada', rating: 9999, blitz_rating: 900, ratings: { blitz: { current_rating: 1200 }, rapid: { current_rating: 1800 } } },
    { id: 'b', name: 'Beth', ratings: { blitz: { current_rating: 1700 }, rapid: { current_rating: 1100 } } },
    { id: 'c', name: 'Missing', rating: 9999 },
];
it('uses category state, falls back only to the same category, and preserves zero', () => {
    expect(playerRating(players[0], 'blitz')).toBe(1200);
    expect(playerRating({ classical_rating: 1300 }, 'classical')).toBe(1300);
    expect(playerRating({ blitz_rating: 0 }, 'blitz')).toBe(0);
    expect(playerRating(players[2], 'rapid')).toBeNull();
});
it('sorts by the chosen category with missing ratings last in either direction', async () => {
    playerApi.fetchPlayers.mockResolvedValue(players);
    playerApi.fetchRosterSummary.mockResolvedValue({});
    const { result } = renderHook(() => usePlayers('club_1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.processedPlayers.map(p => p.id)).toEqual(['b', 'a', 'c']);
    act(() => result.current.setRatingCategory('rapid'));
    expect(result.current.processedPlayers.map(p => p.id)).toEqual(['a', 'b', 'c']);
    act(() => result.current.setSortBy('rating_asc'));
    expect(result.current.processedPlayers.map(p => p.id)).toEqual(['b', 'a', 'c']);
});
it('labels the selected rating consistently in cards and tables without generic fallback', () => {
    render(<MemoryRouter><PlayerCard player={players[0]} ratingCategory="rapid" /><PlayerTable players={players} ratingCategory="rapid" /></MemoryRouter>);
    expect(screen.getByText('Rapid Elo: 1800')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Rapid Elo rating' })).toBeTruthy();
    expect(screen.queryByText(/9999/)).toBeNull();
});
