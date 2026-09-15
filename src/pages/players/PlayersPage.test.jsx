import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, ClubContext, NotificationsContext } from '../../app/contextHooks.js';
import { playerApi } from '../../features/players/api/playerApi.js';
import PlayersPage from './PlayersPage.jsx';
vi.mock('../../features/players/api/playerApi.js', () => ({ playerApi: { fetchPlayers: vi.fn(), searchPlayers: vi.fn(), fetchRosterSummary: vi.fn(), fetchPendingLinks: vi.fn(), claimPlayer: vi.fn(), fetchInactivePlayers: vi.fn().mockResolvedValue([]) } }));
beforeEach(() => {
    vi.clearAllMocks();
    playerApi.searchPlayers.mockImplementation(async (_club, { q, status }) => {
        let rows = await playerApi.fetchPlayers();
        if (q) rows = rows.filter(p => p.name.includes(q));
        if (status === 'unlinked') rows = rows.filter(p => !p.link_status);
        return { players: rows, total: rows.length };
    });
    playerApi.fetchRegistrations = vi.fn().mockResolvedValue([]);
});
afterEach(cleanup);
it('places ordinary claim approvals before the roster and reports immediate admin approval', async () => {
    playerApi.fetchPlayers.mockReset().mockResolvedValue([{ id: 'a', name: 'Ada' }]);
    playerApi.fetchRosterSummary.mockResolvedValue({ totalPlayers: 1, activePlayers: 0, averageRatings: {} });
    playerApi.fetchPendingLinks.mockResolvedValue([{ id: 'link_1', player_name: 'Beth', user_email: 'member@example.test' }]);
    playerApi.claimPlayer.mockResolvedValue({ status: 'approved' });
    const notify = vi.fn();
    const refreshClub = vi.fn().mockResolvedValue();
    render(<MemoryRouter><AuthContext.Provider value={{ user: { id: 'owner' } }}><ClubContext.Provider value={{ club: { id: 'c', name: 'Club' }, capabilities: { canManagePlayers: true }, refreshClub }}><NotificationsContext.Provider value={{ notify }}><PlayersPage /></NotificationsContext.Provider></ClubContext.Provider></AuthContext.Provider></MemoryRouter>);
    const panel = await screen.findByText('Pending Account Claim Requests');
    const search = screen.getByRole('textbox', { name: 'Search players' });
    expect(panel.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Claim' }));
    expect(screen.getByText(/Your club role allows immediate approval/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(refreshClub).toHaveBeenCalledOnce());
    expect(notify).toHaveBeenCalledWith('Player profile linked. Your claim was automatically approved.', 'success');
});
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
    await waitFor(() => expect(screen.queryByText('Beth')).toBeNull());
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by link status' }), { target: { value: 'unlinked' } });
    expect(await screen.findByText('No Players Found')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Beth')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Claim' })).toBeTruthy();
});
