import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { playerApi } from '../api/playerApi.js';
import SelfRegistrationPanel from './SelfRegistrationPanel.jsx';

vi.mock('../api/playerApi.js', () => ({ playerApi: { fetchRegistrations: vi.fn(), registerSelf: vi.fn(), reviewRegistration: vi.fn() } }));
beforeEach(() => {
    vi.resetAllMocks();
    playerApi.fetchRegistrations.mockResolvedValue([]);
});
afterEach(cleanup);
const pending = { id: 'request_1', user_id: 'member', name: 'My Player', applicant_name: 'Member', status: 'pending' };
function show(props = {}) {
    return render(<MemoryRouter><SelfRegistrationPanel clubId="club_1" userId="member" {...props} /></MemoryRouter>);
}
it('submits only personal profile fields and shows pending state without adding a roster player', async () => {
    playerApi.registerSelf.mockResolvedValue(pending);
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Register myself' }));
    const modal = screen.getByRole('dialog');
    fireEvent.change(within(modal).getByLabelText('Your player name'), { target: { value: ' My Player ' } });
    expect(within(modal).queryByLabelText(/rating/i)).toBeNull();
    playerApi.fetchRegistrations.mockResolvedValue([pending]);
    fireEvent.click(within(modal).getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(playerApi.registerSelf).toHaveBeenCalledWith('club_1', { name: 'My Player', bio: null, federationId: null }));
    expect(await screen.findByText(/is awaiting admin approval/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Register myself' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve registration' })).toBeNull();
});
it('lets admins review with confirmation and refreshes the roster', async () => {
    playerApi.fetchRegistrations.mockResolvedValue([pending]);
    playerApi.reviewRegistration.mockResolvedValue({ ...pending, status: 'approved' });
    const onChanged = vi.fn();
    show({ userId: 'owner', linkedPlayer: { id: 'p' }, isAdmin: true, onChanged });
    fireEvent.click(await screen.findByRole('button', { name: 'Approve registration' }));
    expect(playerApi.reviewRegistration).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));
    await waitFor(() => expect(playerApi.reviewRegistration).toHaveBeenCalledWith('club_1', 'request_1', { decision: 'approved', reason: null }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
});
it('keeps resolved messages out of the panel while allowing a corrected request', async () => {
    playerApi.fetchRegistrations.mockResolvedValue([{ ...pending, status: 'rejected', review_reason: 'Use your full name.' }]);
    show();
    expect(await screen.findByRole('button', { name: 'Register myself' })).toBeTruthy();
    expect(screen.queryByText(/Use your full name/)).toBeNull();
});
it('hides the panel after approval for a linked player', async () => {
    playerApi.fetchRegistrations.mockResolvedValue([{ ...pending, status: 'approved', player_id: 'player_1' }]);
    show({ linkedPlayer: { id: 'player_1' } });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Player self-registration' })).toBeNull());
});
it('keeps entered fields when submission fails', async () => {
    playerApi.registerSelf.mockRejectedValue(new Error('Already linked'));
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Register myself' }));
    fireEvent.change(screen.getByLabelText('Your player name'), { target: { value: 'My Player' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Already linked');
    expect(screen.getByLabelText('Your player name').value).toBe('My Player');
});
