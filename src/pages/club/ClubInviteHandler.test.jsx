import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
    AuthContext,
    ClubContext,
    NotificationsContext,
} from '../../app/contextHooks.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';
import ClubInviteHandler from './ClubInviteHandler.jsx';

vi.mock('../../features/clubs/api/clubApi.js', () => ({
    clubApi: {
        acceptInvite: vi.fn(),
        joinByCode: vi.fn(),
    },
}));

describe('ClubInviteHandler', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('continues a signed-in six-digit join-code flow and activates the club', async () => {
        const refreshClubs = vi.fn().mockResolvedValue('club_1');
        const notify = vi.fn();
        clubApi.joinByCode.mockResolvedValue({ clubId: 'club_1' });

        render(
            <AuthContext.Provider value={{ user: { id: 'user_1' } }}>
                <ClubContext.Provider value={{ refreshClubs }}>
                    <NotificationsContext.Provider value={{ notify }}>
                        <MemoryRouter initialEntries={['/clubs/join?code=123456']}>
                            <Routes>
                                <Route path="/clubs/join" element={<ClubInviteHandler />} />
                                <Route path="/dashboard" element={<div>Active club dashboard</div>} />
                            </Routes>
                        </MemoryRouter>
                    </NotificationsContext.Provider>
                </ClubContext.Provider>
            </AuthContext.Provider>
        );

        await waitFor(() => expect(clubApi.joinByCode).toHaveBeenCalledWith('123456'));
        await waitFor(() => expect(refreshClubs).toHaveBeenCalledWith('club_1'));
        expect(await screen.findByText('Active club dashboard')).toBeTruthy();
        expect(notify).toHaveBeenCalledWith('You have joined the club.', 'success');
    });
});
