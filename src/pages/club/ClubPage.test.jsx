import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, ClubContext, NotificationsContext } from '../../app/contextHooks.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';
import ClubPage from './ClubPage.jsx';

vi.mock('../../features/clubs/api/clubApi.js', () => ({
    clubApi: {
        fetchMembers: vi.fn(),
        fetchInvites: vi.fn(),
        getJoinCode: vi.fn(),
        update: vi.fn(),
        updatePresentation: vi.fn(),
        uploadBadge: vi.fn(),
    },
}));

const ratingSettings = Object.fromEntries(['blitz', 'rapid', 'classical'].map(category => [category, {
    initialRating: 1500,
    ratingFloor: 500,
    establishedKFactor: 32,
    provisionalKFactor: 40,
    provisionalGames: 10,
}]));

const club = {
    id: 'club_1',
    name: 'City Chess Club',
    federation: 'USCF',
    description: '',
    contact_info: '',
    visibility: 'public',
    public_leaderboard: true,
    settings_json: {
        contacts: {},
        presentation: { primaryColor: '#2563eb' },
        notifications: {},
    },
    rating_settings: ratingSettings,
};

function renderPage({ refreshClub = vi.fn() } = {}) {
    const notify = vi.fn();
    render(
        <AuthContext.Provider value={{ user: { id: 'owner_1' } }}>
            <ClubContext.Provider value={{
                club,
                capabilities: {
                    canManageMemberships: true,
                    canManageClubSettings: true,
                    canExportData: true,
                },
                refreshClub,
            }}>
                <NotificationsContext.Provider value={{ notify }}>
                    <MemoryRouter initialEntries={['/club?tab=profile']}>
                        <ClubPage />
                    </MemoryRouter>
                </NotificationsContext.Provider>
            </ClubContext.Provider>
        </AuthContext.Provider>,
    );
    return { notify, refreshClub };
}

describe('ClubPage profile validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clubApi.fetchMembers.mockResolvedValue([]);
        clubApi.fetchInvites.mockResolvedValue([]);
        clubApi.getJoinCode.mockResolvedValue({ joinCode: { active: false } });
        clubApi.update.mockResolvedValue({ club });
    });
    afterEach(cleanup);

    it('blocks submission and identifies the malformed field', async () => {
        renderPage();
        fireEvent.change(screen.getByLabelText('Website'), { target: { value: 'club.example.test' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByText(/complete website address beginning with http/i)).toBeTruthy();
        expect(screen.getByLabelText('Website').getAttribute('aria-invalid')).toBe('true');
        expect(clubApi.update).not.toHaveBeenCalled();
    });

    it('trims valid profile values before sending them to the owner endpoint', async () => {
        const { notify, refreshClub } = renderPage();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Renamed Chess Club  ' } });
        fireEvent.change(screen.getByLabelText('Website'), { target: { value: ' https://club.example.test ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(clubApi.update).toHaveBeenCalledWith('club_1', expect.objectContaining({
            name: 'Renamed Chess Club',
            settings: expect.objectContaining({
                contacts: expect.objectContaining({ website: 'https://club.example.test' }),
            }),
        })));
        expect(refreshClub).toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith('Club profile saved.', 'success');
    });
});
