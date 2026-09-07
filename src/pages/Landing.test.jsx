import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import Landing from './Landing.jsx';

afterEach(cleanup);

describe('Landing value proposition', () => {
    it('connects club community messaging with organizer and player actions', () => {
        render(<MemoryRouter><Landing /></MemoryRouter>);

        expect(screen.getByRole('heading', { name: 'One club. Every player connected.' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Make your club a place to belong.' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Your next game starts with your club.' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Bring your club together' })).toBeTruthy();
        expect(screen.getByText('Your club, together')).toBeTruthy();
        expect(screen.queryByText(/club-specific/i)).toBeNull();
    });
});
