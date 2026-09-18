import { useState, useEffect, useCallback, useRef } from 'react';
import { playerApi } from '../api/playerApi.js';
import { isCancelledError } from '../../../config/api.js';

export function usePlayer(clubId, playerId, ratingCategory = 'rapid') {
    const [player, setPlayer] = useState(null);

    const [matches, setMatches] = useState([]);
    const [ratingHistory, setRatingHistory] = useState([]);
    const [statistics, setStatistics] = useState(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [historyError, setHistoryError] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [revision, setRevision] = useState(0);
    const cache = useRef(new Map());
    const sequence = useRef(0);
    useEffect(() => { cache.current.clear(); }, [clubId, playerId]);
    useEffect(() => {
        const controller = new AbortController();
        const key = `${clubId}:${playerId}:${ratingCategory}:${revision}`;
        setHistoryError(null);
        setRatingHistory(cache.current.get(key) || []);
        if (!clubId || !playerId || cache.current.has(key)) { setHistoryLoading(false); return; }
        setHistoryLoading(true);
        playerApi.fetchRatingHistory(clubId, playerId, ratingCategory, { signal: controller.signal })
            .then(history => {
                if (controller.signal.aborted) return;
                cache.current.set(key, history); setRatingHistory(history);
            }).catch(err => {
                if (!controller.signal.aborted && !isCancelledError(err)) setHistoryError(err.message || 'Could not load rating history.');
            }).finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
        return () => controller.abort();
    }, [clubId, playerId, ratingCategory, revision]);

    const fetchPlayerData = useCallback(async (signal) => {
        const request = ++sequence.current;
        if (!clubId || !playerId) {
            setLoading(false);
            return;
        }
        setLoading(true);

        try {
            const [playerRes, matchesRes, statisticsRes] = await Promise.all([
                playerApi.fetchPlayer(clubId, playerId, { signal }),
                playerApi.fetchMatches(clubId, playerId, { signal }),
                playerApi.fetchStatistics(clubId, playerId, { signal }),
            ]);

            if (signal?.aborted || request !== sequence.current) return;
            setPlayer(playerRes);
            setMatches(matchesRes);
            setStatistics(statisticsRes);
            setError(null);
        } catch (err) {
            if (signal?.aborted || request !== sequence.current || isCancelledError(err)) return;
            console.error('Failed to load player details:', err);
            setError(err.message || 'Player not found or unable to fetch profile.');
        } finally {
            if (!signal?.aborted && request === sequence.current) setLoading(false);
        }
    }, [clubId, playerId]);

    useEffect(() => {
        const controller = new AbortController();
        setPlayer(null); setMatches([]); setStatistics(null);
        fetchPlayerData(controller.signal);
        const generation = sequence;
        return () => { controller.abort(); generation.current++; };
    }, [clubId, playerId, fetchPlayerData]);

    const claimPlayer = async () => {
        if (!clubId || !player) return;
        const link = await playerApi.claimPlayer(clubId, player.id);
        await fetchPlayerData();
        return link;
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
        allPlayers: [],
        matches,
        ratingHistory,
        statistics,
        loading: loading || historyLoading,
        error: error || historyError,
        refetch: async () => { cache.current.clear(); setRevision(value => value + 1); await fetchPlayerData(); },
        claimPlayer,
        unlinkPlayer,
        archivePlayer,
    };
}
