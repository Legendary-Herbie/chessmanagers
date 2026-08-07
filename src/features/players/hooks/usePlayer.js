import { useState, useEffect, useCallback } from 'react';
import { playerApi } from '../api/playerApi.js';

export function usePlayer(clubId, playerId) {
    const [player, setPlayer] = useState(null);
    const [allPlayers, setAllPlayers] = useState([]);
    const [matches, setMatches] = useState([]);
    const [ratingHistory, setRatingHistory] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchPlayerData = useCallback(async () => {
        if (!clubId || !playerId) return;
        setLoading(true);

        try {
            const [playerRes, matchesRes, ratingRes, allPlayersRes] = await Promise.all([
                playerApi.fetchPlayer(clubId, playerId),
                playerApi.fetchMatches(clubId, playerId).catch(() => []),
                playerApi.fetchRatingHistory(clubId, playerId).catch(() => []),
                playerApi.fetchPlayers(clubId).catch(() => []),
            ]);

            setPlayer(playerRes);
            setMatches(matchesRes);
            setRatingHistory(ratingRes);
            setAllPlayers(allPlayersRes);
            setError(null);
        } catch (err) {
            console.error('Failed to load player details:', err);
            setError(err.message || 'Player not found or unable to fetch profile.');
        } finally {
            setLoading(false);
        }
    }, [clubId, playerId]);

    useEffect(() => {
        if (clubId && playerId) {
            fetchPlayerData();
        }
    }, [clubId, playerId, fetchPlayerData]);

    const claimPlayer = async () => {
        if (!clubId || !player) return;
        await playerApi.claimPlayer(clubId, player.id);
        fetchPlayerData();
    };

    const unlinkPlayer = async () => {
        if (!clubId || !player || !player.linked_user_id) return;
        await playerApi.unlinkPlayer(clubId, player.id, player.linked_user_id);
        fetchPlayerData();
    };

    const deletePlayer = async () => {
        if (!clubId || !player) return;
        await playerApi.deletePlayer(clubId, player.id);
    };

    return {
        player,
        allPlayers,
        matches,
        ratingHistory,
        loading,
        error,
        refetch: fetchPlayerData,
        claimPlayer,
        unlinkPlayer,
        deletePlayer,
    };
}
