import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import Landing from './Landing.jsx';

afterEach(cleanup);

describe('Landing value proposition', () => {
    it('leads with organizer and player outcomes instead of tenancy mechanics', () => {
        render(<MemoryRouter><Landing /></MemoryRouter>);

        expect(screen.getByRole('heading', { name: 'Run your club without rebuilding the same spreadsheet.' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Know the club is under control.' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'See progress you can believe.' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Get started' })).toBeTruthy();
        expect(screen.getByText('One result, reflected everywhere')).toBeTruthy();
        expect(screen.queryByText(/club-specific/i)).toBeNull();
    });
});
