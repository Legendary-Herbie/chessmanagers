import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../../features/auth/api/authApi.js';
import Button from '../../shared/common/Button.jsx';
import { continuationFromParams, continuationQuery } from '../../features/auth/continuation.js';

export default function ResetPasswordView() {
    const [params] = useSearchParams();
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [message, setMessage] = useState('');
    const [complete, setComplete] = useState(false);
    const [busy, setBusy] = useState(false);
    const continuation = continuationFromParams(params);
    const authQuery = continuationQuery(continuation);
    async function submit(event) {
        event.preventDefault();
        if (password !== confirmation) { setMessage('Passwords do not match.'); return; }
        setBusy(true);
        try { setMessage((await authApi.resetPassword({ token: params.get('token'), password })).message); setComplete(true); }
        catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
    }
    return <div className="auth-form-wrapper"><div className="auth-form-header"><h1 className="auth-form-title">Choose a new password</h1><p className="auth-form-subtitle">Use at least eight characters.</p></div>
        {message && <div className="auth-error" role="status">{message}</div>}
        {!complete && <form className="auth-form" onSubmit={submit}><div className="auth-field"><label className="auth-label" htmlFor="new-password">New password</label><input id="new-password" className="auth-input" type="password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} /></div><div className="auth-field"><label className="auth-label" htmlFor="confirm-new-password">Confirm password</label><input id="confirm-new-password" className="auth-input" type="password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div><Button className="auth-submit" type="submit" loading={busy}>Reset password</Button></form>}
        {complete && <p className="auth-switch"><Link className="auth-link" to={`/auth/login${authQuery}`}>Sign in</Link></p>}</div>;
}
