import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers.jsx';
import Button from '../../components/Button.jsx';

const LoginView = ({ onSwitch }) => {
    const { login } = useAuth();
    const navigate   = useNavigate();

    const [fields, setFields] = useState({ email: '', password: '' });
    const [error,  setError]  = useState(null);
    const [busy,   setBusy]   = useState(false);

    const handleChange = (e) =>
        setFields(f => ({ ...f, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            await login(fields);
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.error ?? 'Login failed. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="">
            <h1>Sign in</h1>

            {error && <p className="" role="alert">{error}</p>}

            <form onSubmit={handleSubmit} noValidate>
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
                    autoComplete="current-password"
                    required
                    value={fields.password}
                    onChange={handleChange}
                />

                <Button type="submit" disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign in'}
                </Button>
            </form>

            <p>
                No account?{' '}
                <Button type="button" className="" onClick={onSwitch}>
                    Create one
                </Button>
            </p>
        </div>
    );
};

export default LoginView;