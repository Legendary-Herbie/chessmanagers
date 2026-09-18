import ToggleSwitch from '../../shared/common/ToggleSwitch.jsx';
import { useChessSummaryPreference } from '../../shared/hooks/useChessSummaryPreference.js';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/contextHooks.js';
import { authApi } from '../../features/auth/api/authApi.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Icon from '../../shared/common/Icon.jsx';
import Button from '../../shared/common/Button.jsx';
import '../../styles/account.css';

export default function AccountPage() {
    const { user, logout } = useAuth();
    const [showSummary, setShowSummary] = useChessSummaryPreference();
    const navigate = useNavigate();
    const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
    const [deletion, setDeletion] = useState({ confirmation: '', currentPassword: '', reason: '' });
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    async function changePassword(event) {
        event.preventDefault(); setBusy(true); setMessage('');
        try {
            await authApi.changePassword(passwords);
            await logout(false, 'passwordChanged');
            navigate('/auth/login', { replace: true });
        } catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
    }
    async function logoutAll() {
        setBusy(true);
        try { await authApi.logoutAll(); await logout(false, 'sessionsEnded'); navigate('/auth/login', { replace: true }); }
        catch (error) { setMessage(error.message); setBusy(false); }
    }
    async function deleteAccount(event) {
        event?.preventDefault(); setBusy(true); setMessage('');
        try { await authApi.deleteAccount({ ...deletion, reason: deletion.reason || null }); await logout(false); navigate('/', { replace: true }); }
        catch (error) { setMessage(error.message); setBusy(false); }
    }
    return <div className="account-page"><div className="page-header"><div><h1>Account</h1><p className="muted">{user.fullName || user.name} · @{user.username}</p></div></div>
        {message && <div className="error" role="alert">{message}</div>}
        <section className="settings-card"><h2><Icon name="players" />Account profile</h2><span className="account-member-badge">Registered member</span><dl className="account-profile"><div><dt>Name</dt><dd>{user.fullName || user.name}</dd></div><div><dt>Username</dt><dd>@{user.username}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div></dl></section>
        <section className="settings-card"><h2><Icon name="settings" />Dashboard preferences</h2><ToggleSwitch label="Show My Chess Summary" description="Show your ratings and upcoming pairings on the dashboard. Saved for your account in this browser." checked={showSummary} onChange={setShowSummary} /></section>
        <section className="settings-card"><h2><Icon name="clubs" />Password &amp; security</h2><form className="form-card" onSubmit={changePassword}><label className="form-row"><span className="label">Current password</span><input className="input" type="password" autoComplete="current-password" required value={passwords.currentPassword} onChange={event => setPasswords({ ...passwords, currentPassword: event.target.value })} /></label><label className="form-row"><span className="label">New password</span><input className="input" type="password" autoComplete="new-password" aria-describedby="password-hint" minLength={8} required value={passwords.newPassword} onChange={event => setPasswords({ ...passwords, newPassword: event.target.value })} /></label><p id="password-hint" className="muted">Use at least 8 characters. Changing your password signs out all sessions.</p><Button type="submit" loading={busy}>Change password</Button></form></section>
        <section className="settings-card"><h2><Icon name="clock" />Active sessions</h2><p className="muted">Sign out every browser and device connected to this account.</p><Button variant="secondary" disabled={busy} onClick={logoutAll}>Sign out everywhere</Button></section>
        <section className="settings-card danger-zone"><h2><Icon name="warning" />Danger zone</h2><p className="muted">Your account will be disabled while historical club and chess records are preserved.</p><Button variant="danger" disabled={busy} onClick={() => { setDeletion({ confirmation: '', currentPassword: '', reason: '' }); setMessage(''); setDeleteOpen(true); }}>Delete account…</Button>
        <ConfirmDialog isOpen={deleteOpen} title="Confirm account deletion" variant="danger" loading={busy} onClose={() => setDeleteOpen(false)} message="Your account will be disabled and you will be signed out. Historical club and chess records will remain." confirmLabel="Delete account" confirmDisabled={deletion.confirmation !== 'DELETE'} onConfirm={deleteAccount} error={message}><label className="form-row"><span className="label">Current password</span><input className="input" type="password" value={deletion.currentPassword} onChange={event => setDeletion({ ...deletion, currentPassword: event.target.value })} /></label><label className="form-row"><span className="label">Type DELETE to confirm</span><input className="input" required value={deletion.confirmation} onChange={event => setDeletion({ ...deletion, confirmation: event.target.value })} /></label><label className="form-row"><span className="label">Reason (optional)</span><textarea className="input" value={deletion.reason} onChange={event => setDeletion({ ...deletion, reason: event.target.value })} /></label></ConfirmDialog></section>
    </div>;
}
