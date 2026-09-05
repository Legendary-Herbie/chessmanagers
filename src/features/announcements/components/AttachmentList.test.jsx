import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AttachmentList from './AttachmentList.jsx';
import { announcementApi } from '../api/announcementApi.js';

vi.mock('../api/announcementApi.js', () => ({ announcementApi: { fetchAttachment: vi.fn() } }));
const attachment = { id: 'image_1', kind: 'image', originalName: 'Club photo', sizeBytes: 100 };
const props = { clubId: 'club_1', announcementId: 'announcement_1', attachments: [attachment] };

describe('AttachmentList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('URL', Object.assign(URL, {
            createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn(),
        }));
    });
    afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

    it('does not create an image object URL when the request resolves after unmount', async () => {
        let resolve;
        announcementApi.fetchAttachment.mockImplementation(() => new Promise(done => { resolve = done; }));
        const { unmount } = render(<AttachmentList {...props} />);
        unmount();
        await act(async () => resolve(new Blob(['image'])));
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('revokes loaded image previews on unmount', async () => {
        announcementApi.fetchAttachment.mockResolvedValue(new Blob(['image']));
        const { unmount } = render(<AttachmentList {...props} />);
        await screen.findByRole('img');
        unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    });

    it('reports a failed download and permits another attempt', async () => {
        announcementApi.fetchAttachment.mockRejectedValue(new Error('Download unavailable'));
        render(<AttachmentList {...props} attachments={[{ ...attachment, kind: 'file' }]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Download' }));
        expect((await screen.findByRole('alert')).textContent).toBe('Download unavailable');
        expect(screen.getByRole('button', { name: 'Download' }).disabled).toBe(false);
    });
});
