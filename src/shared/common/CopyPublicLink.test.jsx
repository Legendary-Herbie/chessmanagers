import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import CopyPublicLink from './CopyPublicLink.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('copies the existing public route and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyPublicLink path="/clubs/club_1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy public link' }));
    expect((await screen.findByRole('status')).textContent).toBe('Public link copied.');
    expect(writeText).toHaveBeenCalledWith(new URL('/clubs/club_1', window.location.origin).href);
});
it('offers a selectable fallback when clipboard access fails', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
    render(<CopyPublicLink path="/clubs/club_1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy public link' }));
    expect(await screen.findByLabelText('Public link')).toBeTruthy();
});
