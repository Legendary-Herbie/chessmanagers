import { useState, useEffect, useCallback, useMemo } from 'react';
import { playerApi } from '../api/playerApi.js';
import { isCancelledError } from '../../../config/api.js';

export function usePlayers(clubId, { includeInactive = false } = {}) {
    const [players, setPlayers] = useState([]);
    const [inactivePlayers, setInactivePlayers] = useState([]);
    const [rosterSummary, setRosterSummary] = useState({
        totalPlayers: 0,
        activePlayers: 0,
        averageRatings: { blitz: null, rapid: null, classical: null },
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Toolbar filtering & sorting state
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'claimed' | 'pending' | 'unlinked'
    const [sortBy, setSortBy] = useState('rating_desc');     // 'rating_desc' | 'rating_asc' | 'name_asc' | 'games_desc' | 'winrate_desc'
    const [viewMode, setViewMode] = useState('grid');       // 'grid' | 'table'

    const fetchPlayers = useCallback(async (signal) => {
        if (!clubId) {
            setPlayers([]);
            setInactivePlayers([]);
            setRosterSummary({
                totalPlayers: 0,
                activePlayers: 0,
                averageRatings: { blitz: null, rapid: null, classical: null },
            });
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [data, inactive, summary] = await Promise.all([
                playerApi.fetchPlayers(clubId, { q: searchTerm, limit: 100, signal }),
                includeInactive ? playerApi.fetchInactivePlayers(clubId, { signal }) : Promise.resolve([]),
                playerApi.fetchRosterSummary(clubId, { signal }),
            ]);
            if (signal?.aborted) return;
            setPlayers(data);
            setInactivePlayers(inactive);
            setRosterSummary(summary);
            setError(null);
        } catch (err) {
            if (signal?.aborted || isCancelledError(err)) return;
            console.error('Failed to fetch players:', err);
            setError(err.message || 'Unable to load players roster.');
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [clubId, includeInactive, searchTerm]);

    useEffect(() => {
        const controller = new AbortController();
        fetchPlayers(controller.signal);
        return () => controller.abort();
    }, [clubId, fetchPlayers]);

    // Single Add Player
    const addPlayer = async ({ name, startRatings, bio }) => {
        if (!clubId) return;
        const newPlayer = await playerApi.createPlayer(clubId, { name, startRatings, bio });
        setPlayers((prev) => [newPlayer, ...prev]);
        return newPlayer;
    };

    // Atomic Bulk Add Players
    const addPlayersBulk = async (playersList) => {
        if (!clubId) return;
        const created = await playerApi.createPlayersBulk(clubId, playersList);
        setPlayers((prev) => [...created, ...prev]);
        return created;
    };

    // Update Player
    const updatePlayer = async (playerId, { name, bio }) => {
        if (!clubId) return;
        const updated = await playerApi.updatePlayer(clubId, playerId, { name, bio });
        setPlayers((prev) =>
            prev.map((p) => (p.id === playerId ? { ...p, ...updated } : p))
        );
        return updated;
    };

    const archivePlayer = async (playerId) => {
        if (!clubId) return;
        const archived = await playerApi.archivePlayer(clubId, playerId);
        setPlayers((prev) => prev.filter((p) => p.id !== playerId));
        setInactivePlayers((prev) => [...prev, archived].sort((a, b) => a.name.localeCompare(b.name)));
    };

    const restorePlayer = async (playerId) => {
        if (!clubId) return;
        await playerApi.restorePlayer(clubId, playerId);
        await fetchPlayers();
    };

    // Claim Player Profile
    const claimPlayer = async (playerId) => {
        if (!clubId) return;
        await playerApi.claimPlayer(clubId, playerId);
        fetchPlayers(); // Refresh link status
    };

    // Unlink Player
    const unlinkPlayer = async (playerId) => {
        if (!clubId) return;
        await playerApi.unlinkPlayer(clubId, playerId);
        fetchPlayers();
    };

    // Process Search, Filtering, and Sorting
    const processedPlayers = useMemo(() => {
        let result = [...players];

        if (statusFilter === 'claimed') {
            result = result.filter((p) => p.link_status === 'approved');
        } else if (statusFilter === 'pending') {
            result = result.filter((p) => p.link_status === 'pending');
        } else if (statusFilter === 'unlinked') {
            result = result.filter((p) => !p.link_status || p.link_status === 'none');
        }

        result.sort((a, b) => {
            if (sortBy === 'rating_desc') return (b.rating || 1500) - (a.rating || 1500);
            if (sortBy === 'rating_asc') return (a.rating || 1500) - (b.rating || 1500);
            if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
            if (sortBy === 'games_desc') return (b.games || 0) - (a.games || 0);
            if (sortBy === 'winrate_desc') {
                const wrA = a.games > 0 ? (a.wins + (a.draws || 0) * 0.5) / a.games : 0;
                const wrB = b.games > 0 ? (b.wins + (b.draws || 0) * 0.5) / b.games : 0;
                return wrB - wrA;
            }
            return 0;
        });

        return result;
    }, [players, statusFilter, sortBy]);

    return {
        players,
        inactivePlayers,
        processedPlayers,
        stats: rosterSummary,
        loading,
        error,
        searchTerm,
        setSearchTerm,
        statusFilter,
        setStatusFilter,
        sortBy,
        setSortBy,
        viewMode,
        setViewMode,
        refetch: fetchPlayers,
        addPlayer,
        addPlayersBulk,
        updatePlayer,
        archivePlayer,
        restorePlayer,
        claimPlayer,
        unlinkPlayer,
    };
}
