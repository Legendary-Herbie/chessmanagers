import React, { useState, useEffect, useCallback } from 'react';
import { ThemeContext } from './contextHooks.js';

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        try {
            return window.localStorage?.getItem?.('cm_theme')
                ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        } catch {
            return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        try {
            window.localStorage?.setItem?.('cm_theme', theme);
        } catch {
            // Theme selection still works for this session when storage is unavailable.
        }
    }, [theme]);

    const toggleTheme = useCallback(() => {
        setTheme(t => (t === 'dark' ? 'light' : 'dark'));
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
