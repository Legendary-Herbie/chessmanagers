import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthContext } from '../../app/contextHooks.js';
import PublicLayout from './PublicLayout.jsx';

afterEach(cleanup);

function renderLayout(user) {
    return render(<AuthContext.Provider value={{ user, loading: false }}>
        <MemoryRouter initialEntries={['/clubs']}><Routes>
            <Route element={<PublicLayout />}><Route path="/clubs" element={<h1>Club directory</h1>} /></Route>
        </Routes></MemoryRouter>
    </AuthContext.Provider>);
}

describe('PublicLayout', () => {
    it('shows guest navigation and a main landmark', () => {
        renderLayout(null);
        expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Create account' })).toBeTruthy();
        expect(screen.getByRole('main').contains(
            screen.getByRole('heading', { name: 'Club directory' })
        )).toBe(true);
    });

    it('offers the dashboard to authenticated visitors', () => {
        renderLayout({ id: 'user_1' });
        expect(screen.getByRole('link', { name: 'Dashboard' })).toBeTruthy();
        expect(screen.queryByRole('link', { name: 'Create account' })).toBeNull();
    });
});
