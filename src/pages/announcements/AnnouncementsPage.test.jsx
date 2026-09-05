import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubContext } from '../../app/contextHooks.js';
import { announcementApi } from '../../features/announcements/api/announcementApi.js';
import AnnouncementPage from './AnnouncementPage.jsx';
import AnnouncementsPage from './AnnouncementsPage.jsx';

vi.mock('../../features/announcements/api/announcementApi.js', () => ({
    announcementApi: {
        list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(),
        publish: vi.fn(), archive: vi.fn(), delete: vi.fn(),
        uploadAttachment: vi.fn(), deleteAttachment: vi.fn(), fetchAttachment: vi.fn(),
    },
}));

const clubValue = canManage => ({
    club: { id: 'club_1', name: 'Central Club' },
    capabilities: { canManageAnnouncements: canManage },
});

function renderList(canManage) {
    return render(
        <MemoryRouter>
            <ClubContext.Provider value={clubValue(canManage)}>
                <AnnouncementsPage />
            </ClubContext.Provider>
        </MemoryRouter>
    );
}

function renderDetail(canManage = true) {
    return render(
        <MemoryRouter initialEntries={['/announcements/ann_1']}>
            <ClubContext.Provider value={clubValue(canManage)}>
                <Routes><Route path="/announcements/:announcementId" element={<AnnouncementPage />} /></Routes>
            </ClubContext.Provider>
        </MemoryRouter>
    );
}

describe('announcement workflows', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        announcementApi.list.mockResolvedValue({
            announcements: [{
                id: 'ann_1', title: 'Pairing night', contentText: 'Round three starts Friday.',
                status: 'published', publishedAt: '2026-08-18T12:00:00.000Z',
                updatedAt: '2026-08-18T12:00:00.000Z',
            }],
        });
        announcementApi.get.mockResolvedValue({
            announcement: {
                id: 'ann_1', title: 'Pairing night', contentHtml: '<p>Round three starts Friday.</p>',
                contentText: 'Round three starts Friday.', status: 'draft', attachments: [],
                updatedAt: '2026-08-18T12:00:00.000Z', publishedAt: null,
            },
        });
        announcementApi.publish.mockResolvedValue({ alreadyPublished: false });
    });
    afterEach(cleanup);

    it('shows published club news to members without admin controls', async () => {
        renderList(false);
        expect(await screen.findByText('Pairing night')).toBeTruthy();
        expect(screen.getByText('Round three starts Friday.')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'New announcement' })).toBeNull();
        expect(announcementApi.list).toHaveBeenCalledWith('club_1', {});
    });

    it('shows draft filters and the rich-text composer to announcement managers', async () => {
        renderList(true);
        await screen.findByText('Pairing night');
        expect(screen.getByLabelText('Status')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'New announcement' }));
        expect(screen.getByRole('dialog', { name: 'New announcement' })).toBeTruthy();
        expect(screen.getByRole('textbox', { name: 'Announcement content' })).toBeTruthy();
    });

    it('publishes a draft only after confirmation', async () => {
        renderDetail();
        fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
        expect(screen.getByRole('dialog', { name: 'Publish announcement' })).toBeTruthy();
        const publishButtons = screen.getAllByRole('button', { name: 'Publish' });
        fireEvent.click(publishButtons.at(-1));
        await waitFor(() => expect(announcementApi.publish).toHaveBeenCalledWith('club_1', 'ann_1'));
    });
});
