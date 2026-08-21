import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, useClub } from './contextHooks.js';
import { ClubProvider } from './ClubProvider.jsx';
import { clubApi } from '../features/clubs/api/clubApi.js';

vi.mock('../features/clubs/api/clubApi.js', () => ({
    clubApi: {
        fetchMemberships: vi.fn(),
        fetchContext: vi.fn(),
    },
}));

const entries = [
    {
        club: { id: 'club_a', name: 'Club A', status: 'active' },
        membership: { role: 'member', status: 'ACTIVE_MEMBER' },
    },
    {
        club: { id: 'club_b', name: 'Club B', status: 'active' },
        membership: { role: 'admin', status: 'ACTIVE_MEMBER' },
    },
];

let observedContext;

function Probe() {
    observedContext = useClub();
    return (
        <div>
            <span data-testid="club-id">{observedContext.club?.id ?? 'none'}</span>
            <span data-testid="role">{observedContext.membership?.role ?? 'none'}</span>
        </div>
    );
}

describe('ClubProvider switching', () => {
    beforeEach(() => {
        const values = new Map();
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: {
                getItem: key => values.get(key) ?? null,
                setItem: (key, value) => values.set(key, String(value)),
                removeItem: key => values.delete(key),
                clear: () => values.clear(),
            },
        });
        observedContext = null;
        vi.clearAllMocks();
    });

    it('clears the previous context while loading the newly selected club', async () => {
        let resolveClubB;
        clubApi.fetchMemberships.mockResolvedValue({ clubs: entries });
        clubApi.fetchContext.mockImplementation(clubId => {
            if (clubId === 'club_a') {
                return Promise.resolve({
                    club: { id: 'club_a', name: 'Club A' },
                    membership: { role: 'member', status: 'ACTIVE_MEMBER' },
                    linkedPlayer: { id: 'player_a' },
                    capabilities: { canManagePlayers: false },
                });
            }
            return new Promise(resolve => { resolveClubB = resolve; });
        });

        render(
            <AuthContext.Provider value={{ user: { id: 'user_1' }, loading: false }}>
                <ClubProvider><Probe /></ClubProvider>
            </AuthContext.Provider>
        );

        await waitFor(() => expect(screen.getByTestId('club-id').textContent).toBe('club_a'));

        let switchPromise;
        await act(async () => {
            switchPromise = observedContext.selectClub('club_b');
            await Promise.resolve();
        });

        expect(screen.getByTestId('club-id').textContent).toBe('none');
        expect(screen.getByTestId('role').textContent).toBe('none');
        expect(localStorage.getItem('cm_selected_club:user_1')).toBe('club_b');

        resolveClubB({
            club: { id: 'club_b', name: 'Club B' },
            membership: { role: 'admin', status: 'ACTIVE_MEMBER' },
            linkedPlayer: { id: 'player_b' },
            capabilities: { canManagePlayers: true },
        });
        await act(async () => { await switchPromise; });

        expect(screen.getByTestId('club-id').textContent).toBe('club_b');
        expect(screen.getByTestId('role').textContent).toBe('admin');
        expect(observedContext.linkedPlayer.id).toBe('player_b');
    });
});
