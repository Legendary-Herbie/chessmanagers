import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/contextHooks.js';
import Button from '../../shared/common/Button.jsx';

export default function LoginView() {
    const { login }   = useAuth();
    const navigate    = useNavigate();
    const [searchParams] = useSearchParams();
    const inviteToken = searchParams.get('inviteToken');

    const [fields, setFields] = useState({ email: '', password: '' });
    const [error,  setError]  = useState('');
    const [busy,   setBusy]   = useState(false);

    const handleChange = (e) =>
        setFields(f => ({ ...f, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!fields.email || !fields.password) {
            setError('Please fill in all fields.');
            return;
        }

        setBusy(true);
        try {
            await login(fields);
            navigate(inviteToken ? `/clubs/join?token=${encodeURIComponent(inviteToken)}` : '/dashboard');
        } catch (err) {
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
                    <label htmlFor="password" className="auth-label">Password</label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        className="auth-input"
                        placeholder="••••••••"
                        value={fields.password}
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
                    Sign in
                </Button>
            </form>

            <p className="auth-switch">
                Don't have an account?{' '}
                <Link to={inviteToken ? `/auth/register?inviteToken=${encodeURIComponent(inviteToken)}` : '/auth/register'} className="auth-link">Create one</Link>
            </p>
        </div>
    );
}
