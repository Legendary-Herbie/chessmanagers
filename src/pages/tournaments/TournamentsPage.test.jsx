import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubContext } from '../../app/contextHooks.js';
import { tournamentApi } from '../../features/tournaments/api/tournamentApi.js';
import TournamentsPage from './TournamentsPage.jsx';

vi.mock('../../features/tournaments/api/tournamentApi.js', () => ({
    tournamentApi: { list: vi.fn(), create: vi.fn() },
}));

function renderPage(canManageMatches = true) {
    return render(
        <MemoryRouter>
            <ClubContext.Provider value={{
                club: { id: 'club_1' },
                capabilities: { canManageMatches },
            }}>
                <TournamentsPage />
            </ClubContext.Provider>
        </MemoryRouter>
    );
}

describe('TournamentsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tournamentApi.list.mockResolvedValue({
            tournaments: [{
                id: 'tour_1', name: 'Club Swiss', type: 'swiss', status: 'active',
                rating_category: 'rapid', is_rated: true,
                start_date: '2026-09-01T18:00:00.000Z', current_round: 2,
            }],
        });
    });
    afterEach(cleanup);

    it('shows format, category, rating state, and admin creation controls', async () => {
        renderPage();
        expect(await screen.findByText('Club Swiss')).toBeTruthy();
        expect(screen.getByText('Rapid')).toBeTruthy();
        expect(screen.getByText('Rated')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'New tournament' }));
        expect(screen.getByLabelText('Format')).toBeTruthy();
        expect(screen.getByRole('option', { name: 'Swiss' })).toBeTruthy();
        expect(screen.getByRole('option', { name: 'Round Robin' })).toBeTruthy();
    });

    it('submits the canonical tournament fields and hides mutation controls from members', async () => {
        tournamentApi.create.mockResolvedValue({ tournament: { id: 'tour_2' } });
        const first = renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'New tournament' }));
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Winter Round Robin' } });
        fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'round_robin' } });
        fireEvent.change(screen.getByLabelText('Rating category'), { target: { value: 'classical' } });
        fireEvent.click(screen.getByLabelText('Rated tournament'));
        fireEvent.click(screen.getByRole('button', { name: 'Create tournament' }));
        await waitFor(() => expect(tournamentApi.create).toHaveBeenCalled());
        expect(tournamentApi.create.mock.calls[0][1]).toMatchObject({
            name: 'Winter Round Robin',
            type: 'round_robin',
            ratingCategory: 'classical',
            isRated: false,
        });
        first.unmount();
        renderPage(false);
        await screen.findByText('Club Swiss');
        expect(screen.queryByRole('button', { name: 'New tournament' })).toBeNull();
    });
});
