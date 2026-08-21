import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, ClubContext } from './contextHooks.js';
import { clubApi } from '../features/clubs/api/clubApi.js';
import { chooseSelectedClubId, isSelectableClub } from '../features/clubs/clubSelection.js';

const SELECTED_CLUB_KEY_PREFIX = 'cm_selected_club:';

function preferenceKey(userId) {
    return `${SELECTED_CLUB_KEY_PREFIX}${userId}`;
}

export function ClubProvider({ children }) {
    const { user, loading: authLoading } = useAuth();
    const [clubs, setClubs] = useState([]);
    const [selectedClubId, setSelectedClubId] = useState(null);
    const [club, setClub] = useState(null);
    const [membership, setMembership] = useState(null);
    const [linkedPlayer, setLinkedPlayer] = useState(null);
    const [capabilities, setCapabilities] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const requestSequence = useRef(0);
    const selectedClubIdRef = useRef(null);
    const selectedUserIdRef = useRef(null);

    const clearContext = useCallback(() => {
        setClub(null);
        setMembership(null);
        setLinkedPlayer(null);
        setCapabilities({});
    }, []);

    const applyContext = useCallback((data) => {
        setClub(data.club ?? null);
        setMembership(data.membership ?? null);
        setLinkedPlayer(data.linkedPlayer ?? null);
        setCapabilities(data.capabilities ?? {});
    }, []);

    const syncClubs = useCallback(async (preferredId = null) => {
        if (!user) return null;
        const requestId = ++requestSequence.current;
        setLoading(true);
        setError(null);

        try {
            const data = await clubApi.fetchMemberships();
            if (requestSequence.current !== requestId) return null;

            const entries = Array.isArray(data.clubs) ? data.clubs : [];
            const storedId = localStorage.getItem(preferenceKey(user.id));
            const currentId = selectedUserIdRef.current === user.id
                ? selectedClubIdRef.current
                : null;
            const nextClubId = chooseSelectedClubId(entries, {
                preferredId: preferredId || currentId,
                storedId,
            });

            setClubs(entries);
            selectedClubIdRef.current = nextClubId;
            selectedUserIdRef.current = user.id;
            setSelectedClubId(nextClubId);
            clearContext();

            if (!nextClubId) {
                localStorage.removeItem(preferenceKey(user.id));
                return null;
            }

            localStorage.setItem(preferenceKey(user.id), nextClubId);
            const context = await clubApi.fetchContext(nextClubId);
            if (requestSequence.current !== requestId) return null;
            applyContext(context);
            return nextClubId;
        } catch (err) {
            if (requestSequence.current === requestId) {
                clearContext();
                setError(err.message);
            }
            return null;
        } finally {
            if (requestSequence.current === requestId) setLoading(false);
        }
    }, [applyContext, clearContext, user]);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            requestSequence.current += 1;
            selectedClubIdRef.current = null;
            selectedUserIdRef.current = null;
            setClubs([]);
            setSelectedClubId(null);
            clearContext();
            setError(null);
            setLoading(false);
            return;
        }

        syncClubs();
    }, [authLoading, clearContext, syncClubs, user]);

    const selectClub = useCallback(async (clubId) => {
        const entry = clubs.find(item => item.club.id === clubId);
        if (!user || !isSelectableClub(entry)) return false;
        if (clubId === selectedClubIdRef.current && club?.id === clubId) return true;

        const requestId = ++requestSequence.current;
        selectedClubIdRef.current = clubId;
        selectedUserIdRef.current = user.id;
        setSelectedClubId(clubId);
        localStorage.setItem(preferenceKey(user.id), clubId);
        clearContext();
        setLoading(true);
        setError(null);

        try {
            const context = await clubApi.fetchContext(clubId);
            if (requestSequence.current !== requestId) return false;
            applyContext(context);
            return true;
        } catch (err) {
            if (requestSequence.current === requestId) setError(err.message);
            return false;
        } finally {
            if (requestSequence.current === requestId) setLoading(false);
        }
    }, [applyContext, clearContext, club?.id, clubs, user]);

    const refreshClub = useCallback(
        () => syncClubs(selectedClubIdRef.current),
        [syncClubs],
    );
    const activeClubs = useMemo(() => clubs.filter(isSelectableClub), [clubs]);

    return (
        <ClubContext.Provider value={{
            club,
            clubs,
            activeClubs,
            selectedClubId,
            membership,
            linkedPlayer,
            capabilities,
            loading,
            error,
            selectClub,
            refreshClub,
            refreshClubs: syncClubs,
        }}>
            {children}
        </ClubContext.Provider>
    );
}
