import { useState, useEffect, useCallback, useRef } from 'react';
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
    const [metadataError, setMetadataError] = useState(null);

    // Toolbar filtering & sorting state
    const [searchTerm, setSearchTerm] = useState('');
    const [ratingCategory, setRatingCategory] = useState('rapid');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'claimed' | 'pending' | 'unlinked'
    const [sortBy, setSortBy] = useState('rating_desc');     // 'rating_desc' | 'rating_asc' | 'name_asc' | 'games_desc' | 'winrate_desc'
    const [viewMode, setViewMode] = useState('grid');       // 'grid' | 'table'

    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    const [query, setQuery] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => { setPage(0); }, [clubId]);
    useEffect(() => {
        const timer = setTimeout(() => { setQuery(searchTerm.trim()); setPage(0); }, 250);
        return () => clearTimeout(timer);
    }, [searchTerm]);
    useEffect(() => {
        const controller = new AbortController();
        if (!clubId) return;
        setMetadataError(null);
        Promise.all([
            includeInactive ? playerApi.fetchInactivePlayers(clubId, { signal: controller.signal }) : [],
            playerApi.fetchRosterSummary(clubId, { signal: controller.signal }),
        ]).then(([inactive, summary]) => {
            if (!controller.signal.aborted) { setInactivePlayers(inactive); setRosterSummary(summary); }
        }).catch(err => { if (!controller.signal.aborted && !isCancelledError(err)) setMetadataError(err.message); });
        return () => controller.abort();
    }, [clubId, includeInactive, revision]);
    const requestId = useRef(0);
    const fetchPlayers = useCallback(async (signal) => {
        const currentRequest = ++requestId.current;
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
            const data = await playerApi.searchPlayers(clubId, {
                q: query, limit: 24, offset: page * 24, status: statusFilter, sortBy, category: ratingCategory, signal,
            });
            if (signal?.aborted || currentRequest !== requestId.current) return;
            if (!data.players.length && page > 0) { setPage(value => value - 1); return; }
            setPlayers(data.players);
            setTotal(data.total);
            setError(null);
        } catch (err) {
            if (signal?.aborted || currentRequest !== requestId.current || isCancelledError(err)) return;
            console.error('Failed to fetch players:', err);
            setError(err.message || 'Unable to load players roster.');
        } finally {
            if (!signal?.aborted && currentRequest === requestId.current) setLoading(false);
        }
    }, [clubId, query, page, statusFilter, sortBy, ratingCategory]);

    useEffect(() => {
        const controller = new AbortController();
        fetchPlayers(controller.signal);
        return () => { controller.abort(); requestId.current += 1; };
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
        await playerApi.archivePlayer(clubId, playerId);
        setRevision(value => value + 1);
        await fetchPlayers();
    };

    const restorePlayer = async (playerId) => {
        if (!clubId) return;
        await playerApi.restorePlayer(clubId, playerId);
        setRevision(value => value + 1);
        await fetchPlayers();
    };

    // Claim Player Profile
    const claimPlayer = async (playerId) => {
        if (!clubId) return;
        const link = await playerApi.claimPlayer(clubId, playerId);
        setRevision(value => value + 1);
        await fetchPlayers(); // Refresh link status
        return link;
    };

    // Unlink Player
    const unlinkPlayer = async (playerId) => {
        if (!clubId) return;
        await playerApi.unlinkPlayer(clubId, playerId);
        setRevision(value => value + 1);
        await fetchPlayers();
    };

    return {
        players,
        inactivePlayers,
        processedPlayers: players,
        page, setPage, total, pageSize: 24,
        stats: rosterSummary,
        loading,
        error: error || metadataError,
        searchTerm,
        setSearchTerm,
        ratingCategory,
        setRatingCategory: value => { setRatingCategory(value); setPage(0); },
        statusFilter,
        setStatusFilter: value => { setStatusFilter(value); setPage(0); },
        sortBy,
        setSortBy: value => { setSortBy(value); setPage(0); },
        viewMode,
        setViewMode,
        refetch: async () => { setRevision(value => value + 1); await fetchPlayers(); },
        addPlayer,
        addPlayersBulk,
        updatePlayer,
        archivePlayer,
        restorePlayer,
        claimPlayer,
        unlinkPlayer,
    };
}
