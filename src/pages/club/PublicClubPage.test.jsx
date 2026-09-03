import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, NotificationsContext } from '../../app/contextHooks.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';
import { leaderboardApi } from '../../features/leaderboard/api/leaderboardApi.js';
import PublicClubPage from './PublicClubPage.jsx';

vi.mock('../../features/clubs/api/clubApi.js', () => ({
    clubApi: {
        fetchPresentation: vi.fn(), fetchMembers: vi.fn(), fetchInvites: vi.fn(),
        fetchJoinRequests: vi.fn(), requestJoin: vi.fn(), createInvite: vi.fn(),
        revokeInvite: vi.fn(), approveJoinRequest: vi.fn(), rejectJoinRequest: vi.fn(),
    },
}));
vi.mock('../../features/leaderboard/api/leaderboardApi.js', () => ({
    leaderboardApi: { fetchPublicLeaderboard: vi.fn(), fetchStats: vi.fn() },
}));

function renderClub(club, user = { id: 'user_1' }) {
    clubApi.fetchPresentation.mockResolvedValue(club);
    return render(
        <AuthContext.Provider value={{ user }}>
            <NotificationsContext.Provider value={{ notify: vi.fn() }}>
                <MemoryRouter initialEntries={['/clubs/club_1']}>
                    <Routes>
                        <Route path="/clubs/:clubId" element={<PublicClubPage />} />
                    </Routes>
                </MemoryRouter>
            </NotificationsContext.Provider>
        </AuthContext.Provider>
    );
}

describe('PublicClubPage membership states', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clubApi.fetchMembers.mockRejectedValue({ status: 403 });
        clubApi.fetchInvites.mockRejectedValue({ status: 403 });
        clubApi.fetchJoinRequests.mockRejectedValue({ status: 403 });
        leaderboardApi.fetchStats.mockRejectedValue({ status: 403 });
        leaderboardApi.fetchPublicLeaderboard.mockResolvedValue({ entries: [] });
    });
    afterEach(cleanup);

    it('shows a pending request without another join action', async () => {
        renderClub({
            id: 'club_1', name: 'Test Club', membership: { status: 'PENDING_APPROVAL' },
            join_request_pending: true, can_request_join: false,
        });
        expect(await screen.findByText('Join request pending')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Request to join' })).toBeNull();
    });

    it('shows the rejection cooldown boundary', async () => {
        renderClub({
            id: 'club_1', name: 'Test Club', membership: {
                status: 'REJECTED', cooldownEndsAt: '2026-08-24T12:00:00.000Z',
            }, can_request_join: false,
        });
        expect(await screen.findByText(/Reapply after/)).toBeTruthy();
    });

    it('offers a rejoin request after revocation and moves to pending', async () => {
        clubApi.requestJoin.mockResolvedValue({ membership: { status: 'PENDING_APPROVAL' } });
        renderClub({
            id: 'club_1', name: 'Test Club', membership: { status: 'REVOKED' },
            can_request_join: true,
        });

        fireEvent.click(await screen.findByRole('button', { name: 'Request to rejoin' }));
        await waitFor(() => expect(clubApi.requestJoin).toHaveBeenCalledWith('club_1'));
        expect(await screen.findByText('Join request pending')).toBeTruthy();
    });

    it('preserves the club destination for guest authentication actions', async () => {
        renderClub({ id: 'club_1', name: 'Test Club', can_request_join: true }, null);
        expect((await screen.findByRole('link', { name: 'Sign in' })).getAttribute('href'))
            .toBe('/auth/login?returnTo=%2Fclubs%2Fclub_1');
        expect(screen.getByRole('link', { name: 'Register to join' }).getAttribute('href'))
            .toBe('/auth/register?returnTo=%2Fclubs%2Fclub_1');
    });

    it('shows public contacts, club-wide metrics, and category-specific top players', async () => {
        leaderboardApi.fetchPublicLeaderboard.mockResolvedValue({
            entries: [{ publicPlayerId: 'public_1', playerName: 'Ada Player', selectedRating: 1810 }],
        });
        renderClub({
            id: 'club_1', name: 'Test Club', visibility: 'public', public_leaderboard: true,
            can_request_join: true,
            contacts: {
                address: '42 Knight Street', email: 'club@example.test',
                phone: '+1 555 0100', website: 'https://club.example.test',
            },
            metrics: {
                memberCount: 24, rosterPlayers: 19, totalGames: 340,
                averageRatings: { blitz: 1580, rapid: 1640, classical: 1710 },
            },
        });

        expect(await screen.findAllByText('42 Knight Street')).toHaveLength(2);
        expect(screen.getByRole('link', { name: 'club@example.test' })).toBeTruthy();
        expect(screen.getByText('340')).toBeTruthy();
        expect(screen.getByText('Average classical')).toBeTruthy();
        expect(await screen.findByRole('link', { name: 'Ada Player' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Rapid' }));
        await waitFor(() => expect(leaderboardApi.fetchPublicLeaderboard).toHaveBeenLastCalledWith(
            'club_1', { category: 'rapid', limit: 5 }
        ));
    });
});
