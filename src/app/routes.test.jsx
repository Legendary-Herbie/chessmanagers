import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, ClubContext, ThemeContext } from './contextHooks.js';
import AppRoutes from './routes.jsx';

vi.mock('../features/auth/api/authApi.js', () => ({
    authApi: {
        verifyEmail: vi.fn().mockResolvedValue({ ok: true, alreadyVerified: false, message: 'Email verified successfully' }),
    },
}));

vi.mock('../features/clubs/api/clubApi.js', () => ({
    clubApi: {
        fetchMemberships: vi.fn().mockResolvedValue([]),
        fetchContext: vi.fn().mockResolvedValue({}),
    },
}));

vi.mock('../features/notifications/api/notificationApi.js', () => ({
    notificationApi: {
        unreadCount: vi.fn().mockResolvedValue({ count: 0 }),
    },
}));

afterEach(cleanup);

const clubContext = {
    club: null,
    clubs: [],
    activeClubs: [],
    selectedClubId: null,
    membership: null,
    capabilities: { canManagePlayers: false },
    loading: false,
    selectClub: vi.fn(),
    refreshClubs: vi.fn(),
};

function TestProviders({ user, children }) {
    return <AuthContext.Provider value={{ user, loading: false, logout: vi.fn() }}>
        <ClubContext.Provider value={clubContext}>
            <ThemeContext.Provider value={{ theme: 'light', toggleTheme: vi.fn() }}>
                {children}
            </ThemeContext.Provider>
        </ClubContext.Provider>
    </AuthContext.Provider>;
}

describe('AppRoutes route guards', () => {
    it('allows guest to access /auth/verify and renders VerifyEmailView', async () => {
        render(
            <TestProviders user={null}>
                <MemoryRouter initialEntries={['/auth/verify?token=tok_guest_123']}>
                    <AppRoutes />
                </MemoryRouter>
            </TestProviders>
        );

        expect(await screen.findByText('Email verification')).toBeTruthy();
        expect(await screen.findByText('Email verified successfully')).toBeTruthy();
    });

    it('allows authenticated user to access /auth/verify without redirecting to dashboard', async () => {
        const mockUser = { id: 'user_1', email: 'user@example.com', username: 'user1' };
        render(
            <TestProviders user={mockUser}>
                <MemoryRouter initialEntries={['/auth/verify?token=tok_auth_123']}>
                    <AppRoutes />
                </MemoryRouter>
            </TestProviders>
        );

        expect(await screen.findByText('Email verification')).toBeTruthy();
        expect(await screen.findByText('Email verified successfully')).toBeTruthy();
    });

    it('redirects authenticated user accessing /auth/login to /dashboard', async () => {
        const mockUser = { id: 'user_1', email: 'user@example.com', username: 'user1' };
        render(
            <TestProviders user={mockUser}>
                <MemoryRouter initialEntries={['/auth/login']}>
                    <AppRoutes />
                </MemoryRouter>
            </TestProviders>
        );

        // Authenticated user should be on dashboard, not login
        expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull();
    });

    it('redirects guest accessing /dashboard to /auth/login', async () => {
        render(
            <TestProviders user={null}>
                <MemoryRouter initialEntries={['/dashboard']}>
                    <AppRoutes />
                </MemoryRouter>
            </TestProviders>
        );

        expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    });
});
