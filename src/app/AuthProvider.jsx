import { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Shape of `user`:
// {
//   id: string,
//   email: string,
//   name: string,
//   role: 'admin' | 'linked_player' | 'member',
//   playerId: string | null,
//   linkStatus: 'pending' | 'approved' | null,
// }

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser]       = useState(null);
    const [loading, setLoading] = useState(true);

    // On mount: validate stored JWT against the server.
    // If the token is missing or rejected, clear it and stay logged out.
    useEffect(() => {
        const token = localStorage.getItem('cm_token');
        if (!token) { setLoading(false); return; }

        fetch('/api/v1/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => setUser(data.user))
            .catch(() => localStorage.removeItem('cm_token'))
            .finally(() => setLoading(false));
    }, []);

    const login = useCallback(async (email, password) => {
        const res = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Login failed.');
        }
        const { token, user } = await res.json();
        localStorage.setItem('cm_token', token);
        setUser(user);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('cm_token');
        setUser(null);
    }, []);

    const isAdmin  = user?.role === 'admin';
    const isLinked = user?.linkStatus === 'approved';

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isLinked }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}