import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/contextHooks.js';
import { safeContinuation } from '../../features/auth/continuation.js';

export default function OAuthCallbackView() {
    const { establishSession } = useAuth();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const startedRef = useRef(false);
    const oauthError = params.get('error');
    const continuation = params.get('continuation');

    useEffect(() => {
        if (oauthError) {
            const messages = {
                oauth_cancelled: 'Google sign-in was cancelled.',
                OAUTH_STATE_INVALID: 'This Google sign-in attempt expired. Please try again.',
                GOOGLE_OAUTH_NOT_CONFIGURED: 'Google sign-in is temporarily unavailable.',
            };
            setError(messages[oauthError] || 'Google sign-in was not completed.');
            return;
        }
        if (startedRef.current) return;
        startedRef.current = true;
        establishSession().then(() => navigate(safeContinuation(continuation), { replace: true }))
            .catch(requestError => setError(requestError.message || 'Google sign-in failed.'));
    }, [continuation, establishSession, navigate, oauthError]);
    return <div className="auth-form-wrapper"><div className="auth-form-header"><h1 className="auth-form-title">Google sign-in</h1><p className="auth-form-subtitle">{error || 'Completing your session…'}</p></div>{error && <p className="auth-switch"><Link className="auth-link text-link" to="/auth/login">Back to sign in</Link></p>}</div>;
}
