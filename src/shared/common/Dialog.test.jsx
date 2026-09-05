import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Dialog from './Dialog.jsx';

describe('shared dialog keyboard behavior', () => {
    afterEach(cleanup);
    it('renders above page containers and restores scrolling when closed', () => {
        document.body.style.overflow = 'auto';
        const { container, unmount } = render(<Dialog title="Result" onClose={() => {}} />);
        expect(container.contains(screen.getByRole('dialog'))).toBe(false);
        expect(document.body.style.overflow).toBe('hidden');
        unmount();
        expect(document.body.style.overflow).toBe('auto');
        document.body.style.overflow = '';
    });
    it('wraps Tab and Shift+Tab and blocks Escape while busy', () => {
        const onClose = vi.fn();
        const { rerender } = render(<Dialog title="Edit" onClose={onClose}>
            <button type="button">Save</button>
        </Dialog>);
        const close = screen.getByRole('button', { name: 'Close' });
        const save = screen.getByRole('button', { name: 'Save' });
        expect(document.activeElement).toBe(close);
        fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(save);
        fireEvent.keyDown(save, { key: 'Tab' });
        expect(document.activeElement).toBe(close);
        rerender(<Dialog title="Edit" onClose={onClose} busy><button type="button">Save</button></Dialog>);
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });
});
