import React, { useRef, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/contextHooks.js';
import Button from '../../shared/common/Button.jsx';
import { authApi } from '../../features/auth/api/authApi.js';
import { continuationFromParams, continuationQuery } from '../../features/auth/continuation.js';

export default function LoginView() {
    const { login, sessionNotice }   = useAuth();
    const navigate    = useNavigate();
    const [searchParams] = useSearchParams();
    const destination = continuationFromParams(searchParams);
    const continuation = continuationQuery(destination);

    const [fields, setFields] = useState({ email: '', password: '' });
    const [error,  setError]  = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [busy,   setBusy]   = useState(false);
    const emailRef = useRef(null);
    const passwordRef = useRef(null);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFields(current => ({ ...current, [name]: value }));
        setFieldErrors(current => ({ ...current, [name]: '' }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const nextErrors = {
            email: fields.email ? '' : 'Enter your email address.',
            password: fields.password ? '' : 'Enter your password.',
        };
        if (nextErrors.email || nextErrors.password) {
            setFieldErrors(nextErrors);
            setError('Please fill in all fields.');
            window.requestAnimationFrame(() => {
                (nextErrors.email ? emailRef : passwordRef).current?.focus();
            });
            return;
        }

        setBusy(true);
        try {
            await login(fields);
            navigate(destination);
        } catch (err) {
            if (err.code === 'EMAIL_VERIFICATION_REQUIRED') {
                navigate(`/auth/verification-pending?email=${encodeURIComponent(fields.email)}${continuation ? `&${continuation.slice(1)}` : ''}`);
                return;
            }
            setError(err.message || 'Login failed. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="auth-form-wrapper">
            <div className="auth-form-header">
                <h1 className="auth-form-title">Welcome back</h1>
                <p className="auth-form-subtitle">Sign in to your account</p>
            </div>

            {sessionNotice === 'passwordChanged' && <div className="success-banner" role="status">Password changed successfully. All sessions were ended. Sign in with your new password.</div>}

            {error && (
                <div id="login-error" className="auth-error" role="alert">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M8 5v3.5M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="auth-form">
                <div className="auth-field">
                    <label htmlFor="email" className="auth-label">Email</label>
                    <input
                        id="email"
                        ref={emailRef}
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        className="auth-input"
                        placeholder="you@example.com"
                        value={fields.email}
                        onChange={handleChange}
                        disabled={busy}
                        aria-invalid={Boolean(fieldErrors.email)}
                        aria-describedby={fieldErrors.email ? 'email-error login-error' : undefined}
                    />
                    {fieldErrors.email && <span id="email-error" className="auth-field-error">{fieldErrors.email}</span>}
                </div>

                <div className="auth-field">
                    <label htmlFor="password" className="auth-label">Password</label>
                    <input
                        id="password"
                        ref={passwordRef}
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        className="auth-input"
                        placeholder="••••••••"
                        value={fields.password}
                        onChange={handleChange}
                        disabled={busy}
                        aria-invalid={Boolean(fieldErrors.password)}
                        aria-describedby={fieldErrors.password ? 'password-error login-error' : undefined}
                    />
                    {fieldErrors.password && <span id="password-error" className="auth-field-error">{fieldErrors.password}</span>}
                </div>

                <Button
                    type="submit"
                    variant="primary"
                    className="auth-submit"
                    loading={busy}
                    disabled={busy}
                >
                    Sign in
                </Button>
                <button type="button" className="auth-google"
                    onClick={() => window.location.assign(authApi.googleStartUrl(destination))}>
                    Continue with Google
                </button>
            </form>

            <p className="auth-switch"><Link to={`/auth/forgot-password${continuation}`} className="auth-link text-link">Forgot your password?</Link></p>

            <p className="auth-switch">
                Don't have an account?{' '}
                <Link to={`/auth/register${continuation}`} className="auth-link text-link">Create one</Link>
            </p>
        </div>
    );
}
