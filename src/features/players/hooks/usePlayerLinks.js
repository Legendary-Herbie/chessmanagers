import { useState, useEffect, useCallback, useRef } from 'react';
import { playerApi } from '../api/playerApi.js';

export function usePlayerLinks(clubId) {
    const [pendingLinks, setPendingLinks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const version = useRef(0);
    const pending = useRef(false);

    const fetchPendingLinks = useCallback(async () => {
        if (!clubId || pending.current) return;
        const request = ++version.current;
        setLoading(true);
        try {
            const links = await playerApi.fetchPendingLinks(clubId);
            if (request !== version.current) return;
            setPendingLinks(links);
            setError(null);
        } catch (err) {
            if (request !== version.current) return;
            console.error('Failed to fetch pending links:', err);
            setError(err.message || 'Unable to load pending link requests.');
        } finally {
            if (request === version.current) setLoading(false);
        }
    }, [clubId]);

    useEffect(() => {
        if (clubId) {
            fetchPendingLinks();
        }
        const generation = version;
        return () => { generation.current++; };
    }, [clubId, fetchPendingLinks]);

    const mutate = async (linkId, request) => {
        if (!clubId || pending.current) return;
        pending.current = true;
        const token = ++version.current;
        const before = pendingLinks;
        setPendingLinks(current => current.filter(link => link.id !== linkId));
        try { await request(); }
        catch (err) { if (token === version.current) setPendingLinks(before); throw err; }
        finally { pending.current = false; }
    };
    const approveLink = linkId => mutate(linkId, () => playerApi.approveLink(clubId, linkId));
    const rejectLink = (linkId, reason = null) => mutate(linkId, () => playerApi.rejectLink(clubId, linkId, reason));

    return {
        pendingLinks,
        loading,
        error,
        refetch: fetchPendingLinks,
        approveLink,
        rejectLink,
    };
}
