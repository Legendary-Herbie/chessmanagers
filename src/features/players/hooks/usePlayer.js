import { useState, useEffect, useCallback } from 'react';
import { playerApi } from '../api/playerApi.js';
import { isCancelledError } from '../../../config/api.js';

export function usePlayer(clubId, playerId, ratingCategory = 'rapid') {
    const [player, setPlayer] = useState(null);
    const [allPlayers, setAllPlayers] = useState([]);
    const [matches, setMatches] = useState([]);
    const [ratingHistory, setRatingHistory] = useState([]);
    const [statistics, setStatistics] = useState(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchPlayerData = useCallback(async (signal) => {
        if (!clubId || !playerId) {
            setLoading(false);
            return;
        }
        setLoading(true);

        try {
            const [playerRes, matchesRes, ratingRes, statisticsRes, allPlayersRes] = await Promise.all([
                playerApi.fetchPlayer(clubId, playerId, { signal }),
                playerApi.fetchMatches(clubId, playerId, { signal }),
                playerApi.fetchRatingHistory(clubId, playerId, ratingCategory, { signal }),
                playerApi.fetchStatistics(clubId, playerId, { signal }),
                playerApi.fetchPlayers(clubId, { signal }),
            ]);

            if (signal?.aborted) return;
            setPlayer(playerRes);
            setMatches(matchesRes);
            setRatingHistory(ratingRes);
            setStatistics(statisticsRes);
            setAllPlayers(allPlayersRes);
            setError(null);
        } catch (err) {
            if (signal?.aborted || isCancelledError(err)) return;
            console.error('Failed to load player details:', err);
            setError(err.message || 'Player not found or unable to fetch profile.');
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [clubId, playerId, ratingCategory]);

    useEffect(() => {
        const controller = new AbortController();
        fetchPlayerData(controller.signal);
        return () => controller.abort();
    }, [clubId, playerId, fetchPlayerData]);

    const claimPlayer = async () => {
        if (!clubId || !player) return;
        await playerApi.claimPlayer(clubId, player.id);
        await fetchPlayerData();
    };

    const unlinkPlayer = async () => {
        if (!clubId || !player || player.link_status !== 'approved') return;
        await playerApi.unlinkPlayer(clubId, player.id);
        await fetchPlayerData();
    };

    const archivePlayer = async () => {
        if (!clubId || !player) return;
        await playerApi.archivePlayer(clubId, player.id);
    };

    return {
        player,
        allPlayers,
        matches,
        ratingHistory,
        statistics,
        loading,
        error,
        refetch: fetchPlayerData,
        claimPlayer,
        unlinkPlayer,
        archivePlayer,
    };
}
