import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider.jsx';
import Button from '../../shared/common/Button.jsx';

export default function RegisterView() {
    const { register } = useAuth();
    const navigate     = useNavigate();

    const [fields, setFields] = useState({ name: '', email: '', password: '', confirmPassword: '' });
    const [error,  setError]  = useState('');
    const [busy,   setBusy]   = useState(false);

    const handleChange = (e) =>
        setFields(f => ({ ...f, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!fields.name || !fields.email || !fields.password || !fields.confirmPassword) {
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
            await register({ name: fields.name, email: fields.email, password: fields.password });
            navigate('/dashboard');
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
                    <label htmlFor="name" className="auth-label">Display name</label>
                    <input
                        id="name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        required
                        className="auth-input"
                        placeholder="Magnus Carlsen"
                        value={fields.name}
                        onChange={handleChange}
                        disabled={busy}
                    />
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
                <Link to="/auth/login" className="auth-link">Sign in</Link>
            </p>
        </div>
    );
}