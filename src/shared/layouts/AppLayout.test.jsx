import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, ClubContext, ThemeContext } from '../../app/contextHooks.js';
import { notificationApi } from '../../features/notifications/api/notificationApi.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';
import AppLayout from './AppLayout.jsx';

vi.mock('../../features/notifications/api/notificationApi.js', () => ({
    notificationApi: {
        list: vi.fn(),
        unreadCount: vi.fn(),
        markRead: vi.fn(),
        markAllRead: vi.fn(),
        dismiss: vi.fn(),
    },
}));
vi.mock('../../features/clubs/api/clubApi.js', () => ({
    clubApi: { leave: vi.fn(), restore: vi.fn() },
}));

function renderLayout({ role = 'owner', refreshClubs = vi.fn() } = {}) {
    return render(
        <AuthContext.Provider value={{ user: { id: 'user_1', name: 'Club Owner' }, logout: vi.fn() }}>
            <ClubContext.Provider value={{
                club: { id: 'club_1', name: 'Downtown Chess' },
                clubs: [],
                activeClubs: [{ club: { id: 'club_1', name: 'Downtown Chess' }, membership: { role } }],
                selectedClubId: 'club_1',
                membership: { role },
                selectClub: vi.fn(),
                refreshClubs,
                capabilities: { canManageMemberships: true, canManageClubSettings: true },
                loading: false,
            }}>
                <ThemeContext.Provider value={{ theme: 'light', toggleTheme: vi.fn() }}>
                    <MemoryRouter initialEntries={['/dashboard']}>
                        <Routes>
                            <Route element={<AppLayout />}>
                                <Route path="/dashboard" element={<h1>Dashboard content</h1>} />
                                <Route path="/matches" element={<h1>Matches content</h1>} />
                            </Route>
                        </Routes>
                    </MemoryRouter>
                </ThemeContext.Provider>
            </ClubContext.Provider>
        </AuthContext.Provider>
    );
}

describe('AppLayout navigation', () => {
    const stored = new Map();

    beforeEach(() => {
        vi.clearAllMocks();
        stored.clear();
        notificationApi.list.mockResolvedValue({ notifications: [{
            id: 'notification_1',
            clubName: 'Downtown Chess',
            eventType: 'membership.request_pending',
            payload: { applicantName: 'Waiting Player' },
            readAt: null,
        }], total: 1 });
        notificationApi.unreadCount.mockResolvedValue({ count: 1 });
        vi.stubGlobal('localStorage', {
            getItem: key => stored.get(key) ?? null,
            setItem: (key, value) => stored.set(key, String(value)),
        });
    });
    afterEach(cleanup);
    afterAll(() => vi.unstubAllGlobals());

    it('provides icon navigation and persists the collapsed desktop sidebar', async () => {
        const { container } = renderLayout();

        expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Dashboard' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

        expect(container.querySelector('.app-shell--sidebar-collapsed')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
        await waitFor(() => expect(stored.get('chess-managers-sidebar')).toBe('collapsed'));
    });

    it('exposes a mobile menu toggle without changing the route links', () => {
        renderLayout();
        fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
        expect(screen.getByRole('button', { name: 'Close navigation menu' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Matches' })).toBeTruthy();
    });

    it('resets document scroll when navigating between pages', async () => {
        renderLayout();
        document.documentElement.scrollTop = 480;
        document.body.scrollTop = 480;

        fireEvent.click(screen.getByRole('link', { name: 'Matches' }));

        expect(await screen.findByRole('heading', { name: 'Matches content' })).toBeTruthy();
        expect(document.documentElement.scrollTop).toBe(0);
        expect(document.body.scrollTop).toBe(0);
    });

    it('renders and opens the real notification panel from the sidebar', async () => {
        renderLayout();
        fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));

        expect(await screen.findByRole('dialog', { name: 'Notifications' })).toBeTruthy();
        expect(screen.getByText('A membership request needs review.')).toBeTruthy();
        expect(screen.getByText('Waiting Player')).toBeTruthy();
    });

    it('leaves a club only after confirmation in the shared dialog', async () => {
        const refreshClubs = vi.fn().mockResolvedValue(null);
        clubApi.leave.mockResolvedValue({});
        renderLayout({ role: 'member', refreshClubs });

        fireEvent.click(screen.getByRole('button', { name: /Club Owner/ }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Leave active club' }));
        const dialog = screen.getByRole('dialog', { name: 'Leave Downtown Chess?' });
        expect(clubApi.leave).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Leave club' }));
        await waitFor(() => expect(clubApi.leave).toHaveBeenCalledWith('club_1'));
    });
});
