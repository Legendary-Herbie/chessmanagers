import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { loginSchema, registerSchema, safeValidate } from '../utils/validation';
import AuthLayout from 'AuthLayout';
import LoginView from 'LoginView';
import RegisterView from 'RegisterView';
import ResetView from 'ResetView';

export default function AuthPage({ mode = 'login' }) {
    const [isLogin, setIsLogin] = useState(mode !== 'register');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // For Reset flow
    const [showResetForm, setShowResetForm] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);
    const [resetMessage, setResetMessage] = useState('');

    const { login, register, requestPasswordReset } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        setIsLogin(mode !== 'register');
    }, [mode]);

    const handleLoginSubmit = async (data) => {
        setError('');
        const validation = safeValidate(loginSchema, data);
        if (!validation.success) {
            setError(validation.error[0].message);
            return;
        }

        setLoading(true);
        try {
            await login(data.username, data.password);
            navigate('/');
        } catch (err) {
            const rawMessage = String(err?.message || '');
            const normalizedMessage = rawMessage.toLowerCase();
            const isInvalidLogin =
                err?.name === 'UnauthorizedError' ||
                rawMessage.includes('401') ||
                normalizedMessage.includes('unauthorized') ||
                normalizedMessage.includes('invalid credentials');

            let msg = rawMessage;
            if (isInvalidLogin) {
                msg = "Invalid username/email or password. Please try again.";
            } else if (normalizedMessage.includes('session') || normalizedMessage.includes('expired')) {
                msg = "Invalid credentials or session issue. Please sign in again.";
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleRegisterSubmit = async (data) => {
        setError('');
        const validation = safeValidate(registerSchema, data);
        if (!validation.success) {
            setError(validation.error[0].message);
            return;
        }

        setLoading(true);
        try {
            await register(data.username, data.email, data.password);
            navigate('/');
        } catch (err) {
            setError(err?.message || 'Failed to register');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (email) => {
        setError('');
        setResetMessage('');
        setResetLoading(true);

        try {
            const data = await requestPasswordReset(email);
            setResetMessage(
                data?.message || 'If an account exists, a password reset link has been sent.'
            );
        } catch (err) {
            setError(err?.message || 'Failed to request password reset.');
        } finally {
            setResetLoading(false);
        }
    };

    const toggleMode = () => {
        const nextIsLogin = !isLogin;
        setIsLogin(nextIsLogin);
        setError('');
        setResetMessage('');
        setShowResetForm(false);
        navigate(nextIsLogin ? '/login' : '/register');
    };

    if (showResetForm) {
        return (
            <AuthLayout
                subtitle="Reset your password"
                error={error}
            >
                <ResetView
                    onReset={handleResetPassword}
                    loading={resetLoading}
                    resetMessage={resetMessage}
                    onBack={() => {
                        setShowResetForm(false);
                        setError('');
                    }}
                />
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            subtitle={isLogin ? 'Professional rating tracking starts here.' : 'Create an account to start managing your clubs.'}
            error={error}
        >
            {isLogin ? (
                <LoginView
                    onSubmit={handleLoginSubmit}
                    loading={loading}
                    onToggleMode={toggleMode}
                    onForgot={() => setShowResetForm(true)}
                />
            ) : (
                <RegisterView
                    onSubmit={handleRegisterSubmit}
                    loading={loading}
                    onToggleMode={toggleMode}
                />
            )}
        </AuthLayout>
    );
}
