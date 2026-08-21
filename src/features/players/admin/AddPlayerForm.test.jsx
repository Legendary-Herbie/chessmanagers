import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AddPlayerForm from './AddPlayerForm.jsx';
import { playerApi } from '../api/playerApi.js';

vi.mock('../api/playerApi.js', () => ({
    playerApi: {
        createPlayer: vi.fn(),
        createPlayersBulk: vi.fn(),
    },
}));

describe('AddPlayerForm rating defaults', () => {
    afterEach(cleanup);

    beforeEach(() => {
        vi.clearAllMocks();
        playerApi.createPlayer.mockResolvedValue({ id: 'player_1' });
    });

    it('omits a blank rating so the server can apply the club category settings', async () => {
        render(<AddPlayerForm isInline clubId="club_1" />);

        fireEvent.change(screen.getByLabelText('Player Full Name *'), {
            target: { value: 'Configured Player' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add Player' }));

        await waitFor(() => expect(playerApi.createPlayer).toHaveBeenCalledWith('club_1', {
            name: 'Configured Player',
            bio: undefined,
        }));
    });

    it('preserves an explicit initial rating override', async () => {
        render(<AddPlayerForm isInline clubId="club_1" />);

        fireEvent.change(screen.getByLabelText('Player Full Name *'), {
            target: { value: 'Rated Player' },
        });
        fireEvent.change(screen.getByLabelText('Initial ELO Rating'), {
            target: { value: '1725' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add Player' }));

        await waitFor(() => expect(playerApi.createPlayer).toHaveBeenCalledWith('club_1', {
            name: 'Rated Player',
            rating: 1725,
            bio: undefined,
        }));
    });
});
