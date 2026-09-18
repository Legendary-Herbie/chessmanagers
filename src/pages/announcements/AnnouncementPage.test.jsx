import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AnnouncementPage from './AnnouncementPage.jsx';
import { announcementApi } from '../../features/announcements/api/announcementApi.js';

vi.mock('../../app/contextHooks.js', () => ({ useClub: () => ({ club: { id: 'club_1' }, capabilities: { canManageAnnouncements: true } }) }));
vi.mock('../../features/announcements/api/announcementApi.js', () => ({ announcementApi: { get: vi.fn(), view: vi.fn(), uploadAttachment: vi.fn() } }));
vi.mock('../../features/announcements/components/AttachmentList.jsx', () => ({ default: () => null }));
afterEach(cleanup);
beforeEach(() => {
    vi.clearAllMocks();
    announcementApi.get.mockResolvedValue({ announcement: {
        id: 'ann_1', title: 'Club update', contentHtml: '<p>Updated time</p>', attachments: [],
        status: 'published', publishedAt: '2026-09-01T10:00:00Z', editedAt: '2026-09-02T10:00:00Z',
    } });
    announcementApi.view.mockResolvedValue({ viewCount: 1 });
});
function renderPage() {
    return render(<MemoryRouter initialEntries={['/announcements/ann_1']}><Routes>
        <Route path="/announcements/:announcementId" element={<AnnouncementPage />} />
    </Routes></MemoryRouter>);
}
it('rejects unsupported and oversized detail uploads before calling the API', async () => {
    renderPage();
    const input = await screen.findByLabelText('Add image or PDF');
    for (const file of [{ name: 'bad.html', type: 'text/html', size: 10 }, { name: 'big.pdf', type: 'application/pdf', size: 6 * 1024 * 1024 }]) {
        fireEvent.change(input, { target: { files: [file] } });
        expect(screen.getByRole('alert').textContent).toContain('up to 5 MB');
        expect(announcementApi.uploadAttachment).not.toHaveBeenCalled();
    }
});
it('shows the updated timestamp and explains silent published edits', async () => {
    renderPage();
    expect(await screen.findByText(/^Updated$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }));
    expect(screen.getByText(/Members will not be notified again/)).toBeTruthy();
});
