import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, ClubContext, NotificationsContext } from '../../app/contextHooks.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';
import FindClubsPage from './FindClubsPage.jsx';

vi.mock('../../features/clubs/api/clubApi.js', () => ({
    clubApi: { listPublic: vi.fn(), joinByCode: vi.fn() },
}));

describe('FindClubsPage search', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clubApi.listPublic.mockResolvedValue({ clubs: [], total: 0 });
    });
    afterEach(cleanup);

    it('debounces URL-backed search and supplies an abort signal', async () => {
        render(<AuthContext.Provider value={{ user: null }}>
            <ClubContext.Provider value={{ refreshClubs: vi.fn() }}>
                <NotificationsContext.Provider value={{ notify: vi.fn() }}>
                    <MemoryRouter initialEntries={['/clubs']}><Routes>
                        <Route path="/clubs" element={<FindClubsPage />} />
                    </Routes></MemoryRouter>
                </NotificationsContext.Provider>
            </ClubContext.Provider>
        </AuthContext.Provider>);
        await waitFor(() => expect(clubApi.listPublic).toHaveBeenCalledTimes(1));
        const search = screen.getByRole('searchbox', { name: 'Search public clubs' });
        fireEvent.change(search, { target: { value: 'R' } });
        fireEvent.change(search, { target: { value: 'Royal' } });
        await new Promise(resolve => setTimeout(resolve, 350));
        await waitFor(() => expect(clubApi.listPublic).toHaveBeenCalledTimes(2));
        expect(clubApi.listPublic.mock.calls[1][0]).toMatchObject({ q: 'Royal', offset: 0 });
        expect(clubApi.listPublic.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
    });
});
