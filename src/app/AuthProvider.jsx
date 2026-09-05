import React, { useState, useEffect, useCallback } from 'react';
import { getToken, setToken, setCsrfToken, clearToken, refreshAccessToken } from '../config/api.js';
import { authApi } from '../features/auth/api/authApi.js';
import { AuthContext } from './contextHooks.js';

export function AuthProvider({ children }) {
    const [user, setUser]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [sessionNotice, setSessionNotice] = useState(null);

    // On mount: validate stored JWT against the server.
    useEffect(() => {
        let active = true;
        const hydrate = async () => {
            try {
                if (!getToken()) {
                    const refreshed = await refreshAccessToken();
                    if (active) setUser(refreshed.user);
                } else {
                    const data = await authApi.me();
                    if (active) setUser(data.user);
                }
            } catch {
                clearToken();
            } finally {
                if (active) setLoading(false);
            }
        };
        void hydrate();
        return () => { active = false; };
    }, []);

    const login = useCallback(async ({ email, password }) => {
        const data = await authApi.login({ email, password });
        setToken(data.accessToken);
        setCsrfToken(data.csrfToken);
        setSessionNotice(null);
        setUser(data.user);
        return data.user;
    }, []);

    const register = useCallback(async (payload) => {
        return authApi.register(payload);
    }, []);

    const logout = useCallback(async (revokeServer = true, notice = null) => {
        if (revokeServer) {
            try { await authApi.logout(); } catch { /* local logout still succeeds */ }
        }
        clearToken();
        setSessionNotice(notice);
        setUser(null);
    }, []);

    const establishSession = useCallback(async () => {
        const data = await refreshAccessToken();
        setSessionNotice(null);
        setUser(data.user);
        return data.user;
    }, []);

    // Call this after any server action that returns a new token + user object
    // (e.g. creating a club promotes the user to admin).
    const updateSession = useCallback((token, freshUser) => {
        setToken(token);
        setSessionNotice(null);
        setUser(freshUser);
    }, []);

    return (
        <AuthContext.Provider value={{
            user, loading, sessionNotice, login, register, logout, updateSession, establishSession,
        }}>
            {children}
        </AuthContext.Provider>
    );
}
