import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ClubContext, ThemeContext } from '../../app/contextHooks.js';
import CommandPalette from './CommandPalette.jsx';
import { playerApi } from '../../features/players/api/playerApi.js';
vi.mock('../../features/players/api/playerApi.js', () => ({ playerApi:{ searchPlayers:vi.fn().mockResolvedValue({ players:[{ id:'p1', name:'Ada' }] }) } }));
vi.mock('../../features/tournaments/api/tournamentApi.js', () => ({ tournamentApi:{ list:vi.fn().mockResolvedValue({ tournaments:[] }) } }));
vi.mock('../../features/announcements/api/announcementApi.js', () => ({ announcementApi:{ list:vi.fn().mockResolvedValue({ announcements:[] }) } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function renderPalette() { return render(<MemoryRouter><ClubContext.Provider value={{ club:{ id:'club1', name:'Club' }, capabilities:{} }}><ThemeContext.Provider value={{ toggleTheme:vi.fn() }}><CommandPalette /><Routes><Route path="/players/p1" element={<p>Player profile destination</p>} /></Routes></ThemeContext.Provider></ClubContext.Provider></MemoryRouter>); }
it('opens with Ctrl+K, searches within the club, and navigates using Enter', async () => {
    renderPalette(); fireEvent.keyDown(window,{ key:'k',ctrlKey:true });
    const input = screen.getByRole('combobox'); fireEvent.change(input,{ target:{ value:'Ada' } });
    await screen.findByRole('option',{ name:'Ada Player' });
    expect(playerApi.searchPlayers).toHaveBeenLastCalledWith('club1',{ q:'Ada',limit:8 });
    expect(screen.queryByRole('option',{ name:'Record match Action' })).toBeNull();
    fireEvent.keyDown(input,{ key:'Enter' });
    expect(await screen.findByText('Player profile destination')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
});
it('restores focus when Escape closes the palette', async () => {
    renderPalette(); const button = screen.getByRole('button',{ name:/Quick search/ }); button.focus(); fireEvent.click(button);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('combobox')));
    fireEvent.keyDown(screen.getByRole('combobox'),{ key:'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(button);
});
