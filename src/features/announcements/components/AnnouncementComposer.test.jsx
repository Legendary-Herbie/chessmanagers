import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AnnouncementComposer from './AnnouncementComposer.jsx';
import { announcementApi } from '../api/announcementApi.js';

vi.mock('../api/announcementApi.js', () => ({ announcementApi: {
    create: vi.fn(), update: vi.fn(), uploadAttachment: vi.fn(), publish: vi.fn(), deleteAttachment: vi.fn(),
} }));
beforeEach(() => {
    vi.resetAllMocks();
    announcementApi.create.mockResolvedValue({ announcement: { id: 'ann_1' } });
    announcementApi.update.mockResolvedValue({});
    announcementApi.publish.mockResolvedValue({});
});
afterEach(cleanup);

function fill() {
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Club update' } });
    const editor = screen.getByRole('textbox', { name: 'Announcement content' });
    editor.innerHTML = '<p>Full update</p>';
    fireEvent.input(editor);
}

it('uploads selected attachments before publishing from one form', async () => {
    announcementApi.uploadAttachment.mockResolvedValue({ attachment: { id: 'file_1' } });
    const complete = vi.fn();
    render(<AnnouncementComposer clubId="club_1" onClose={vi.fn()} onComplete={complete} />);
    fill();
    const file = new File(['%PDF-'], 'club.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Add, drop, or paste images and PDFs'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish', exact: true }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(announcementApi.uploadAttachment).toHaveBeenCalledWith('club_1', 'ann_1', file);
    expect(announcementApi.uploadAttachment.mock.invocationCallOrder[0]).toBeLessThan(announcementApi.publish.mock.invocationCallOrder[0]);
});

it('retries only unfinished uploads and never publishes a partially uploaded draft', async () => {
    announcementApi.uploadAttachment.mockResolvedValueOnce({ attachment: { id: 'file_1' } }).mockRejectedValueOnce(new Error('Upload interrupted'))
        .mockResolvedValueOnce({ attachment: { id: 'file_2' } });
    const complete = vi.fn();
    render(<AnnouncementComposer clubId="club_1" onClose={vi.fn()} onComplete={complete} />);
    fill();
    const files = ['one.pdf', 'two.pdf'].map(name => new File(['%PDF-'], name, { type: 'application/pdf' }));
    fireEvent.change(screen.getByLabelText('Add, drop, or paste images and PDFs'), { target: { files } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish', exact: true }));
    expect((await screen.findByRole('alert')).textContent).toContain('Your draft is saved');
    expect(announcementApi.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Publish', exact: true }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(announcementApi.create).toHaveBeenCalledOnce();
    expect(announcementApi.uploadAttachment).toHaveBeenCalledTimes(3);
    expect(announcementApi.uploadAttachment.mock.calls[2][2]).toBe(files[1]);
});

it('saves a draft without publishing', async () => {
    const complete = vi.fn();
    render(<AnnouncementComposer clubId="club_1" onClose={vi.fn()} onComplete={complete} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(announcementApi.publish).not.toHaveBeenCalled();
});
