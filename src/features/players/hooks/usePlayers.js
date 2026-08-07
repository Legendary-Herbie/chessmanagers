import { useState, useEffect, useCallback, useMemo } from 'react';
import { playerApi } from '../api/playerApi.js';

export function usePlayers(clubId) {
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Toolbar filtering & sorting state
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'claimed' | 'pending' | 'unlinked'
    const [sortBy, setSortBy] = useState('rating_desc');     // 'rating_desc' | 'rating_asc' | 'name_asc' | 'games_desc' | 'winrate_desc'
    const [viewMode, setViewMode] = useState('grid');       // 'grid' | 'table'

    const fetchPlayers = useCallback(async () => {
        if (!clubId) return;
        setLoading(true);
        try {
            const data = await playerApi.fetchPlayers(clubId);
            setPlayers(data);
            setError(null);
        } catch (err) {
            console.error('Failed to fetch players:', err);
            setError(err.message || 'Unable to load players roster.');
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => {
        if (clubId) {
            fetchPlayers();
        }
    }, [clubId, fetchPlayers]);

    // Single Add Player
    const addPlayer = async ({ name, rating, bio }) => {
        if (!clubId) return;
        const newPlayer = await playerApi.createPlayer(clubId, { name, rating, bio });
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

    // Delete Player
    const deletePlayer = async (playerId) => {
        if (!clubId) return;
        await playerApi.deletePlayer(clubId, playerId);
        setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    };

    // Claim Player Profile
    const claimPlayer = async (playerId) => {
        if (!clubId) return;
        await playerApi.claimPlayer(clubId, playerId);
        fetchPlayers(); // Refresh link status
    };

    // Unlink Player
    const unlinkPlayer = async (playerId, userId) => {
        if (!clubId) return;
        await playerApi.unlinkPlayer(clubId, playerId, userId);
        fetchPlayers();
    };

    // Process Search, Filtering, and Sorting
    const processedPlayers = useMemo(() => {
        let result = [...players];

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            result = result.filter(
                (p) =>
                    p.name?.toLowerCase().includes(term) ||
                    p.bio?.toLowerCase().includes(term)
            );
        }

        if (statusFilter === 'claimed') {
            result = result.filter((p) => p.link_status === 'approved');
        } else if (statusFilter === 'pending') {
            result = result.filter((p) => p.link_status === 'pending');
        } else if (statusFilter === 'unlinked') {
            result = result.filter((p) => !p.link_status || p.link_status === 'none');
        }

        result.sort((a, b) => {
            if (sortBy === 'rating_desc') return (b.rating || 1200) - (a.rating || 1200);
            if (sortBy === 'rating_asc') return (a.rating || 1200) - (b.rating || 1200);
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
    }, [players, searchTerm, statusFilter, sortBy]);

    // Derived Statistics
    const stats = useMemo(() => {
        const totalPlayers = players.length;
        const avgRating = totalPlayers > 0
            ? Math.round(players.reduce((sum, p) => sum + (p.rating || 1200), 0) / totalPlayers)
            : 1200;
        const activePlayers = players.filter((p) => (p.games || 0) > 0).length;
        const pendingClaimsCount = players.filter((p) => p.link_status === 'pending').length;

        return {
            totalPlayers,
            avgRating,
            activePlayers,
            pendingClaimsCount,
        };
    }, [players]);

    return {
        players,
        processedPlayers,
        stats,
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
        deletePlayer,
        claimPlayer,
        unlinkPlayer,
    };
}
