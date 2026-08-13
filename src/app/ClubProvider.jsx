import { useState, useEffect, useCallback } from 'react';
import { useAuth, ClubContext } from './contextHooks.js';
import { api } from '../config/api.js';

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
        api.get('/clubs/mine')
            .then(data => setClub(data.club ?? null))
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [user, authLoading]);

    const refreshClub = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const data = await api.get('/clubs/mine');
            setClub(data.club ?? null);
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
