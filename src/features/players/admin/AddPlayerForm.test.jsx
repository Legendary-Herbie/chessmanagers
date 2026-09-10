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

    it('prefills and submits the club defaults for every rating category', async () => {
        render(
            <AddPlayerForm
                isInline
                clubId="club_1"
                ratingSettings={{
                    blitz: { initialRating: 1550 },
                    rapid: { initialRating: 1650 },
                    classical: { initialRating: 1750 },
                }}
            />
        );

        fireEvent.change(screen.getByLabelText('Player Full Name *'), {
            target: { value: 'Configured Player' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add Player' }));

        await waitFor(() => expect(playerApi.createPlayer).toHaveBeenCalledWith('club_1', {
            name: 'Configured Player',
            startRatings: { blitz: 1550, rapid: 1650, classical: 1750 },
            bio: undefined,
        }));
    });

    it('preserves independent starting rating overrides', async () => {
        render(<AddPlayerForm isInline clubId="club_1" />);

        fireEvent.change(screen.getByLabelText('Player Full Name *'), {
            target: { value: 'Rated Player' },
        });
        fireEvent.change(screen.getByLabelText('Blitz'), {
            target: { value: '1725' },
        });
        fireEvent.change(screen.getByLabelText('Rapid'), {
            target: { value: '1825' },
        });
        fireEvent.change(screen.getByLabelText('Classical'), {
            target: { value: '1925' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add Player' }));

        await waitFor(() => expect(playerApi.createPlayer).toHaveBeenCalledWith('club_1', {
            name: 'Rated Player',
            startRatings: { blitz: 1725, rapid: 1825, classical: 1925 },
            bio: undefined,
        }));
    });

    it('parses the category-aware bulk format and keeps the legacy format compatible', async () => {
        playerApi.createPlayersBulk.mockResolvedValue([{ id: 'player_1' }, { id: 'player_2' }]);
        render(<AddPlayerForm isInline clubId="club_1" />);

        fireEvent.click(screen.getByRole('button', { name: 'Bulk roster entry' }));
        fireEvent.change(screen.getByLabelText('Paste Player Names (One per line)'), {
            target: { value: 'Category Player, 1600, 1700, 1800, Notes\nLegacy Player, 1500, Legacy notes' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add 2 Player(s)' }));

        await waitFor(() => expect(playerApi.createPlayersBulk).toHaveBeenCalledWith('club_1', [
            {
                name: 'Category Player',
                startRatings: { blitz: 1600, rapid: 1700, classical: 1800 },
                bio: 'Notes',
            },
            {
                name: 'Legacy Player',
                startRatings: { blitz: 1500, rapid: 1500, classical: 1500 },
                bio: 'Legacy notes',
            },
        ]));
    });

    it('locks background scrolling while the player modal is open and closes with Escape', () => {
        const onClose = vi.fn();
        document.body.style.overflow = 'auto';
        const { unmount } = render(<AddPlayerForm isOpen clubId="club_1" onClose={onClose} />);
        expect(screen.getByRole('dialog', { name: 'Add players' })).toBeTruthy();
        expect(document.body.style.overflow).toBe('hidden');
        fireEvent.keyDown(screen.getByRole('dialog', { name: 'Add players' }), { key: 'Escape' });
        expect(onClose).toHaveBeenCalledOnce();
        unmount();
        expect(document.body.style.overflow).toBe('auto');
        document.body.style.overflow = '';
    });
});
