import ClaimedBadge from '../../features/players/components/ClaimedBadge.jsx';
import Icon from '../../shared/common/Icon.jsx';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import '../../styles/leaderboard.css';
import Button from '../../shared/common/Button.jsx';
import Dialog from '../../shared/common/Dialog.jsx';
import { playerApi } from '../../features/players/api/playerApi.js';
import { useClub } from '../../app/contextHooks.js';
import { leaderboardApi } from '../../features/leaderboard/api/leaderboardApi.js';
import NoClubState from '../../shared/common/NoClubState.jsx';

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
            <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
    const { club, capabilities = {} } = useClub();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedCategory = searchParams.get('category');
    const selectedCategory = CATEGORIES.includes(requestedCategory) ? requestedCategory : 'rapid';
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
    const search = searchParams.get('q') || '';
    const [leaderboard, setLeaderboard] = useState({ entries: [], total: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [ratingHistory, setRatingHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');

    useEffect(() => { setSelectedPlayer(null); }, [club?.id, selectedCategory]);

    useEffect(() => {
        if (!selectedPlayer || selectedPlayer.clubId !== club?.id || selectedPlayer.category !== selectedCategory) return;
        let active = true;
        setRatingHistory([]);
        setHistoryError('');
        setHistoryLoading(true);
        playerApi.fetchRatingHistory(club.id, selectedPlayer.playerId, selectedCategory)
            .then(data => { if (active) setRatingHistory(data); })
            .catch(error => { if (active) setHistoryError(error.message || 'Unable to load rating history.'); })
            .finally(() => { if (active) setHistoryLoading(false); });
        return () => { active = false; };
    }, [club?.id, selectedCategory, selectedPlayer]);

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
    }, [club?.id, selectedCategory, page, search, refreshKey]);

    function selectCategory(category) {
        updateQuery({ category, page: null });
    }

    function openPlayer(entry) {
        setSelectedPlayer({ ...entry, clubId: club.id, category: selectedCategory });
        setRatingHistory([]);
    }

    const totalPages = Math.max(1, Math.ceil(leaderboard.total / PAGE_SIZE));

    if (!club) return <NoClubState title="Turn results into a clear leaderboard"
        feature="Every rated match updates the selected Blitz, Rapid, or Classical ranking while keeping all three ratings visible."
        description="Create a club or join one, then record rated matches to build the first standings." />;

    return (
        <div className="leaderboard-page">
            <div className="page-header">
                <h1>Leaderboard</h1>
                <div className="controls filter-toolbar">
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

            {error && <div className="error-banner" role="alert"><p>Couldn’t load leaderboard. Try again. {error}</p><Button variant="secondary" disabled={loading} onClick={() => setRefreshKey(current => current + 1)}>Retry</Button></div>}
            <div className="leaderboard-list" aria-busy={loading}>
                {loading ? <div className="muted">Loading...</div> : (
                    <>
                        {leaderboard.entries.length > 0 ? <div className="table-scroll leaderboard-desktop" tabIndex={0} role="region" aria-label="Leaderboard ratings"><table className="leaderboard-table">
                            <thead><tr><th>Rank</th><th>Player</th><th>Blitz</th><th>Rapid</th><th>Classical</th><th>Total Games</th></tr></thead>
                            <tbody>
                                {leaderboard.entries.map(entry => (
                                    <tr key={entry.playerId} className="leaderboard-row" onClick={() => openPlayer(entry)}>
                                        <td className={`rank ${entry.rank <= 3 ? `top${entry.rank}` : ''}`}>{entry.rank}</td>
                                        <td><button type="button" className="name-link"
                                            onClick={event => { event.stopPropagation(); openPlayer(entry); }}
                                            aria-label={`View ${entry.playerName} rating history`}>{entry.playerName} <ClaimedBadge status={entry.isClaimed ? 'approved' : null} /></button></td>
                                        <RatingCells entry={entry} selectedCategory={selectedCategory} />
                                        <td>{entry.totalGames}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table></div> : <section className="leaderboard-empty">
                            <span aria-hidden="true"><Icon name="trophy" size="xl" /></span>
                            <h2>The first ranking is one rated result away</h2>
                            <p>Players appear here after they complete a rated match in the selected {label(selectedCategory)} category.</p>
                            <Link className="btn-primary" to="/matches">{capabilities.canManageMatches ? 'Record a rated match' : 'View club matches'}</Link>
                        </section>}
                        <div className="leaderboard-cards">
                            {leaderboard.entries.map(entry => (
                                <button type="button" className="leaderboard-card" key={entry.playerId} onClick={() => openPlayer(entry)}>
                                    <span className="leaderboard-card__rank">#{entry.rank}</span>
                                    <strong>{entry.playerName} <ClaimedBadge status={entry.isClaimed ? 'approved' : null} /></strong>
                                    <span>{label(selectedCategory)}: {entry.selectedRating}</span>
                                    <span>{entry.totalGames} total games</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {leaderboard.total > 0 && <div className="leaderboard-pagination" aria-label="Leaderboard pagination">
                <Button variant="secondary" disabled={page === 1} onClick={() => updateQuery({ page: page - 1 })}>Previous</Button>
                <span>Page {page} of {totalPages}</span>
                <Button variant="secondary" disabled={page >= totalPages} onClick={() => updateQuery({ page: page + 1 })}>Next</Button>
            </div>}

            {selectedPlayer && selectedPlayer.clubId === club?.id && selectedPlayer.category === selectedCategory && (
                <Dialog title={selectedPlayer.playerName} onClose={() => setSelectedPlayer(null)}>
                        <div className="modal-body">
                            <div className="player-summary">
                                <div><strong>{label(selectedCategory)} Elo:</strong> {selectedPlayer.selectedRating}</div>
                                <div><strong>Rated games:</strong> {selectedPlayer.categoryGames}</div>
                                <div><strong>Peak:</strong> {selectedPlayer.peakRating}</div>
                                <div><strong>Weighted win rate:</strong> {Math.round(selectedPlayer.weightedWinRate * 100)}%</div>
                            </div>
                            <div className="rating-history"><h4>{label(selectedCategory)} rating history</h4>
                                {historyLoading ? <p role="status">Loading rating history…</p>
                                    : historyError ? <p role="alert">{historyError}</p> : <Sparkline points={ratingHistory} />}</div>
                        </div>
                </Dialog>
            )}
        </div>
    );
}
