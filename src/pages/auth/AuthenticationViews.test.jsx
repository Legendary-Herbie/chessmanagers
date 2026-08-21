import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../app/contextHooks.js';
import RegisterView from './RegisterView.jsx';
import OAuthCallbackView from './OAuthCallbackView.jsx';

afterEach(cleanup);

describe('authentication views', () => {
    it('registers distinct username/full-name fields and preserves invite continuation', async () => {
        const register = vi.fn().mockResolvedValue({ requiresVerification: true });
        render(<MemoryRouter initialEntries={['/auth/register?inviteToken=invite_123']}>
            <AuthContext.Provider value={{ register }}>
                <Routes>
                    <Route path="/auth/register" element={<RegisterView />} />
                    <Route path="/auth/verification-pending" element={<div>Verification pending</div>} />
                </Routes>
            </AuthContext.Provider>
        </MemoryRouter>);
        fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'chess_user' } });
        fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Chess User' } });
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'chess@example.test' } });
        fireEvent.change(screen.getByLabelText(/Password/, { selector: '#password' }), { target: { value: 'StrongPassword123!' } });
        fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'StrongPassword123!' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
        await waitFor(() => expect(register).toHaveBeenCalledWith(expect.objectContaining({
            username: 'chess_user',
            fullName: 'Chess User',
            continuation: '/clubs/join?token=invite_123',
        })));
        expect(await screen.findByText('Verification pending')).toBeTruthy();
    });

    it('finishes the cookie-backed OAuth session and restores its continuation', async () => {
        const establishSession = vi.fn().mockResolvedValue({ id: 'user_1' });
        render(<MemoryRouter initialEntries={['/auth/oauth/callback?continuation=%2Fclubs%2Fjoin%3Fcode%3D123456']}>
            <AuthContext.Provider value={{ establishSession }}>
                <Routes>
                    <Route path="/auth/oauth/callback" element={<OAuthCallbackView />} />
                    <Route path="/clubs/join" element={<div>Invite continued</div>} />
                </Routes>
            </AuthContext.Provider>
        </MemoryRouter>);
        expect(await screen.findByText('Invite continued')).toBeTruthy();
        expect(establishSession).toHaveBeenCalledTimes(1);
    });
});
