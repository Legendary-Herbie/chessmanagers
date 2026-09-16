import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSearchShortcut } from './useSearchShortcut.js';
function Harness() { useSearchShortcut(); return <><input type="search" aria-label="Search players" /><textarea aria-label="Notes" /></>; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('focuses visible search but leaves typing, dialogs, and hidden fields alone', () => {
    render(<Harness />);
    const search = screen.getByRole('searchbox');
    vi.spyOn(search, 'getClientRects').mockReturnValue([{}]);
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(search);
    const notes = screen.getByLabelText('Notes');
    notes.focus();
    fireEvent.keyDown(notes, { key: '/' });
    expect(document.activeElement).toBe(notes);
    notes.blur();
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); document.body.append(dialog);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(document.activeElement).not.toBe(search);
    dialog.remove();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(search);
    search.blur();
    search.getClientRects.mockReturnValue([]);
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).not.toBe(search);
});
