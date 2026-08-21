import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../../features/auth/api/authApi.js';
import { isCancelledError } from '../../config/api.js';

export default function VerifyEmailView() {
    const [params] = useSearchParams();
    const [state, setState] = useState({ loading: true, error: '' });
    useEffect(() => {
        const token = params.get('token');
        if (!token) { setState({ loading: false, error: 'Verification token is missing.' }); return; }
        const controller = new AbortController();
        authApi.verifyEmail(token, { signal: controller.signal })
            .then(() => setState({ loading: false, error: '' }))
            .catch(error => {
                if (!isCancelledError(error)) setState({ loading: false, error: error.message });
            });
        return () => controller.abort();
    }, [params]);
    return <div className="auth-form-wrapper">
        <div className="auth-form-header"><h1 className="auth-form-title">Email verification</h1>
            <p className="auth-form-subtitle">{state.loading ? 'Verifying your email…' : state.error || 'Your email is verified.'}</p></div>
        {!state.loading && <p className="auth-switch"><Link className="auth-link" to="/auth/login">Continue to sign in</Link></p>}
    </div>;
}
