import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationApi } from '../api/notificationApi.js';
import NotificationTray from './NotificationTray.jsx';

vi.mock('../api/notificationApi.js', () => ({
    notificationApi: {
        list: vi.fn(),
        unreadCount: vi.fn(),
        markRead: vi.fn(),
        markAllRead: vi.fn(),
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

describe('NotificationTray', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        notificationApi.list.mockResolvedValue({ notifications: [notification], total: 1 });
        notificationApi.unreadCount.mockResolvedValue({ count: 1 });
        notificationApi.markRead.mockResolvedValue({ notification: { id: notification.id } });
        notificationApi.markAllRead.mockResolvedValue({ updated: 1 });
    });
    afterEach(cleanup);

    it('shows a durable unread badge and renders club-safe event copy', async () => {
        render(<NotificationTray />);
        const trigger = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
        fireEvent.click(trigger);
        expect(await screen.findByText('A match involving your player was recorded.')).toBeTruthy();
        expect(screen.getByText('Ada vs Grace')).toBeTruthy();
        expect(screen.getByText('Central Chess Club')).toBeTruthy();
    });

    it('marks one record read through the persistent API', async () => {
        render(<NotificationTray />);
        fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
        fireEvent.click(await screen.findByRole('button', { name: /A match involving your player/ }));
        await waitFor(() => expect(notificationApi.markRead).toHaveBeenCalledWith('notif_1'));
        expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    });

    it('marks all records read through the persistent API', async () => {
        render(<NotificationTray />);
        fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
        await waitFor(() => expect(notificationApi.markAllRead).toHaveBeenCalledTimes(1));
        expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    });
});
