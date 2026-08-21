import { useState, useEffect, useCallback } from 'react';
import { playerApi } from '../api/playerApi.js';

export function usePlayerLinks(clubId) {
    const [pendingLinks, setPendingLinks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchPendingLinks = useCallback(async () => {
        if (!clubId) return;
        setLoading(true);
        try {
            const links = await playerApi.fetchPendingLinks(clubId);
            setPendingLinks(links);
            setError(null);
        } catch (err) {
            console.error('Failed to fetch pending links:', err);
            setError(err.message || 'Unable to load pending link requests.');
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => {
        if (clubId) {
            fetchPendingLinks();
        }
    }, [clubId, fetchPendingLinks]);

    const approveLink = async (linkId) => {
        if (!clubId) return;
        await playerApi.approveLink(clubId, linkId);
        setPendingLinks((prev) => prev.filter((l) => l.id !== linkId));
    };

    const rejectLink = async (linkId, reason = null) => {
        if (!clubId) return;
        await playerApi.rejectLink(clubId, linkId, reason);
        setPendingLinks((prev) => prev.filter((l) => l.id !== linkId));
    };

    return {
        pendingLinks,
        loading,
        error,
        refetch: fetchPendingLinks,
        approveLink,
        rejectLink,
    };
}
