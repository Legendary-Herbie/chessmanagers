import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubContext } from '../../app/contextHooks.js';
import { api } from '../../config/api.js';
import { matchApi } from '../../features/matches/api/matchApi.js';
import MatchesPage from './MatchesPage.jsx';

vi.mock('../../config/api.js', async importOriginal => {
    const original = await importOriginal();
    return { ...original, api: { get: vi.fn() } };
});

vi.mock('../../features/matches/api/matchApi.js', () => ({
    matchApi: {
        list: vi.fn(), create: vi.fn(), update: vi.fn(), void: vi.fn(), delete: vi.fn(),
    },
}));

const players = [
    { id: 'player_white', name: 'White Player' },
    { id: 'player_black', name: 'Black Player' },
];

function renderPage() {
    api.get.mockImplementation(endpoint => {
        if (endpoint.includes('/players?')) return Promise.resolve({ players });
        if (endpoint.includes('/tournaments?')) return Promise.resolve({ tournaments: [] });
        return Promise.reject(new Error('Unexpected endpoint'));
    });
    return render(
        <ClubContext.Provider value={{
            club: { id: 'club_1' },
            capabilities: { canManageMatches: true },
        }}>
            <MatchesPage />
        </ClubContext.Provider>
    );
}

describe('MatchesPage canonical match flows', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        matchApi.list.mockResolvedValue([]);
    });
    afterEach(cleanup);

    it('shows explicit chronology, category, and rated controls', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Add Match' }));

        expect(screen.getByLabelText('Played at').value).toBeTruthy();
        expect(screen.getByLabelText('Rated match').checked).toBe(true);
        expect(screen.getByRole('group', { name: 'Rating category' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Blitz' }).className).toContain('active');
    });

    it('uses the duplicate confirmation response to retry with confirmation', async () => {
        matchApi.create
            .mockRejectedValueOnce({
                code: 'POSSIBLE_DUPLICATE_MATCH',
                message: 'A possible duplicate match was found.',
            })
            .mockResolvedValueOnce({ ratingStatus: 'unrated', match: { id: 'match_2' } });
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Add Match' }));
        fireEvent.change(screen.getByLabelText('White'), { target: { value: 'player_white' } });
        fireEvent.change(screen.getByLabelText('Black'), { target: { value: 'player_black' } });
        fireEvent.click(screen.getByLabelText('Rated match'));
        fireEvent.click(screen.getByRole('button', { name: 'Create match' }));

        expect(await screen.findByRole('dialog', { name: 'Possible duplicate match' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
        await waitFor(() => expect(matchApi.create).toHaveBeenCalledTimes(2));
        expect(matchApi.create.mock.calls[1][1]).toMatchObject({
            whitePlayerId: 'player_white',
            blackPlayerId: 'player_black',
            isRated: false,
            confirmDuplicate: true,
        });
    });
});
