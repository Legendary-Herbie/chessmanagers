import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
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

async function selectPlayer(label, name) {
    vi.useFakeTimers();
    try {
        fireEvent.focus(screen.getByLabelText(label));
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    } finally {
        vi.useRealTimers();
    }
    fireEvent.click(screen.getByRole('option', { name: new RegExp(name) }));
}

describe('MatchesPage canonical match flows', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        matchApi.list.mockResolvedValue({ matches: [], total: 0, limit: 25, offset: 0 });
    });
    afterEach(cleanup);

    it('shows useful next steps instead of rendering a broken match workspace without a club', () => {
        render(<MemoryRouter><ClubContext.Provider value={{
            club: null, capabilities: { canManageMatches: false },
        }}><MatchesPage /></ClubContext.Provider></MemoryRouter>);
        expect(screen.getByRole('heading', { name: 'Keep every result in one reliable history' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Create a club' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Find a club' })).toBeTruthy();
    });

    it('shows explicit chronology, category, and rated controls', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Add Match' }));

        expect(screen.getByLabelText('Played at').value).toBeTruthy();
        expect(screen.getByLabelText('Rated match').checked).toBe(true);
        expect(screen.getByRole('group', { name: 'Rating category' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Blitz' }).className).toContain('active');
    });

    it('keeps the match form dismissible and restores page scrolling', async () => {
        renderPage();
        const opener = await screen.findByRole('button', { name: 'Add Match' });
        opener.focus();
        fireEvent.click(opener);

        expect(screen.getByRole('dialog', { name: 'Add Match' })).toBeTruthy();
        expect(document.body.style.overflow).toBe('hidden');

        fireEvent.keyDown(screen.getByRole('dialog', { name: 'Add Match' }), { key: 'Escape' });

        expect(screen.queryByRole('dialog', { name: 'Add Match' })).toBeNull();
        expect(document.body.style.overflow).toBe('');
        expect(document.activeElement).toBe(opener);
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
        await selectPlayer('White', 'White Player');
        await selectPlayer('Black', 'Black Player');
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

    it('sends category, rated, date, sort, and pagination controls to the server', async () => {
        matchApi.list.mockResolvedValue({ matches: [], total: 60, limit: 25, offset: 0 });
        renderPage();
        await waitFor(() => expect(matchApi.list).toHaveBeenCalled());
        fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));

        fireEvent.change(screen.getByLabelText('Filter by rating category'), { target: { value: 'rapid' } });
        fireEvent.change(screen.getByLabelText('Filter by rated status'), { target: { value: 'rated' } });
        fireEvent.change(screen.getByText('From').parentElement.querySelector('input'), { target: { value: '2026-08-01' } });
        fireEvent.change(screen.getByText('To').parentElement.querySelector('input'), { target: { value: '2026-08-31' } });
        fireEvent.change(screen.getByLabelText('Sort matches'), { target: { value: 'playedAt-asc' } });
        await selectPlayer('Filter by player', 'White Player');

        await waitFor(() => expect(matchApi.list).toHaveBeenCalledWith('club_1', expect.objectContaining({
            playerId: 'player_white',
            ratingCategory: 'rapid',
            isRated: true,
            playedFrom: expect.stringContaining('2026-08-01'),
            playedTo: expect.stringContaining('2026-08-31'),
            sortBy: 'playedAt',
            sortDirection: 'asc',
            limit: 25,
            offset: 0,
        })));

        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await waitFor(() => expect(matchApi.list).toHaveBeenCalledWith('club_1', expect.objectContaining({ offset: 25 })));
    });
    it('keeps search visible and retries a failed list request', async () => {
        matchApi.list.mockRejectedValueOnce(new Error('Connection lost'));
        renderPage();
        expect(screen.getByRole('textbox', { name: 'Search matches' })).toBeTruthy();
        expect((await screen.findByRole('alert')).textContent).toContain('Connection lost');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
        expect(matchApi.list).toHaveBeenCalledTimes(2);
    });

});
