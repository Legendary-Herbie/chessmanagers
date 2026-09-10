import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import TournamentSetup from './TournamentSetup.jsx';
import { playerApi } from '../../players/api/playerApi.js';
import { tournamentApi } from '../api/tournamentApi.js';
vi.mock('../../players/api/playerApi.js', () => ({ playerApi: { searchPlayers: vi.fn() } }));
vi.mock('../api/tournamentApi.js', () => ({ tournamentApi: { setup: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('selects the whole roster across pages and filters names without more requests', async () => {
    playerApi.searchPlayers.mockResolvedValueOnce({ players: [{ id: 'a', name: 'Alpha' }], total: 2 })
        .mockResolvedValueOnce({ players: [{ id: 'b', name: 'Beta' }], total: 2 });
    render(<TournamentSetup clubId="c" tournamentId="t" participants={[]} onComplete={vi.fn()} onSaveLater={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Select all 2 active players' }));
    expect(screen.getByLabelText('Alpha').checked).toBe(true);
    expect(screen.getByLabelText('Beta').checked).toBe(true);
    fireEvent.change(screen.getByLabelText('Find club players'), { target: { value: 'aph' } });
    expect(screen.getByLabelText('Alpha')).toBeTruthy();
    expect(screen.queryByLabelText('Beta')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove Beta from selection' })).toBeTruthy();
    expect(playerApi.searchPlayers).toHaveBeenCalledTimes(2);
});
it('reviews multiple selections, preserves them after failure, and starts in one request', async () => {
    playerApi.searchPlayers.mockResolvedValue({ players: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }], total: 2 });
    tournamentApi.setup.mockRejectedValueOnce(new Error('Please retry')).mockResolvedValueOnce({ ok: true });
    const done = vi.fn();
    render(<TournamentSetup clubId="c" tournamentId="t" participants={[]} onComplete={done} onSaveLater={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText('Alpha'));
    fireEvent.click(screen.getByLabelText('Beta'));
    fireEvent.click(screen.getByRole('button', { name: 'Start and pair round 1' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Please retry');
    expect(screen.getByLabelText('Alpha').checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Start and pair round 1' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(tournamentApi.setup).toHaveBeenLastCalledWith('c', 't', { playerIds: ['a', 'b'], start: true });
});
