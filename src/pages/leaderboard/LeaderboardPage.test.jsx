import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ClubContext } from '../../app/contextHooks.js';
import { leaderboardApi } from '../../features/leaderboard/api/leaderboardApi.js';
import LeaderboardPage from './LeaderboardPage.jsx';
import { playerApi } from '../../features/players/api/playerApi.js';

vi.mock('../../features/players/api/playerApi.js', () => ({ playerApi: { fetchRatingHistory: vi.fn() } }));

vi.mock('../../features/leaderboard/api/leaderboardApi.js', () => ({
    leaderboardApi: { fetchLeaderboard: vi.fn() },
}));

function LocationProbe() {
    return <output data-testid="location">{useLocation().search}</output>;
}

describe('LeaderboardPage URL state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        leaderboardApi.fetchLeaderboard.mockResolvedValue({ entries: [], total: 60 });
    });
    afterEach(cleanup);

    it('ignores late history from a closed player and restores keyboard focus', async () => {
        const entries = ['Ada', 'Beth'].map((name, index) => ({
            playerId: name, playerName: name, rank: index + 1, selectedRating: 1500,
            blitzRating: 1500, rapidRating: 1500, classicalRating: 1500, totalGames: 2,
        }));
        leaderboardApi.fetchLeaderboard.mockResolvedValue({ entries, total: 2 });
        let resolveAda;
        playerApi.fetchRatingHistory.mockImplementation((clubId, playerId) => playerId === 'Ada'
            ? new Promise(resolve => { resolveAda = resolve; }) : Promise.resolve([]));
        render(<ClubContext.Provider value={{ club: { id: 'club_1' } }}>
            <MemoryRouter><LeaderboardPage /></MemoryRouter>
        </ClubContext.Provider>);
        const opener = await screen.findByRole('button', { name: 'View Ada rating history' });
        opener.focus();
        fireEvent.click(opener);
        expect(screen.getByRole('dialog', { name: 'Ada' })).toBeTruthy();
        fireEvent.keyDown(document.activeElement, { key: 'Escape' });
        expect(document.activeElement).toBe(opener);
        fireEvent.click(screen.getByRole('button', { name: 'View Beth rating history' }));
        await screen.findByText('No rating history yet.');
        await act(async () => resolveAda([{ ratingAfter: 900 }, { ratingAfter: 1900 }]));
        expect(screen.getByRole('dialog', { name: 'Beth' }).querySelector('svg')).toBeNull();
        expect(screen.getByText('No rating history yet.')).toBeTruthy();
    });

    it('restores category, page, and search and keeps changes in the URL', async () => {
        render(
            <ClubContext.Provider value={{ club: { id: 'club_1' } }}>
                <MemoryRouter initialEntries={['/leaderboard?category=rapid&page=2&q=Ann']}>
                    <LeaderboardPage />
                    <LocationProbe />
                </MemoryRouter>
            </ClubContext.Provider>
        );

        await waitFor(() => expect(leaderboardApi.fetchLeaderboard).toHaveBeenCalledWith('club_1', {
            category: 'rapid', q: 'Ann', limit: 25, offset: 25,
        }));
        expect(screen.getByRole('button', { name: 'Rapid' }).className).toContain('active');
        expect(screen.getByLabelText('Search players').value).toBe('Ann');

        fireEvent.click(screen.getByRole('button', { name: 'Blitz' }));
        await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('category=blitz'));
        expect(screen.getByTestId('location').textContent).not.toContain('page=2');

        fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'Beth' } });
        await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('q=Beth'));
    });
    it('retries a failed leaderboard request without losing the category', async () => {
        leaderboardApi.fetchLeaderboard.mockRejectedValueOnce(new Error('Offline'));
        render(<ClubContext.Provider value={{ club: { id: 'club_1' } }}>
            <MemoryRouter initialEntries={['/leaderboard?category=rapid']}><LeaderboardPage /></MemoryRouter>
        </ClubContext.Provider>);
        expect((await screen.findByRole('alert')).textContent).toContain('Offline');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
        expect(leaderboardApi.fetchLeaderboard).toHaveBeenLastCalledWith('club_1', expect.objectContaining({ category: 'rapid' }));
    });

});

it('shows claimed badges beside names in desktop and mobile leaderboard views', async () => {
    leaderboardApi.fetchLeaderboard.mockResolvedValue({ entries: [
        { playerId: 'a', playerName: 'Ada', rank: 1, isClaimed: true },
        { playerId: 'b', playerName: 'Beth', rank: 2, isClaimed: false },
    ], total: 2 });
    const view = render(<ClubContext.Provider value={{ club: { id: 'club_1' } }}>
        <MemoryRouter><LeaderboardPage /></MemoryRouter>
    </ClubContext.Provider>);
    try {
        const badges = await screen.findAllByRole('img', { name: 'Claimed' });
        expect(badges).toHaveLength(2);
        for (const badge of badges) expect(badge.closest('button').textContent).toContain('Ada');
    } finally { view.unmount(); }
});
