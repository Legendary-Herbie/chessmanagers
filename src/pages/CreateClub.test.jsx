import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, ClubContext } from '../app/contextHooks.js';
import { clubApi } from '../features/clubs/api/clubApi.js';
import CreateClub from './CreateClub.jsx';

vi.mock('../features/clubs/api/clubApi.js', () => ({
    clubApi: { create: vi.fn(), uploadBadge: vi.fn() },
}));

describe('CreateClub', () => {
    const refreshClubs = vi.fn();
    const updateSession = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        refreshClubs.mockResolvedValue('club_1');
        clubApi.create.mockResolvedValue({
            club: { id: 'club_1' }, token: 'token', user: { id: 'user_1' },
        });
    });
    afterEach(cleanup);

    it('reports partial success and continues setup when badge upload fails', async () => {
        clubApi.uploadBadge.mockRejectedValue(new Error('Upload failed'));
        render(
            <AuthContext.Provider value={{ updateSession }}>
                <ClubContext.Provider value={{ refreshClubs }}>
                    <MemoryRouter><CreateClub /></MemoryRouter>
                </ClubContext.Provider>
            </AuthContext.Provider>
        );

        expect(screen.getByLabelText('Visibility')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Name'), {
            target: { value: 'Downtown Chess' },
        });
        expect(screen.getByRole('option', { name: 'GHA' })).toBeTruthy();
        expect(screen.getByRole('option', { name: 'USA' })).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Federation'), { target: { value: 'USA' } });
        const badge = new File(['badge'], 'badge.png', { type: 'image/png' });
        fireEvent.change(screen.getByLabelText('Club badge'), { target: { files: [badge] } });
        fireEvent.click(screen.getByRole('button', { name: 'Proceed to Rating' }));
        for (const label of ['Rating system', 'Initial rating', 'K-factor', 'Rating floor', 'Provisional K-factor', 'Provisional games']) {
            expect(screen.getByLabelText(label)).toBeTruthy();
        }
        fireEvent.click(screen.getByRole('button', { name: 'Create Club' }));

        expect((await screen.findByRole('status')).textContent).toContain(
            'Club created, but the badge could not be uploaded. You can add it later.'
        );
        expect(refreshClubs).toHaveBeenCalledWith('club_1');
        await waitFor(() => expect(updateSession).toHaveBeenCalledWith('token', { id: 'user_1' }));
    });
});
