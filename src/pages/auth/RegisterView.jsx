import React, { useRef, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/contextHooks.js';
import Button from '../../shared/common/Button.jsx';
import { continuationFromParams, continuationQuery } from '../../features/auth/continuation.js';
import { getFieldErrors, isValidationError } from '../../config/api.js';

const FIELD_ORDER = ['username', 'fullName', 'email', 'password', 'confirmPassword'];

function validateRegistration(fields) {
    const errors = {};
    if (!fields.username.trim()) errors.username = 'Enter a username.';
    else if (!/^[A-Za-z0-9_]{3,30}$/.test(fields.username.trim())) {
        errors.username = 'Use 3–30 letters, numbers, or underscores.';
    }
    if (!fields.fullName.trim()) errors.fullName = 'Enter your full name.';
    if (!fields.email.trim()) errors.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
        errors.email = 'Enter a valid email address.';
    }
    if (!fields.password) errors.password = 'Create a password.';
    else if (fields.password.length < 8) errors.password = 'Use at least 8 characters.';
    if (!fields.confirmPassword) errors.confirmPassword = 'Confirm your password.';
    else if (fields.password !== fields.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    return errors;
}

export default function RegisterView() {
    const { register } = useAuth();
    const navigate     = useNavigate();
    const [searchParams] = useSearchParams();
    const destination = continuationFromParams(searchParams);
    const continuation = continuationQuery(destination);

    const [fields, setFields] = useState({ username: '', fullName: '', email: '', password: '', confirmPassword: '' });
    const [error,  setError]  = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [busy,   setBusy]   = useState(false);
    const fieldRefs = useRef({});

    const handleChange = (e) => {
        const field = e.target.name;
        setFields(f => ({ ...f, [e.target.name]: e.target.value }));
        setFieldErrors(current => ({ ...current, [field]: '' }));
    };

    const focusFirstError = errors => {
        const first = FIELD_ORDER.find(field => errors[field]);
        window.requestAnimationFrame(() => fieldRefs.current[first]?.focus());
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const nextErrors = validateRegistration(fields);
        if (Object.keys(nextErrors).length) {
            setFieldErrors(nextErrors);
            setError('Check the highlighted fields.');
            focusFirstError(nextErrors);
            return;
        }

        setBusy(true);
        try {
            const normalizedEmail = fields.email.trim();
            await register({
                username: fields.username.trim(),
                fullName: fields.fullName.trim(),
                email: normalizedEmail,
                password: fields.password,
                continuation: destination,
            });
            navigate(`/auth/verification-pending?email=${encodeURIComponent(normalizedEmail)}${continuation ? `&${continuation.slice(1)}` : ''}`);
        } catch (err) {
            if (isValidationError(err)) {
                const serverErrors = getFieldErrors(err);
                setFieldErrors(serverErrors);
                setError('Check the highlighted fields.');
                focusFirstError(serverErrors);
                return;
            }
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
                <div id="register-error" className="auth-error" role="alert">
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
                        ref={element => { fieldRefs.current.username = element; }}
                        name="username"
                        type="text"
                        autoComplete="username"
                        required
                        className="auth-input"
                        placeholder="magnus_carlsen"
                        value={fields.username}
                        onChange={handleChange}
                        disabled={busy}
                        aria-invalid={Boolean(fieldErrors.username)}
                        aria-describedby={fieldErrors.username ? 'register-username-error register-error' : undefined}
                    />
                    {fieldErrors.username && <span id="register-username-error" className="auth-field-error">{fieldErrors.username}</span>}
                </div>

                <div className="auth-field">
                    <label htmlFor="fullName" className="auth-label">Full name</label>
                    <input id="fullName" ref={element => { fieldRefs.current.fullName = element; }} name="fullName" type="text" autoComplete="name" required
                        className="auth-input" placeholder="Magnus Carlsen" value={fields.fullName}
                        onChange={handleChange} disabled={busy}
                        aria-invalid={Boolean(fieldErrors.fullName)}
                        aria-describedby={fieldErrors.fullName ? 'register-fullName-error register-error' : undefined} />
                    {fieldErrors.fullName && <span id="register-fullName-error" className="auth-field-error">{fieldErrors.fullName}</span>}
                </div>

                <div className="auth-field">
                    <label htmlFor="email" className="auth-label">Email</label>
                    <input
                        id="email"
                        ref={element => { fieldRefs.current.email = element; }}
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
                        aria-describedby={fieldErrors.email ? 'register-email-error register-error' : undefined}
                    />
                    {fieldErrors.email && <span id="register-email-error" className="auth-field-error">{fieldErrors.email}</span>}
                </div>

                <div className="auth-field">
                    <label htmlFor="password" className="auth-label">
                        Password
                        <span className="auth-label-hint">min. 8 characters</span>
                    </label>
                    <input
                        id="password"
                        ref={element => { fieldRefs.current.password = element; }}
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
                        aria-invalid={Boolean(fieldErrors.password)}
                        aria-describedby={fieldErrors.password ? 'register-password-error register-error' : undefined}
                    />
                    {fieldErrors.password && <span id="register-password-error" className="auth-field-error">{fieldErrors.password}</span>}
                </div>

                <div className="auth-field">
                    <label htmlFor="confirmPassword" className="auth-label">Confirm password</label>
                    <input
                        id="confirmPassword"
                        ref={element => { fieldRefs.current.confirmPassword = element; }}
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        required
                        className="auth-input"
                        placeholder="••••••••"
                        value={fields.confirmPassword}
                        onChange={handleChange}
                        disabled={busy}
                        aria-invalid={Boolean(fieldErrors.confirmPassword)}
                        aria-describedby={fieldErrors.confirmPassword ? 'register-confirmPassword-error register-error' : undefined}
                    />
                    {fieldErrors.confirmPassword && <span id="register-confirmPassword-error" className="auth-field-error">{fieldErrors.confirmPassword}</span>}
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
