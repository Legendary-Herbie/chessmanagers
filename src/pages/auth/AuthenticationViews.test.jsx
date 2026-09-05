import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../app/contextHooks.js';
import RegisterView from './RegisterView.jsx';
import LoginView from './LoginView.jsx';
import OAuthCallbackView from './OAuthCallbackView.jsx';

afterEach(cleanup);

describe('authentication views', () => {
    it('registers with a human name and preserves invite continuation', async () => {
        const register = vi.fn().mockResolvedValue({ requiresVerification: true });
        render(<MemoryRouter initialEntries={['/auth/register?inviteToken=invite_123']}>
            <AuthContext.Provider value={{ register }}>
                <Routes>
                    <Route path="/auth/register" element={<RegisterView />} />
                    <Route path="/auth/verification-pending" element={<div>Verification pending</div>} />
                </Routes>
            </AuthContext.Provider>
        </MemoryRouter>);
        fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Chess User' } });
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'chess@example.test' } });
        fireEvent.change(screen.getByLabelText(/Password/, { selector: '#password' }), { target: { value: 'StrongPassword123!' } });
        fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'StrongPassword123!' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
        await waitFor(() => expect(register).toHaveBeenCalledWith(expect.objectContaining({
            fullName: 'Chess User',
            continuation: '/clubs/join?token=invite_123',
        })));
        expect(await screen.findByText('Verification pending')).toBeTruthy();
    });

    it('shows specific registration errors and focuses the first invalid field', async () => {
        const register = vi.fn();
        render(<MemoryRouter initialEntries={['/auth/register']}>
            <AuthContext.Provider value={{ register }}>
                <RegisterView />
            </AuthContext.Provider>
        </MemoryRouter>);
        fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Test User' } });
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
        fireEvent.change(screen.getByLabelText(/Password/, { selector: '#password' }), { target: { value: 'short' } });
        fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

        const email = screen.getByLabelText('Email');
        await waitFor(() => expect(document.activeElement).toBe(email));
        expect(email.getAttribute('aria-invalid')).toBe('true');
        expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
        expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
        expect(screen.getByText('Passwords do not match.')).toBeTruthy();
        expect(register).not.toHaveBeenCalled();
    });

    it('can reveal both registration password fields', () => {
        render(<MemoryRouter><AuthContext.Provider value={{ register: vi.fn() }}><RegisterView /></AuthContext.Provider></MemoryRouter>);
        const password = screen.getByLabelText(/Password/, { selector: '#password' });
        const confirmation = screen.getByLabelText('Confirm password');
        expect(password.type).toBe('password');
        fireEvent.click(screen.getByLabelText('Show passwords'));
        expect(password.type).toBe('text');
        expect(confirmation.type).toBe('text');
    });

    it('finishes the cookie-backed OAuth session and restores its continuation', async () => {
        const establishSession = vi.fn().mockResolvedValue({ id: 'user_1' });
        render(<React.StrictMode>
            <MemoryRouter initialEntries={['/auth/oauth/callback?continuation=%2Fclubs%2Fjoin%3Fcode%3D123456']}>
                <AuthContext.Provider value={{ establishSession }}>
                    <Routes>
                        <Route path="/auth/oauth/callback" element={<OAuthCallbackView />} />
                        <Route path="/clubs/join" element={<div>Invite continued</div>} />
                    </Routes>
                </AuthContext.Provider>
            </MemoryRouter>
        </React.StrictMode>);
        expect(await screen.findByText('Invite continued')).toBeTruthy();
        expect(establishSession).toHaveBeenCalledTimes(1);
    });

    it('explains an expired Google OAuth state without trying to establish a session', async () => {
        const establishSession = vi.fn();
        render(<MemoryRouter initialEntries={['/auth/oauth/callback?error=OAUTH_STATE_INVALID']}>
            <AuthContext.Provider value={{ establishSession }}>
                <OAuthCallbackView />
            </AuthContext.Provider>
        </MemoryRouter>);
        expect(await screen.findByText('This Google sign-in attempt expired. Please try again.')).toBeTruthy();
        expect(establishSession).not.toHaveBeenCalled();
    });

    it('preserves a public-club return destination during registration', async () => {
        const register = vi.fn().mockResolvedValue({ requiresVerification: true });
        render(<MemoryRouter initialEntries={['/auth/register?returnTo=%2Fclubs%2Fclub_123']}>
            <AuthContext.Provider value={{ register }}><Routes>
                <Route path="/auth/register" element={<RegisterView />} />
                <Route path="/auth/verification-pending" element={<div>Verification pending</div>} />
            </Routes></AuthContext.Provider>
        </MemoryRouter>);
        fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Club User' } });
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'club@example.test' } });
        fireEvent.change(screen.getByLabelText(/Password/, { selector: '#password' }), { target: { value: 'StrongPassword123!' } });
        fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'StrongPassword123!' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
        await waitFor(() => expect(register).toHaveBeenCalledWith(expect.objectContaining({
            continuation: '/clubs/club_123',
        })));
        expect(await screen.findByText('Verification pending')).toBeTruthy();
    });

    it('focuses and describes the first missing login field', async () => {
        render(<MemoryRouter initialEntries={['/auth/login']}>
            <AuthContext.Provider value={{ login: vi.fn() }}><Routes>
                <Route path="/auth/login" element={<LoginView />} />
            </Routes></AuthContext.Provider>
        </MemoryRouter>);
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        const email = screen.getByLabelText('Email');
        await waitFor(() => expect(document.activeElement).toBe(email));
        expect(email.getAttribute('aria-invalid')).toBe('true');
        expect(email.getAttribute('aria-describedby')).toContain('email-error');
        expect(screen.getByText('Enter your email address.')).toBeTruthy();
    });

    it('rejects an external OAuth continuation', async () => {
        const establishSession = vi.fn().mockResolvedValue({ id: 'user_1' });
        render(<MemoryRouter initialEntries={['/auth/oauth/callback?continuation=https%3A%2F%2Fevil.example']}>
            <AuthContext.Provider value={{ establishSession }}><Routes>
                <Route path="/auth/oauth/callback" element={<OAuthCallbackView />} />
                <Route path="/dashboard" element={<div>Safe dashboard</div>} />
            </Routes></AuthContext.Provider>
        </MemoryRouter>);
        expect(await screen.findByText('Safe dashboard')).toBeTruthy();
    });

    it('renders VerifyEmailView and resolves successful email verification', async () => {
        const { authApi } = await import('../../features/auth/api/authApi.js');
        const spy = vi.spyOn(authApi, 'verifyEmail').mockResolvedValue({
            ok: true,
            alreadyVerified: false,
            message: 'Email verified successfully',
        });
        const VerifyEmailView = (await import('./VerifyEmailView.jsx')).default;

        render(<MemoryRouter initialEntries={['/auth/verify?token=valid_token_123']}>
            <VerifyEmailView />
        </MemoryRouter>);

        expect(await screen.findByText('Your email is verified. Your account is ready.')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Continue to sign in' })).toBeTruthy();
        spy.mockRestore();
    });

    it('renders the same successful state when verification was already complete', async () => {
        const { authApi } = await import('../../features/auth/api/authApi.js');
        const spy = vi.spyOn(authApi, 'verifyEmail').mockResolvedValue({
            ok: true,
            alreadyVerified: true,
            message: 'Email already verified',
        });
        const VerifyEmailView = (await import('./VerifyEmailView.jsx')).default;

        render(<MemoryRouter initialEntries={['/auth/verify?token=valid_token_123']}>
            <VerifyEmailView />
        </MemoryRouter>);

        expect(await screen.findByText('Your email is verified. Your account is ready.')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Continue to sign in' })).toBeTruthy();
        spy.mockRestore();
    });

    it('renders VerifyEmailView and displays expired link error', async () => {
        const { authApi } = await import('../../features/auth/api/authApi.js');
        const spy = vi.spyOn(authApi, 'verifyEmail').mockRejectedValue(new Error('Verification link expired'));
        const VerifyEmailView = (await import('./VerifyEmailView.jsx')).default;

        render(<MemoryRouter initialEntries={['/auth/verify?token=expired_token']}>
            <VerifyEmailView />
        </MemoryRouter>);

        expect(await screen.findByText('Verification link expired')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeTruthy();
        spy.mockRestore();
    });

    it('renders VerifyEmailView and displays invalid link error when token is missing', async () => {
        const VerifyEmailView = (await import('./VerifyEmailView.jsx')).default;

        render(<MemoryRouter initialEntries={['/auth/verify']}>
            <VerifyEmailView />
        </MemoryRouter>);

        expect(await screen.findByText('Invalid verification link')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeTruthy();
    });
});
