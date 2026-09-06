import React, { useState, useEffect, useCallback } from 'react';
import { playerApi } from '../api/playerApi.js';
import { matchResultLabel } from '../../matches/matchPresentation.js';

export default function HeadToHeadView({ clubId, playerA, allPlayers = [] }) {
    const [selectedPlayerBId, setSelectedPlayerBId] = useState('');
    const [summary, setSummary] = useState(null);
    const [category, setCategory] = useState('overall');
    const [matches, setMatches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const opponentOptions = allPlayers.filter(p => p.id !== playerA?.id);

    const fetchHeadToHead = useCallback(async (signal) => {
        if (!clubId || !playerA?.id || !selectedPlayerBId) {
            setSummary(null);
            setMatches([]);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const [summaryResult, matchResult] = await Promise.all([
                playerApi.fetchHeadToHead(clubId, playerA.id, selectedPlayerBId, { signal }),
                playerApi.fetchHeadToHeadMatches(clubId, playerA.id, selectedPlayerBId, { signal }),
            ]);
            if (signal?.aborted) return;
            setSummary(summaryResult);
            setMatches(matchResult);
        } catch (err) {
            if (signal?.aborted) return;
            console.error('Failed to fetch head to head data:', err);
            setError(err.message || 'Could not load head-to-head history.');
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [clubId, playerA, selectedPlayerBId]);

    useEffect(() => {
        const controller = new AbortController();
        fetchHeadToHead(controller.signal);
        return () => controller.abort();
    }, [fetchHeadToHead]);

    const playerB = allPlayers.find(p => p.id === selectedPlayerBId);
    const selectedSummary = category === 'overall' ? summary?.overall : summary?.categories?.[category];

    return (
        <div className="chart-card">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-strong)' }}>
                        Head-to-Head Comparison
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Compare match records between {playerA?.name} and another player.
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label htmlFor="h2h-select" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>
                        Select Opponent:
                    </label>
                    <select
                        id="h2h-select"
                        className="players-filter-select"
                        value={selectedPlayerBId}
                        onChange={(e) => setSelectedPlayerBId(e.target.value)}
                    >
                        <option value="">-- Select Player --</option>
                        {opponentOptions.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {!selectedPlayerBId && (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    Choose an opponent above to view their head-to-head rivalry history.
                </div>
            )}

            {loading && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Fetching head-to-head record...
                </div>
            )}

            {error && <div className="error-box">{error}</div>}

            {!loading && selectedPlayerBId && summary && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
                    <div className="category-switcher" role="group" aria-label="Head-to-head category">
                        {['overall', 'blitz', 'rapid', 'classical'].map(value => (
                            <button type="button" key={value} className={category === value ? 'active' : ''}
                                onClick={() => setCategory(value)}>{value[0].toUpperCase() + value.slice(1)}</button>
                        ))}
                    </div>
                    {/* Scoreboard */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto 1fr',
                            gap: '12px',
                            alignItems: 'center',
                            backgroundColor: 'var(--bg-muted)',
                            padding: '16px 20px',
                            borderRadius: '12px',
                            textAlign: 'center',
                        }}
                    >
                        <div>
                            <strong style={{ display: 'block', fontSize: '1.1rem', color: 'var(--text-strong)' }}>{playerA?.name}</strong>
                            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>
                                {selectedSummary.playerAWins}
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Total Played
                            </span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                                {selectedSummary.games}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--warning)' }}>
                                {selectedSummary.draws} Draw(s)
                            </span>
                        </div>
                        <div>
                            <strong style={{ display: 'block', fontSize: '1.1rem', color: 'var(--text-strong)' }}>{playerB?.name}</strong>
                            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)' }}>
                                {selectedSummary.playerBWins}
                            </span>
                        </div>
                    </div>

                    {/* Match List */}
                    {matches.length > 0 ? (
                        <div className="players-table-wrapper">
                            <table className="players-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>White</th>
                                        <th>Black</th>
                                        <th>Result</th>
                                        <th>Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {matches.map((m) => (
                                        <tr key={m.id}>
                                            <td>{new Date(m.playedAt).toLocaleDateString()}</td>
                                            <td>
                                                <strong style={{ color: m.whitePlayerId === playerA?.id ? 'var(--primary)' : 'var(--text)' }}>
                                                    {m.whitePlayerName}
                                                </strong>
                                            </td>
                                            <td>
                                                <strong style={{ color: m.blackPlayerId === playerA?.id ? 'var(--primary)' : 'var(--text)' }}>
                                                    {m.blackPlayerName}
                                                </strong>
                                            </td>
                                            <td>
                                                <span
                                                    style={{
                                                        fontWeight: 700,
                                                        color: m.result === 'draw' ? 'var(--warning)' : (
                                                            (m.result === 'white' && m.whitePlayerId === playerA?.id) ||
                                                            (m.result === 'black' && m.blackPlayerId === playerA?.id)
                                                                ? 'var(--accent)'
                                                                : 'var(--danger)'
                                                        )
                                                    }}
                                                >
                                                    {matchResultLabel(m.result)}
                                                </span>
                                            </td>
                                            <td>{m.ratingCategory[0].toUpperCase() + m.ratingCategory.slice(1)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '12px' }}>
                            No matches registered between these two players yet.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
