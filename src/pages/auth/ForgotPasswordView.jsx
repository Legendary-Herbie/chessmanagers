import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../../features/auth/api/authApi.js';
import Button from '../../shared/common/Button.jsx';

export default function ForgotPasswordView() {
    const [params] = useSearchParams();
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const continuation = params.get('inviteToken')
        ? `/clubs/join?token=${encodeURIComponent(params.get('inviteToken'))}`
        : params.get('joinCode') ? `/clubs/join?code=${encodeURIComponent(params.get('joinCode'))}` : '/dashboard';
    async function submit(event) {
        event.preventDefault(); setBusy(true);
        try { setMessage((await authApi.forgotPassword({ email, continuation })).message); }
        catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
    }
    return <div className="auth-form-wrapper"><div className="auth-form-header"><h1 className="auth-form-title">Reset password</h1><p className="auth-form-subtitle">Enter your account email.</p></div>
        {message && <div className="auth-error" role="status">{message}</div>}
        <form className="auth-form" onSubmit={submit}><div className="auth-field"><label className="auth-label" htmlFor="reset-email">Email</label><input id="reset-email" className="auth-input" type="email" required value={email} onChange={event => setEmail(event.target.value)} /></div><Button className="auth-submit" type="submit" loading={busy}>Send reset email</Button></form>
        <p className="auth-switch"><Link className="auth-link" to="/auth/login">Back to sign in</Link></p></div>;
}
