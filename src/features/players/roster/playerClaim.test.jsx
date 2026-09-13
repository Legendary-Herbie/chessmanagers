import React from 'react';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import PlayerCard from '../components/PlayerCard.jsx';
import PlayerTable from './PlayerTable.jsx';

afterEach(cleanup);
const player = { id: 'player_1', name: 'Ada', link_status: null };
it.each(['owner', 'admin', 'member'])('allows an unlinked %s to claim from cards and tables', role => {
    const onClaim = vi.fn();
    const props = { currentUser: { id: 'user_1', role }, isAdmin: role !== 'member', onClaim };
    render(<MemoryRouter><PlayerCard player={player} {...props} /><PlayerTable players={[player]} {...props} /></MemoryRouter>);
    const buttons = screen.getAllByRole('button', { name: 'Claim' });
    expect(buttons).toHaveLength(2);
    buttons.forEach(button => fireEvent.click(button));
    expect(onClaim).toHaveBeenCalledTimes(2);
    expect(onClaim).toHaveBeenCalledWith(player);
});
it.each(['pending', 'approved'])('still hides claim for a %s player', link_status => {
    render(<MemoryRouter><PlayerCard player={{ ...player, link_status }} currentUser={{ id: 'admin' }} isAdmin /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Claim' })).toBeNull();
});
it('still hides claim when the owner already has a linked player', () => {
    render(<MemoryRouter><PlayerCard player={player} currentUser={{ id: 'owner' }} isAdmin currentLinkedPlayerId="other_player" /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Claim' })).toBeNull();
});
