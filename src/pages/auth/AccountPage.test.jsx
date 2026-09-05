import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../../app/contextHooks.js';
import { authApi } from '../../features/auth/api/authApi.js';
import AccountPage from './AccountPage.jsx';
import { AuthProvider } from '../../app/AuthProvider.jsx';
import { refreshAccessToken } from '../../config/api.js';
import LoginView from './LoginView.jsx';

vi.mock('../../features/auth/api/authApi.js', () => ({ authApi: { changePassword: vi.fn() } }));
vi.mock('../../config/api.js', async importOriginal => ({ ...(await importOriginal()), getToken: () => null, refreshAccessToken: vi.fn() }));
afterEach(cleanup);
beforeEach(() => {
    vi.resetAllMocks();
    refreshAccessToken.mockResolvedValue({ user: { id: 'user_1', fullName: 'Ada', username: 'ada' } });
});

function Harness() {
    const { user, loading } = useAuth();
    if (loading) return null;
    return <MemoryRouter initialEntries={['/account']}><Routes>
            <Route path="/account" element={user ? <AccountPage /> : <Navigate to="/auth/login" replace />} />
            <Route path="/auth/login" element={<LoginView />} />
        </Routes></MemoryRouter>;
}
function submit() {
    fireEvent.change(screen.getAllByLabelText('Current password')[0], { target: { value: 'old-password' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}
it('retains password success after clearing authentication and rendering login', async () => {
    authApi.changePassword.mockResolvedValue({ message: 'Changed' });
    render(<AuthProvider><Harness /></AuthProvider>);
    await screen.findByRole('heading', { name: 'Account' });
    submit();
    expect((await screen.findByRole('status')).textContent).toContain('Password changed successfully. All sessions were ended.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Account' })).toBeNull();
});
it('announces password errors and keeps the account form available', async () => {
    authApi.changePassword.mockRejectedValue(new Error('Current password is incorrect'));
    render(<AuthProvider><Harness /></AuthProvider>);
    await screen.findByRole('heading', { name: 'Account' });
    submit();
    expect((await screen.findByRole('alert')).textContent).toBe('Current password is incorrect');
    expect(screen.getByRole('heading', { name: 'Account' })).toBeTruthy();
});
