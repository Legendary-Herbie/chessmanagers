import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers.jsx';
import Button from '../../components/Button.jsx';

const RegisterView = ({ onSwitch }) => {
    const { register } = useAuth();
    const navigate      = useNavigate();

    const [fields, setFields] = useState({ name: '', email: '', password: '' });
    const [error,  setError]  = useState(null);
    const [busy,   setBusy]   = useState(false);

    const handleChange = (e) =>
        setFields(f => ({ ...f, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (fields.password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }

        setBusy(true);
        try {
            await register(fields);
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.error ?? 'Registration failed. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="auth-card">
            <h1>Create account</h1>

            {error && <p className="auth-error" role="alert">{error}</p>}

            <form onSubmit={handleSubmit} noValidate>
                <label htmlFor="name">Name</label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    value={fields.name}
                    onChange={handleChange}
                />

                <label htmlFor="email">Email</label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={fields.email}
                    onChange={handleChange}
                />

                <label htmlFor="password">Password</label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={fields.password}
                    onChange={handleChange}
                />

                <Button type="submit" disabled={busy}>
                    {busy ? 'Creating account…' : 'Create account'}
                </Button>
            </form>

            <p>
                Already have an account?{' '}
                <Button type="button" className="link-btn" onClick={onSwitch}>
                    Sign in
                </Button>
            </p>
        </div>
    );
};

export default RegisterView;