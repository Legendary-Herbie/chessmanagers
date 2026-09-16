import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import ShareControls from './ShareControls.jsx';
vi.mock('qrcode', () => ({ default:{ toDataURL:vi.fn().mockResolvedValue('data:image/png;base64,aGVsbG8=') } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('generates a printable high-resolution invitation QR locally and clears it when the invitation changes', async () => {
    const print = vi.spyOn(window,'print').mockImplementation(() => {});
    const { rerender } = render(<ShareControls value="123456" qrValue="https://club.example/clubs?joinCode=123456" />);
    fireEvent.click(screen.getByRole('button',{ name:'Generate QR code' }));
    await screen.findByRole('dialog',{ name:'Club invitation QR code' });
    expect(QRCode.toDataURL).toHaveBeenCalledWith('https://club.example/clubs?joinCode=123456',{ width:1600,margin:4 });
    fireEvent.click(screen.getByRole('button',{ name:'Print QR code' })); expect(print).toHaveBeenCalledOnce();
    expect(screen.getByRole('link',{ name:'Download PNG' }).getAttribute('download')).toBe('club-invite-qr.png');
    rerender(<ShareControls value="654321" qrValue="https://club.example/clubs?joinCode=654321" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
