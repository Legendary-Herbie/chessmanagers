import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/contextHooks.js';

export default function OAuthCallbackView() {
    const { establishSession } = useAuth();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    useEffect(() => {
        if (params.get('error')) { setError('Google sign-in was not completed.'); return; }
        establishSession().then(() => navigate(params.get('continuation') || '/dashboard', { replace: true }))
            .catch(requestError => setError(requestError.message || 'Google sign-in failed.'));
    }, [establishSession, navigate, params]);
    return <div className="auth-form-wrapper"><div className="auth-form-header"><h1 className="auth-form-title">Google sign-in</h1><p className="auth-form-subtitle">{error || 'Completing your session…'}</p></div>{error && <p className="auth-switch"><Link className="auth-link" to="/auth/login">Back to sign in</Link></p>}</div>;
}
