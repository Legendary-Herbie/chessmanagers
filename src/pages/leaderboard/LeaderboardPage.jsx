import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../../styles/leaderboard.css';
import Button from '../../shared/common/Button.jsx';
import { playerApi } from '../../features/players/api/playerApi.js';
import { useClub } from '../../app/contextHooks.js';
import { leaderboardApi } from '../../features/leaderboard/api/leaderboardApi.js';

const CATEGORIES = ['blitz', 'rapid', 'classical'];
const PAGE_SIZE = 25;
const label = category => category[0].toUpperCase() + category.slice(1);

function Sparkline({ points = [] }) {
    if (!points.length) return <div className="sparkline empty">No rating history yet.</div>;
    const width = 360;
    const height = 120;
    const padding = 8;
    const ratings = points.map(point => point.ratingAfter);
    const min = Math.min(...ratings);
    const max = Math.max(...ratings);
    const dx = (width - padding * 2) / Math.max(1, points.length - 1);
    const scaleY = value => max === min ? height / 2
        : padding + (1 - (value - min) / (max - min)) * (height - padding * 2);
    const path = points.map((point, index) => (
        `${index === 0 ? 'M' : 'L'} ${padding + index * dx} ${scaleY(point.ratingAfter)}`
    )).join(' ');
    return (
        <svg className="sparkline-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <path d={path} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function RatingCells({ entry, selectedCategory }) {
    return CATEGORIES.map(category => (
        <td key={category} className={selectedCategory === category ? 'mono selected-rating' : 'mono'}>
            {entry[`${category}Rating`]}
        </td>
    ));
}

export default function LeaderboardPage() {
    const { club } = useClub();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedCategory = searchParams.get('category');
    const selectedCategory = CATEGORIES.includes(requestedCategory) ? requestedCategory : 'blitz';
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
    const search = searchParams.get('q') || '';
    const [leaderboard, setLeaderboard] = useState({ entries: [], total: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [ratingHistory, setRatingHistory] = useState([]);

    const updateQuery = useCallback((changes) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(changes).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if (!club?.id) return;
        let active = true;
        setLoading(true);
        setError('');
        leaderboardApi.fetchLeaderboard(club.id, {
            category: selectedCategory,
            q: search,
            limit: PAGE_SIZE,
            offset: (page - 1) * PAGE_SIZE,
        }).then(data => {
            if (active) setLeaderboard(data || { entries: [], total: 0 });
        }).catch(fetchError => {
            if (active) setError(fetchError.message || 'Unable to load the leaderboard.');
        }).finally(() => {
            if (active) setLoading(false);
        });
        return () => { active = false; };
    }, [club?.id, selectedCategory, page, search]);

    function selectCategory(category) {
        updateQuery({ category, page: null });
    }

    function openPlayer(entry) {
        setSelectedPlayer(entry);
        setRatingHistory([]);
        playerApi.fetchRatingHistory(club.id, entry.playerId, selectedCategory)
            .then(setRatingHistory)
            .catch(() => setRatingHistory([]));
    }

    const totalPages = Math.max(1, Math.ceil(leaderboard.total / PAGE_SIZE));

    return (
        <div className="leaderboard-page">
            <div className="page-header">
                <h1>Leaderboard</h1>
                <div className="controls">
                    <div className="category-switcher" role="group" aria-label="Rating category">
                        {CATEGORIES.map(category => (
                            <button type="button" key={category}
                                className={selectedCategory === category ? 'active' : ''}
                                onClick={() => selectCategory(category)}>
                                {label(category)}
                            </button>
                        ))}
                    </div>
                    <input className="input" aria-label="Search players" placeholder="Search players"
                        value={search} onChange={event => updateQuery({ q: event.target.value, page: null })} />
                </div>
            </div>

            {error && <div className="error-banner">{error}</div>}
            <div className="leaderboard-list" aria-busy={loading}>
                {loading ? <div className="muted">Loading...</div> : (
                    <>
                        <table className="leaderboard-table">
                            <thead><tr><th>Rank</th><th>Player</th><th>Blitz</th><th>Rapid</th><th>Classical</th><th>Total Games</th></tr></thead>
                            <tbody>
                                {leaderboard.entries.map(entry => (
                                    <tr key={entry.playerId} className="leaderboard-row" onClick={() => openPlayer(entry)}>
                                        <td className={`rank ${entry.rank <= 3 ? `top${entry.rank}` : ''}`}>{entry.rank}</td>
                                        <td>{entry.playerName}</td>
                                        <RatingCells entry={entry} selectedCategory={selectedCategory} />
                                        <td>{entry.totalGames}</td>
                                    </tr>
                                ))}
                                {!leaderboard.entries.length && <tr><td colSpan={6} className="muted">No eligible players found.</td></tr>}
                            </tbody>
                        </table>
                        <div className="leaderboard-cards">
                            {leaderboard.entries.map(entry => (
                                <button type="button" className="leaderboard-card" key={entry.playerId} onClick={() => openPlayer(entry)}>
                                    <span className="leaderboard-card__rank">#{entry.rank}</span>
                                    <strong>{entry.playerName}</strong>
                                    <span>{label(selectedCategory)}: {entry.selectedRating}</span>
                                    <span>{entry.totalGames} total games</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            <div className="leaderboard-pagination" aria-label="Leaderboard pagination">
                <Button variant="secondary" disabled={page === 1} onClick={() => updateQuery({ page: page - 1 })}>Previous</Button>
                <span>Page {page} of {totalPages}</span>
                <Button variant="secondary" disabled={page >= totalPages} onClick={() => updateQuery({ page: page + 1 })}>Next</Button>
            </div>

            {selectedPlayer && (
                <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setSelectedPlayer(null)}>
                    <div className="modal-content small" role="dialog" aria-modal="true">
                        <div className="modal-header"><h3>{selectedPlayer.playerName}</h3><Button variant="secondary" onClick={() => setSelectedPlayer(null)}>Close</Button></div>
                        <div className="modal-body">
                            <div className="player-summary">
                                <div><strong>{label(selectedCategory)} Elo:</strong> {selectedPlayer.selectedRating}</div>
                                <div><strong>Rated games:</strong> {selectedPlayer.categoryGames}</div>
                                <div><strong>Peak:</strong> {selectedPlayer.peakRating}</div>
                                <div><strong>Weighted win rate:</strong> {Math.round(selectedPlayer.weightedWinRate * 100)}%</div>
                            </div>
                            <div className="rating-history"><h4>{label(selectedCategory)} rating history</h4><Sparkline points={ratingHistory} /></div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
