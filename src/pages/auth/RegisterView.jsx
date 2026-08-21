import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/contextHooks.js';
import Button from '../../shared/common/Button.jsx';

export default function RegisterView() {
    const { register } = useAuth();
    const navigate     = useNavigate();
    const [searchParams] = useSearchParams();
    const inviteToken = searchParams.get('inviteToken');
    const joinCode = searchParams.get('joinCode');
    const continuation = inviteToken
        ? `?inviteToken=${encodeURIComponent(inviteToken)}`
        : joinCode ? `?joinCode=${encodeURIComponent(joinCode)}` : '';

    const [fields, setFields] = useState({ username: '', fullName: '', email: '', password: '', confirmPassword: '' });
    const [error,  setError]  = useState('');
    const [busy,   setBusy]   = useState(false);

    const handleChange = (e) =>
        setFields(f => ({ ...f, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!fields.username || !fields.fullName || !fields.email || !fields.password || !fields.confirmPassword) {
            setError('Please fill in all fields.');
            return;
        }
        if (fields.password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (fields.password !== fields.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setBusy(true);
        try {
            await register({
                username: fields.username,
                fullName: fields.fullName,
                email: fields.email,
                password: fields.password,
                continuation: inviteToken
                    ? `/clubs/join?token=${encodeURIComponent(inviteToken)}`
                    : joinCode ? `/clubs/join?code=${encodeURIComponent(joinCode)}` : '/dashboard',
            });
            navigate(`/auth/verification-pending?email=${encodeURIComponent(fields.email)}${continuation ? `&${continuation.slice(1)}` : ''}`);
        } catch (err) {
            setError(err.message || 'Registration failed. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="auth-form-wrapper">
            <div className="auth-form-header">
                <h1 className="auth-form-title">Create account</h1>
                <p className="auth-form-subtitle">Start managing your chess club</p>
            </div>

            {error && (
                <div className="auth-error" role="alert">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M8 5v3.5M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="auth-form">
                <div className="auth-field">
                    <label htmlFor="username" className="auth-label">Username</label>
                    <input
                        id="username"
                        name="username"
                        type="text"
                        autoComplete="username"
                        required
                        className="auth-input"
                        placeholder="magnus_carlsen"
                        value={fields.username}
                        onChange={handleChange}
                        disabled={busy}
                    />
                </div>

                <div className="auth-field">
                    <label htmlFor="fullName" className="auth-label">Full name</label>
                    <input id="fullName" name="fullName" type="text" autoComplete="name" required
                        className="auth-input" placeholder="Magnus Carlsen" value={fields.fullName}
                        onChange={handleChange} disabled={busy} />
                </div>

                <div className="auth-field">
                    <label htmlFor="email" className="auth-label">Email</label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        className="auth-input"
                        placeholder="you@example.com"
                        value={fields.email}
                        onChange={handleChange}
                        disabled={busy}
                    />
                </div>

                <div className="auth-field">
                    <label htmlFor="password" className="auth-label">
                        Password
                        <span className="auth-label-hint">min. 8 characters</span>
                    </label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        className="auth-input"
                        placeholder="••••••••"
                        value={fields.password}
                        onChange={handleChange}
                        disabled={busy}
                    />
                </div>

                <div className="auth-field">
                    <label htmlFor="confirmPassword" className="auth-label">Confirm password</label>
                    <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        required
                        className="auth-input"
                        placeholder="••••••••"
                        value={fields.confirmPassword}
                        onChange={handleChange}
                        disabled={busy}
                    />
                </div>

                <Button
                    type="submit"
                    variant="primary"
                    className="auth-submit"
                    loading={busy}
                    disabled={busy}
                >
                    Create account
                </Button>
            </form>

            <p className="auth-switch">
                Already have an account?{' '}
                <Link to={`/auth/login${continuation}`} className="auth-link">Sign in</Link>
            </p>
        </div>
    );
}
