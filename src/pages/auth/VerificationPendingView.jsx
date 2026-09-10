import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../../features/auth/api/authApi.js';
import Button from '../../shared/common/Button.jsx';
import { continuationFromParams, continuationQuery } from '../../features/auth/continuation.js';

export default function VerificationPendingView() {
    const [params] = useSearchParams();
    const email = params.get('email') || '';
    const continuation = continuationFromParams(params);
    const authQuery = continuationQuery(continuation);
    const [message, setMessage] = useState('We sent a verification link to your email.');
    const [busy, setBusy] = useState(false);
    async function resend() {
        setBusy(true);
        try {
            const response = await authApi.resendVerification({ email, continuation });
            setMessage(response.message);
        } catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
    }
    return <div className="auth-form-wrapper">
        <div className="auth-form-header"><h1 className="auth-form-title">Verify your email</h1><p className="auth-form-subtitle">{message}</p></div>
        <p className="auth-switch">{email}</p>
        <Button className="auth-submit" loading={busy} disabled={!email} onClick={resend}>Resend verification email</Button>
        <p className="auth-switch"><Link className="auth-link text-link" to={`/auth/login${authQuery}`}>Back to sign in</Link></p>
    </div>;
}
