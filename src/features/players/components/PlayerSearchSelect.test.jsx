import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playerApi } from '../api/playerApi.js';
import PlayerSearchSelect from './PlayerSearchSelect.jsx';

vi.mock('../api/playerApi.js', () => ({
    playerApi: { searchPlayers: vi.fn() },
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
});
