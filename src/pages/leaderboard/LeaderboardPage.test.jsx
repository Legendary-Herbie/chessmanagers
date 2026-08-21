import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ClubContext } from '../../app/contextHooks.js';
import { leaderboardApi } from '../../features/leaderboard/api/leaderboardApi.js';
import LeaderboardPage from './LeaderboardPage.jsx';

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
});
