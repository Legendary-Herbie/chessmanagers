import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubContext, NotificationsContext } from '../app/contextHooks.js';
import { clubApi } from '../features/clubs/api/clubApi.js';
import { leaderboardApi } from '../features/leaderboard/api/leaderboardApi.js';
import Dashboard from './Dashboard.jsx';

vi.mock('../features/clubs/api/clubApi.js', () => ({
    clubApi: {
        fetchJoinRequests: vi.fn(),
        approveJoinRequest: vi.fn(),
        rejectJoinRequest: vi.fn(),
    },
}));
vi.mock('../features/leaderboard/api/leaderboardApi.js', () => ({
    leaderboardApi: { fetchDashboard: vi.fn() },
}));
vi.mock('../features/players/admin/PendingLinksList.jsx', () => ({
    default: ({ onActionComplete }) => (
        <button type="button" onClick={onActionComplete}>Complete player claim action</button>
    ),
}));

function renderDashboard(capabilities) {
    return render(
        <NotificationsContext.Provider value={{ notify: vi.fn() }}>
            <ClubContext.Provider value={{
                club: { id: 'club_1', name: 'Central Chess Club' },
                capabilities,
            }}>
                <MemoryRouter><Dashboard /></MemoryRouter>
            </ClubContext.Provider>
        </NotificationsContext.Provider>
    );
}

describe('Dashboard membership queue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clubApi.fetchJoinRequests.mockResolvedValue([
            { id: 'request_1', name: 'Waiting Player', email: 'waiting@example.test' },
        ]);
        leaderboardApi.fetchDashboard.mockResolvedValue(null);
    });
    afterEach(cleanup);

    it('shows pending join requests prominently to owners and admins', async () => {
        renderDashboard({ canManageMemberships: true, canManagePlayers: false });
        expect(await screen.findByText('Waiting Player')).toBeTruthy();
        expect(screen.getByText('1 pending')).toBeTruthy();
    });

    it('does not expose the membership queue to ordinary members', () => {
        renderDashboard({ canManageMemberships: false, canManagePlayers: false });
        expect(screen.queryByText('Membership requests')).toBeNull();
        expect(clubApi.fetchJoinRequests).not.toHaveBeenCalled();
    });

    it('refreshes dashboard aggregates after a player claim decision', async () => {
        renderDashboard({ canManageMemberships: false, canManagePlayers: true });
        await waitFor(() => expect(leaderboardApi.fetchDashboard).toHaveBeenCalledTimes(1));

        fireEvent.click(screen.getByRole('button', { name: 'Complete player claim action' }));

        await waitFor(() => expect(leaderboardApi.fetchDashboard).toHaveBeenCalledTimes(2));
    });
    it('announces a load error and retries the dashboard', async () => {
        leaderboardApi.fetchDashboard.mockRejectedValueOnce(new Error('Offline'));
        renderDashboard({});
        expect((await screen.findByRole('alert')).textContent).toContain('Offline');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
        expect(leaderboardApi.fetchDashboard).toHaveBeenCalledTimes(2);
    });

});
