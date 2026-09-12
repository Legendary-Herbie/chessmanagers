import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, ClubContext, NotificationsContext } from '../../app/contextHooks.js';
import { playerApi } from '../../features/players/api/playerApi.js';
import PlayersPage from './PlayersPage.jsx';
vi.mock('../../features/players/api/playerApi.js', () => ({ playerApi: { fetchPlayers: vi.fn(), fetchRosterSummary: vi.fn() } }));
afterEach(cleanup);
it('announces a failed roster load and retries without claiming the roster is empty', async () => {
    playerApi.fetchPlayers.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue([]);
    playerApi.fetchRosterSummary.mockResolvedValue({ totalPlayers: 0, activePlayers: 0, averageRatings: {} });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
        render(<MemoryRouter><AuthContext.Provider value={{ user: { id: 'u' } }}><ClubContext.Provider value={{ club: { id: 'c', name: 'Club' }, capabilities: {} }}><NotificationsContext.Provider value={{ notify: vi.fn() }}><PlayersPage /></NotificationsContext.Provider></ClubContext.Provider></AuthContext.Provider></MemoryRouter>);
        expect((await screen.findByRole('alert')).textContent).toContain('Offline');
        expect(screen.queryByText('No Players Found')).toBeNull();
        expect(screen.getByRole('textbox', { name: 'Search players' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
        expect(await screen.findByText('No Players Found')).toBeTruthy();
        expect(playerApi.fetchPlayers).toHaveBeenCalledTimes(2);
    } finally { consoleError.mockRestore(); }
});

it('shows all ratings without category selectors, filters the roster, and clears filters', async () => {
    playerApi.fetchPlayers.mockReset().mockResolvedValue([{ id: 'a', name: 'Ada', link_status: 'approved' }, { id: 'b', name: 'Beth' }]);
    playerApi.fetchRosterSummary.mockResolvedValue({ totalPlayers: 2, activePlayers: 0, averageRatings: {} });
    render(<MemoryRouter><AuthContext.Provider value={{ user: { id: 'u' } }}><ClubContext.Provider value={{ club: { id: 'c', name: 'Club' }, capabilities: {} }}><NotificationsContext.Provider value={{ notify: vi.fn() }}><PlayersPage /></NotificationsContext.Provider></ClubContext.Provider></AuthContext.Provider></MemoryRouter>);
    await screen.findByText('Ada');
    expect(screen.queryByRole('group', { name: 'Rating category' })).toBeNull();
    expect(screen.getAllByText('Blitz: —')).toHaveLength(2);
    expect(screen.getAllByText('Rapid: —')).toHaveLength(2);
    expect(screen.getAllByText('Classical: —')).toHaveLength(2);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search players' }), { target: { value: 'Ada' } });
    expect(screen.queryByText('Beth')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by link status' }), { target: { value: 'unlinked' } });
    expect(screen.getByText('No Players Found')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Beth')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Claim' })).toBeTruthy();
});
