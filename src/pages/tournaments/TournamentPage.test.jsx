import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubContext } from '../../app/contextHooks.js';
import { tournamentApi } from '../../features/tournaments/api/tournamentApi.js';
import { playerApi } from '../../features/players/api/playerApi.js';
import TournamentPage from './TournamentPage.jsx';

vi.mock('../../features/tournaments/api/tournamentApi.js', () => ({
    tournamentApi: { get: vi.fn(), recordResult: vi.fn(), setStatus: vi.fn(), archive: vi.fn() },
}));
vi.mock('../../features/players/api/playerApi.js', () => ({
    playerApi: { fetchPlayers: vi.fn() },
}));

const detail = {
    tournament: {
        id: 'tour_1', name: 'Club Swiss', type: 'swiss', status: 'active',
        rating_category: 'rapid', is_rated: true, current_round: 1,
    },
    participants: [
        { id: 'player_1', name: 'Alpha', rating: 1500, registrationRound: 1, status: 'active', byeCount: 0 },
        { id: 'player_2', name: 'Beta', rating: 1500, registrationRound: 1, status: 'active', byeCount: 0 },
    ],
    standings: [],
    rounds: [{ id: 'round_1',
        roundNumber: 1, status: 'active', pairings: [{
            id: 'pairing_1', board: 1, whitePlayerId: 'player_1', whitePlayerName: 'Alpha',
            blackPlayerId: 'player_2', blackPlayerName: 'Beta', status: 'pending', result: null, isBye: false,
        }],
    }],
};

function renderPage(canManageMatches = true) {
    return render(<MemoryRouter initialEntries={['/tournaments/tour_1']}>
        <ClubContext.Provider value={{
            club: { id: 'club_1' }, capabilities: { canManageMatches },
        }}><Routes><Route path="/tournaments/:tournamentId" element={<TournamentPage />} /></Routes>
        </ClubContext.Provider>
    </MemoryRouter>);
}

describe('TournamentPage duplicate result protection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tournamentApi.get.mockResolvedValue(detail);
        playerApi.fetchPlayers.mockResolvedValue(detail.participants);
    });
    afterEach(cleanup);

    it('announces a load failure and allows retry', async () => {
        tournamentApi.get.mockRejectedValueOnce(new Error('Offline'));
        renderPage();
        expect((await screen.findByRole('alert')).textContent).toBe('Offline');
        expect(screen.getByRole('button', { name: 'Back to tournaments' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByRole('heading', { name: 'Club Swiss' })).toBeTruthy();
    });

    it.each([['1–0', 'white'], ['½–½', 'draw'], ['0–1', 'black']])('records %s inline without a result modal', async (label, result) => {
        tournamentApi.recordResult.mockResolvedValue({ ratingStatus: 'complete' });
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: label }));
        await waitFor(() => expect(tournamentApi.recordResult).toHaveBeenCalledWith('club_1', 'tour_1', 'pairing_1', expect.objectContaining({ result, confirmDuplicate: false })));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('preserves the exact original timestamp and notes when correcting a score', async () => {
        tournamentApi.get.mockResolvedValue({ ...detail, rounds: [{ ...detail.rounds[0], pairings: [{
            ...detail.rounds[0].pairings[0], result: 'white', status: 'completed',
            playedAt: '2026-09-01T10:13:37.789Z', notes: 'Original notes',
        }] }] });
        tournamentApi.recordResult.mockResolvedValue({ ratingStatus: 'recalculation_pending' });
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: '0–1' }));
        await waitFor(() => expect(tournamentApi.recordResult).toHaveBeenCalledWith('club_1', 'tour_1', 'pairing_1', {
            result: 'black', playedAt: '2026-09-01T10:13:37.789Z', notes: 'Original notes', confirmDuplicate: false,
        }));
    });

    it('does not offer result entry to members or for byes', async () => {
        const member = renderPage(false);
        await screen.findByRole('heading', { name: 'Club Swiss' });
        expect(screen.queryByRole('button', { name: '1–0' })).toBeNull();
        member.unmount();
        tournamentApi.get.mockResolvedValue({ ...detail, rounds: [{ ...detail.rounds[0], pairings: [{ ...detail.rounds[0].pairings[0], isBye: true }] }] });
        renderPage();
        await screen.findByRole('heading', { name: 'Club Swiss' });
        expect(screen.queryByRole('button', { name: '1–0' })).toBeNull();
    });

    it('does not retry a possible duplicate until the admin confirms', async () => {
        tournamentApi.recordResult
            .mockRejectedValueOnce({ code: 'POSSIBLE_DUPLICATE_MATCH' })
            .mockResolvedValueOnce({ ratingStatus: 'complete' });
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: '1–0' }));
        expect((await screen.findByRole('alert')).textContent).toContain('matching result');
        expect(tournamentApi.recordResult).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
        await waitFor(() => expect(tournamentApi.recordResult).toHaveBeenCalledTimes(2));
        expect(tournamentApi.recordResult.mock.calls[1][3]).toMatchObject({ confirmDuplicate: true });
    });

    it('keeps inline controls and makes no retry when the warning is cancelled', async () => {
        tournamentApi.recordResult.mockRejectedValueOnce({ code: 'POSSIBLE_DUPLICATE_MATCH' });
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: '1–0' }));
        const duplicateDialog = await screen.findByRole('alert');
        fireEvent.click(within(duplicateDialog).getByRole('button', { name: 'Cancel' }));
        expect(tournamentApi.recordResult).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: '1–0' }).disabled).toBe(false);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('archives only after confirmation in the shared dialog', async () => {
        tournamentApi.archive.mockResolvedValue({});
        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
        const dialog = screen.getByRole('dialog', { name: 'Archive tournament?' });
        expect(tournamentApi.archive).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Archive tournament' }));
        await waitFor(() => expect(tournamentApi.archive).toHaveBeenCalledWith('club_1', 'tour_1'));
    });

    it('lets an admin confirm resuming a completed tournament', async () => {
        tournamentApi.get.mockResolvedValue({
            ...detail,
            tournament: { ...detail.tournament, status: 'completed' },
        });
        tournamentApi.setStatus.mockResolvedValue({});
        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: 'Resume tournament' }));
        const dialog = screen.getByRole('dialog', { name: 'Resume tournament?' });
        expect(tournamentApi.setStatus).not.toHaveBeenCalled();
        expect(within(dialog).getByText(/Existing rounds, results, standings, and linked matches will be preserved/)).toBeTruthy();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Resume tournament' }));
        await waitFor(() => expect(tournamentApi.setStatus).toHaveBeenCalledWith(
            'club_1', 'tour_1', 'active'
        ));
        expect((await screen.findByRole('status')).textContent).toContain('Tournament resumed');
    });
});
