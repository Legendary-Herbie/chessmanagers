import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playerApi } from '../api/playerApi.js';
import PlayerSearchSelect from './PlayerSearchSelect.jsx';

vi.mock('../api/playerApi.js', () => ({
    playerApi: { searchPlayers: vi.fn(), createPlayer: vi.fn() },
}));

describe('PlayerSearchSelect', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playerApi.searchPlayers.mockResolvedValue({
            players: [{ id: 'player_remote', name: 'Remote Roster Player' }],
            total: 1,
        });
    });
    afterEach(cleanup);

    it('creates and selects a missing player with club defaults, retaining the name after failure', async () => {
        playerApi.searchPlayers.mockResolvedValue({ players: [], total: 0 });
        playerApi.createPlayer.mockRejectedValueOnce(new Error('Connection interrupted'))
            .mockResolvedValueOnce({ id: 'new_player', name: 'Newcomer' });
        const onChange = vi.fn();
        render(<PlayerSearchSelect clubId="club_1" label="White" value="" onChange={onChange} allowCreate />);
        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: ' Newcomer ' } });
        fireEvent.click(await screen.findByRole('option', { name: /Add “Newcomer”/ }));
        expect((await screen.findByRole('alert')).textContent).toContain('Connection interrupted');
        expect(input.value).toBe(' Newcomer ');
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(onChange).toHaveBeenCalledWith('new_player'));
        expect(playerApi.createPlayer).toHaveBeenLastCalledWith('club_1', { name: 'Newcomer' });
        expect(input.value).toBe('Newcomer');
    });

    it('does not offer creation without permission or for an exact existing name', async () => {
        const view = render(<PlayerSearchSelect clubId="club_1" label="Player" value="" onChange={vi.fn()} />);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Remote Roster Player' } });
        await screen.findByRole('option', { name: 'Remote Roster Player' });
        expect(screen.queryByRole('option', { name: /Add/ })).toBeNull();
        view.rerender(<PlayerSearchSelect clubId="club_1" label="Player" value="" onChange={vi.fn()} allowCreate />);
        expect(screen.queryByRole('option', { name: /Add/ })).toBeNull();
        expect(playerApi.createPlayer).not.toHaveBeenCalled();
    });

    it('searches the server and supports keyboard selection without loading the full roster', async () => {
        const onChange = vi.fn();
        render(<PlayerSearchSelect clubId="club_1" label="White" value="" onChange={onChange} />);

        const input = screen.getByRole('combobox', { name: 'White' });
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'Remote' } });

        expect(await screen.findByRole('option', { name: 'Remote Roster Player' })).toBeTruthy();
        expect(playerApi.searchPlayers).toHaveBeenCalledWith('club_1', expect.objectContaining({
            q: 'Remote',
            limit: 20,
        }));

        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(onChange).toHaveBeenCalledWith('player_remote'));
        expect(input.value).toBe('Remote Roster Player');
        expect(input.getAttribute('aria-expanded')).toBe('false');
    });
    it('shows pending search during debounce and ignores an obsolete response', async () => {
        vi.useFakeTimers();
        try {
            let resolveOld;
            playerApi.searchPlayers.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
            render(<PlayerSearchSelect clubId="club_1" label="Player" value="" onChange={vi.fn()} />);
            const input = screen.getByRole('combobox');
            fireEvent.focus(input);
            expect(screen.getByText('Searching…')).toBeTruthy();
            expect(screen.queryByText('No players found.')).toBeNull();
            await act(async () => { await vi.advanceTimersByTimeAsync(250); });
            fireEvent.change(input, { target: { value: 'Remote' } });
            await act(async () => resolveOld({ players: [{ id: 'old', name: 'Obsolete player' }] }));
            expect(screen.queryByRole('option')).toBeNull();
            await act(async () => { await vi.advanceTimersByTimeAsync(250); });
            expect(screen.getByRole('option', { name: 'Remote Roster Player' })).toBeTruthy();
        } finally { cleanup(); vi.useRealTimers(); }
    });

});
