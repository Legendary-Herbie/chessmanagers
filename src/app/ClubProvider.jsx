import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthProvider.jsx';

// Holds the active club's metadata. Fetched once after auth resolves.
// Consumed by leaderboard, match, and player features.
//
// Shape of `club`:
// {
//   id: string,
//   name: string,
//   description: string | null,
//   logo: string | null,
// }

const ClubContext = createContext(null);

export function ClubProvider({ children }) {
    const { user, loading: authLoading } = useAuth();
    const [club, setClub]       = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState(null);

    useEffect(() => {
        if (authLoading || !user) {
            setClub(null);
            return;
        }

        setLoading(true);
        const token = localStorage.getItem('cm_token');

        fetch('/api/v1/clubs/mine', {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load club.')))
            .then(data => setClub(data.club))
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [user, authLoading]);

    const refreshClub = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const token = localStorage.getItem('cm_token');
        try {
            const res  = await fetch('/api/v1/clubs/mine', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setClub(data.club);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [user]);

    return (
        <ClubContext.Provider value={{ club, loading, error, refreshClub }}>
            {children}
        </ClubContext.Provider>
    );
}

export function useClub() {
    const ctx = useContext(ClubContext);
    if (!ctx) throw new Error('useClub must be used within ClubProvider');
    return ctx;
}