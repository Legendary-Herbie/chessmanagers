import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import EditPlayerForm from './EditPlayerForm.jsx';
import { playerApi } from '../api/playerApi.js';
vi.mock('../api/playerApi.js', () => ({ playerApi: { updatePlayer: vi.fn(), updateOwnProfile: vi.fn(), uploadPhoto: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('keeps a locked name read-only and allows linked profile links', async () => {
    playerApi.updateOwnProfile.mockResolvedValue({});
    render(<EditPlayerForm isOpen clubId="club_1" player={{ id: 'p_1', name: 'Alex', name_locked: true }} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Official player name *').disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '+ Add Chess.com account' }));
    fireEvent.change(screen.getByLabelText(/Chess.com username/), { target: { value: 'alex_chess' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(playerApi.updateOwnProfile).toHaveBeenCalledWith('club_1', 'p_1', expect.objectContaining({ chesscomUsername: 'alex_chess' })));
    expect(playerApi.updateOwnProfile.mock.calls[0][2]).not.toHaveProperty('name');
    expect(screen.queryByLabelText('Lock name to owner edits')).toBeNull();
});

it('lets an owner change the name and set the lock together', async () => {
    playerApi.updatePlayer.mockResolvedValue({});
    render(<EditPlayerForm isOpen isAdmin isOwner clubId="club_1" player={{ id: 'p_1', name: 'Alex' }} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Official player name *'), { target: { value: 'Alex Morgan' } });
    fireEvent.click(screen.getByLabelText('Lock name to owner edits'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(playerApi.updatePlayer).toHaveBeenCalledWith('club_1', 'p_1', expect.objectContaining({ name: 'Alex Morgan', nameLocked: true })));
});
