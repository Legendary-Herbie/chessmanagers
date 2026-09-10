import PlayerSearchSelect from '../components/PlayerSearchSelect.jsx';
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

    const [opponent, setOpponent] = useState(null);

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

    const playerB = opponent || allPlayers.find(p => p.id === selectedPlayerBId);
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
                    <PlayerSearchSelect clubId={clubId} label="Select opponent" value={selectedPlayerBId}
                        excludePlayerId={playerA?.id} allowClear
                        onChange={setSelectedPlayerBId} onSelect={setOpponent} />
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

            {error && <div className="error-box" role="alert">{error}</div>}

            {!loading && selectedPlayerBId && summary && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
                    <div className="category-switcher" role="group" aria-label="Head-to-head category">
                        {['overall', 'blitz', 'rapid', 'classical'].map(value => (
                            <button type="button" key={value} className={category === value ? 'active' : ''}
                                onClick={() => setCategory(value)}>{value[0].toUpperCase() + value.slice(1)}</button>
                        ))}
                    </div>
                    <div className="rivalry-summary">
                        <p>{selectedSummary.games} rated games</p>
                        <div className="rivalry-bar" role="img" aria-label={`${playerA?.name}: ${selectedSummary.playerAWins} wins; ${selectedSummary.draws} draws; ${playerB?.name}: ${selectedSummary.playerBWins} wins`}>
                            {[[selectedSummary.playerAWins, playerA?.name, 'first'], [selectedSummary.draws, 'Draws', 'draw'], [selectedSummary.playerBWins, playerB?.name, 'second']].map(([count, name, tone]) => count > 0 && <span key={tone} className={`rivalry-bar__${tone}`} style={{ flexGrow: count }} title={`${name}: ${count} (${Math.round(count / selectedSummary.games * 100)}%)`} />)}
                        </div>
                        <div className="rivalry-legend"><span>{playerA?.name}: {selectedSummary.playerAWins} wins</span><span>{selectedSummary.draws} draws</span><span>{playerB?.name}: {selectedSummary.playerBWins} wins</span></div>
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
