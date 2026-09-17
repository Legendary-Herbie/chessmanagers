import { useState, useEffect } from 'react';
import { useClubQuery } from '../../../shared/query/useClubQuery.js';
import { playerApi } from '../api/playerApi.js';

export function usePlayers(clubId, { includeInactive = false } = {}) {
    // Toolbar filtering & sorting state
    const [searchTerm, setSearchTerm] = useState('');
    const [ratingCategory, setRatingCategory] = useState('rapid');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'claimed' | 'pending' | 'unlinked'
    const [sortBy, setSortBy] = useState('rating_desc');     // 'rating_desc' | 'rating_asc' | 'name_asc' | 'games_desc' | 'winrate_desc'
    const [viewMode, setViewMode] = useState('table');       // 'grid' | 'table'

    const [page, setPage] = useState(0);
    const [query, setQuery] = useState('');
    useEffect(() => { setPage(0); }, [clubId]);
    useEffect(() => {
        const timer = setTimeout(() => { setQuery(searchTerm.trim()); setPage(0); }, 250);
        return () => clearTimeout(timer);
    }, [searchTerm]);
    const roster = useClubQuery(clubId, ['players', query, page, statusFilter, sortBy, ratingCategory], ({ signal }) => (
        playerApi.searchPlayers(clubId, { q: query, limit: 24, offset: page * 24, status: statusFilter, sortBy, category: ratingCategory, signal })
    ));
    const metadata = useClubQuery(clubId, ['roster-summary', includeInactive], async ({ signal }) => {
        const [inactive, summary] = await Promise.all([
            includeInactive ? playerApi.fetchInactivePlayers(clubId, { signal }) : [],
            playerApi.fetchRosterSummary(clubId, { signal }),
        ]);
        return { inactive, summary };
    });
    const players = roster.data?.players ?? [];
    const total = roster.data?.total ?? 0;
    const inactivePlayers = metadata.data?.inactive ?? [];
    const rosterSummary = metadata.data?.summary ?? {
        totalPlayers: 0, activePlayers: 0,
        averageRatings: { blitz: null, rapid: null, classical: null },
    };
    const loading = roster.isLoading;
    const error = roster.error?.message || metadata.error?.message || null;
    useEffect(() => {
        if (roster.data && !roster.data.players.length && page > 0) setPage(value => value - 1);
    }, [roster.data, page]);
    const fetchPlayers = async () => { await Promise.all([roster.refetch({ cancelRefetch: false }), metadata.refetch({ cancelRefetch: false })]); };

    // Single Add Player
    const addPlayer = async ({ name, startRatings, bio }) => {
        if (!clubId) return;
        const newPlayer = await playerApi.createPlayer(clubId, { name, startRatings, bio });
        await fetchPlayers();
        return newPlayer;
    };

    // Atomic Bulk Add Players
    const addPlayersBulk = async (playersList) => {
        if (!clubId) return;
        const created = await playerApi.createPlayersBulk(clubId, playersList);
        await fetchPlayers();
        return created;
    };

    // Update Player
    const updatePlayer = async (playerId, { name, bio }) => {
        if (!clubId) return;
        const updated = await playerApi.updatePlayer(clubId, playerId, { name, bio });
        await fetchPlayers();
        return updated;
    };

    const archivePlayer = async (playerId) => {
        if (!clubId) return;
        await playerApi.archivePlayer(clubId, playerId);
        await fetchPlayers();
    };

    const restorePlayer = async (playerId) => {
        if (!clubId) return;
        await playerApi.restorePlayer(clubId, playerId);
        await fetchPlayers();
    };

    // Claim Player Profile
    const claimPlayer = async (playerId) => {
        if (!clubId) return;
        const link = await playerApi.claimPlayer(clubId, playerId);
        await fetchPlayers(); // Refresh link status
        return link;
    };

    // Unlink Player
    const unlinkPlayer = async (playerId) => {
        if (!clubId) return;
        await playerApi.unlinkPlayer(clubId, playerId);
        await fetchPlayers();
    };

    return {
        players,
        inactivePlayers,
        processedPlayers: players,
        page, setPage, total, pageSize: 24,
        stats: rosterSummary,
        loading,
        error,
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
