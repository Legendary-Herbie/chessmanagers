import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, getToken, setToken, clearToken } from '../config/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser]       = useState(null);
    const [loading, setLoading] = useState(true);

    // On mount: validate stored JWT against the server.
    useEffect(() => {
        const token = getToken();
        if (!token) { setLoading(false); return; }

        api.get('/auth/me')
            .then(data => setUser(data.user))
            .catch(() => clearToken())
            .finally(() => setLoading(false));
    }, []);

    const login = useCallback(async ({ email, password }) => {
        const data = await api.post('/auth/login', { email, password });
        setToken(data.token);
        setUser(data.user);
        return data.user;
    }, []);

    const register = useCallback(async ({ email, name, password }) => {
        const data = await api.post('/auth/register', { email, name, password });
        setToken(data.token);
        setUser(data.user);
        return data.user;
    }, []);

    const logout = useCallback(() => {
        clearToken();
        setUser(null);
    }, []);

    const isAdmin  = user?.role === 'admin';
    const isLinked = user?.linkStatus === 'approved';

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout, isAdmin, isLinked }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}