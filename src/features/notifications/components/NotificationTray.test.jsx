import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationApi } from '../api/notificationApi.js';
import NotificationTray from './NotificationTray.jsx';
import { ClubContext } from '../../../app/contextHooks.js';
import { MemoryRouter, useLocation } from 'react-router-dom';

vi.mock('../api/notificationApi.js', () => ({
    notificationApi: {
        list: vi.fn(),
        unreadCount: vi.fn(),
        markRead: vi.fn(),
        markAllRead: vi.fn(),
        dismiss: vi.fn(),
        dismissAll: vi.fn(),
    },
}));

const notification = {
    id: 'notif_1',
    clubId: 'club_1',
    clubName: 'Central Chess Club',
    eventType: 'match.recorded',
    payload: { whitePlayerName: 'Ada', blackPlayerName: 'Grace' },
    readAt: null,
    createdAt: '2026-08-17T12:00:00.000Z',
};

function LocationProbe() {
    return <output data-testid="notification-location">{useLocation().pathname}{useLocation().search}</output>;
}

function renderTray({ activeClubs = [], selectClub = vi.fn() } = {}) {
    return render(<MemoryRouter><ClubContext.Provider value={{ activeClubs, selectClub }}>
        <NotificationTray /><LocationProbe />
    </ClubContext.Provider></MemoryRouter>);
}

describe('NotificationTray', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        notificationApi.list.mockResolvedValue({ notifications: [notification], total: 1 });
        notificationApi.unreadCount.mockResolvedValue({ count: 1 });
        notificationApi.markRead.mockResolvedValue({ notification: { id: notification.id } });
        notificationApi.markAllRead.mockResolvedValue({ updated: 1 });
        notificationApi.dismiss.mockResolvedValue({ notification: { id: notification.id } });
        notificationApi.dismissAll.mockResolvedValue({ deleted: 1 });
    });
    afterEach(cleanup);

    it('deletes all notifications and clears the unread badge', async () => {
        renderTray();
        fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Delete all' }));
        expect(await screen.findByText('No notifications yet.')).toBeTruthy();
        expect(notificationApi.dismissAll).toHaveBeenCalledOnce();
        expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Delete all' })).toBeNull();
    });

    it('keeps notifications and allows retry if deleting all fails', async () => {
        notificationApi.dismissAll.mockRejectedValueOnce(new Error('Delete failed'));
        renderTray();
        fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Delete all' }));
        expect((await screen.findByRole('alert')).textContent).toBe('Delete failed');
        expect(screen.getByText('Ada vs Grace')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
        expect(await screen.findByText('No notifications yet.')).toBeTruthy();
    });

    it.each(['one', 'all'])('preserves unread state and reports a failed %s read action', async scope => {
        notificationApi.markRead.mockRejectedValue(new Error('Read failed'));
        notificationApi.markAllRead.mockRejectedValue(new Error('Read failed'));
        renderTray();
        fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
        fireEvent.click(await screen.findByRole('button', {
            name: scope === 'all' ? 'Mark all read' : /^A match involving your player/,
        }));
        expect((await screen.findByRole('alert')).textContent).toBe('Read failed');
        expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeTruthy();
    });

    it('does not let an older refresh overwrite a successful read', async () => {
        renderTray();
        const trigger = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
        let resolveList;
        notificationApi.list.mockImplementationOnce(() => new Promise(resolve => { resolveList = resolve; }));
        fireEvent.click(trigger);
        fireEvent.click(screen.getByRole('button', { name: /^A match involving your player/ }));
        await screen.findByRole('button', { name: 'Notifications' });
        resolveList({ notifications: [notification], total: 1 });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy());
    });

    it('shows a durable unread badge and renders club-safe event copy', async () => {
        renderTray();
        const trigger = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
        fireEvent.click(trigger);
        expect(await screen.findByText('A match involving your player was recorded.')).toBeTruthy();
        expect(screen.getByText('Ada vs Grace')).toBeTruthy();
        expect(screen.getByText('Central Chess Club')).toBeTruthy();
    });

    it('marks one record read through the persistent API', async () => {
        renderTray();
        fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
        fireEvent.click(await screen.findByRole('button', { name: /^A match involving your player/ }));
        await waitFor(() => expect(notificationApi.markRead).toHaveBeenCalledWith('notif_1'));
        expect(await screen.findByRole('button', { name: 'Notifications' })).toBeTruthy();
    });

    it('marks all records read through the persistent API', async () => {
        renderTray();
        fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
        await waitFor(() => expect(notificationApi.markAllRead).toHaveBeenCalledTimes(1));
        expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    });

    it('deletes one notification through the user-owned dismissal API', async () => {
        renderTray();
        fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
        fireEvent.click(await screen.findByRole('button', { name: /^Delete notification:/ }));

        await waitFor(() => expect(notificationApi.dismiss).toHaveBeenCalledWith('notif_1'));
        expect(screen.queryByText('Ada vs Grace')).toBeNull();
        expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    });

    it('opens the relevant club-scoped page from an actionable notification', async () => {
        const selectClub = vi.fn().mockResolvedValue(undefined);
        renderTray({ activeClubs: [{ club: { id: 'club_1' } }], selectClub });
        fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
        fireEvent.click(await screen.findByRole('button', { name: /^A match involving your player/ }));
        await waitFor(() => expect(screen.getByTestId('notification-location').textContent).toBe('/matches'));
        expect(selectClub).toHaveBeenCalledWith('club_1');
        expect(notificationApi.markRead).toHaveBeenCalledWith('notif_1');
    });
    it('uses readable player names for incomplete match notifications', async () => {
        notificationApi.list.mockResolvedValue({ notifications: [{ ...notification, payload: {} }], total: 1 });
        renderTray();
        fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
        expect(await screen.findByText('White player vs Black player')).toBeTruthy();
        expect(screen.queryByText(/undefined/)).toBeNull();
    });

});
