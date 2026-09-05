import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../../features/auth/api/authApi.js';
import { continuationFromParams, continuationQuery } from '../../features/auth/continuation.js';

export default function VerifyEmailView() {
    const [params] = useSearchParams();
    const [state, setState] = useState({ loading: true, message: '', isError: false });

    const token = params.get('token');
    const continuation = continuationFromParams(params);
    const loginTarget = `/auth/login${continuationQuery(continuation)}`;

    useEffect(() => {
        if (!token) {
            setState({ loading: false, message: 'Invalid verification link', isError: true });
            return;
        }

        let active = true;

        authApi.verifyEmail(token)
            .then(() => {
                if (!active) return;
                setState({ loading: false, message: 'Your email is verified. Your account is ready.', isError: false });
            })
            .catch(error => {
                if (!active) return;
                setState({
                    loading: false,
                    message: error?.message || 'Invalid verification link',
                    isError: true,
                });
            });

        return () => {
            active = false;
        };
    }, [token]);

    return (
        <div className="auth-form-wrapper">
            <div className="auth-form-header">
                <h1 className="auth-form-title">{state.loading ? 'Email verification' : state.isError ? 'We could not verify this link' : 'Verification complete'}</h1>
                <p className="auth-form-subtitle">
                    {state.loading ? 'Verifying your email…' : state.message}
                </p>
            </div>
            {!state.loading && (
                <p className="auth-switch">
                    <Link className="auth-link" to={loginTarget}>
                        {state.isError ? 'Back to sign in' : 'Continue to sign in'}
                    </Link>
                </p>
            )}
        </div>
    );
}
