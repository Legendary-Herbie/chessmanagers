import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from './contextHooks.js';
import { ThemeProvider } from './ThemeProvider.jsx';

function ThemeConsumer() {
    const { theme, toggleTheme } = useTheme();
    return <button type="button" onClick={toggleTheme}>{theme}</button>;
}

describe('ThemeProvider', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('keeps rendering and switching themes when localStorage throws', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('blocked'); },
            setItem: () => { throw new Error('blocked'); },
        });
        vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));

        render(<ThemeProvider><ThemeConsumer /></ThemeProvider>);
        const toggle = screen.getByRole('button', { name: 'light' });
        fireEvent.click(toggle);
        expect(screen.getByRole('button', { name: 'dark' })).toBeTruthy();
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
});
