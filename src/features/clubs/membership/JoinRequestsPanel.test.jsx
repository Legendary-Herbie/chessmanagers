import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsContext } from '../../../app/contextHooks.js';
import { clubApi } from '../api/clubApi.js';
import JoinRequestsPanel from './JoinRequestsPanel.jsx';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/clubApi.js', () => ({
    clubApi: {
        fetchJoinRequests: vi.fn(),
        approveJoinRequest: vi.fn(),
        rejectJoinRequest: vi.fn(),
    },
}));

function renderPanel(props = {}) {
    return render(
        <NotificationsContext.Provider value={{ notify: vi.fn() }}>
            <MemoryRouter><JoinRequestsPanel clubId="club_1" {...props} /></MemoryRouter>
        </NotificationsContext.Provider>
    );
}

describe('JoinRequestsPanel', () => {
    afterEach(cleanup);

    beforeEach(() => {
        vi.clearAllMocks();
        clubApi.fetchJoinRequests.mockResolvedValue([
            { id: 'request_1', name: 'Ada Player', email: 'ada@example.test', message: 'I play rapid.' },
        ]);
        clubApi.approveJoinRequest.mockResolvedValue({});
        clubApi.rejectJoinRequest.mockResolvedValue({});
    });

    it('shows the real request queue on the dashboard surface and approves in place', async () => {
        const onQueueChanged = vi.fn();
        renderPanel({ onQueueChanged });

        expect(await screen.findByText('Ada Player')).toBeTruthy();
        expect(screen.getByText('I play rapid.')).toBeTruthy();
        expect(screen.getByRole('link', { name: /Manage invites and member access/ }).getAttribute('href')).toBe('/club?tab=members');
        fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

        await waitFor(() => expect(clubApi.approveJoinRequest).toHaveBeenCalledWith('club_1', 'request_1'));
        await waitFor(() => expect(screen.getByText('No pending join requests.')).toBeTruthy());
        expect(onQueueChanged).toHaveBeenCalledOnce();
    });

    it('collects an optional reason before rejecting a request', async () => {
        renderPanel();
        await screen.findByText('Ada Player');
        fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
        fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Roster is full' } });
        fireEvent.click(screen.getByRole('button', { name: 'Reject request' }));

        await waitFor(() => expect(clubApi.rejectJoinRequest).toHaveBeenCalledWith(
            'club_1',
            'request_1',
            'Roster is full'
        ));
    });
});
