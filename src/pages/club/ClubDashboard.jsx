import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/club-dashboard.css';

const CATEGORIES = ['blitz', 'rapid', 'classical'];
const RESULT_LABELS = { white: '1–0', black: '0–1', draw: '½–½' };
const title = value => value[0].toUpperCase() + value.slice(1);

function StatCard({ label, value, sub, to }) {
    return <Link className="dash-stat-card" to={to} aria-label={`${label}: ${value}`}>
        <span className="dash-stat-card__label">{label}</span>
        <span className="dash-stat-card__value">{value}</span>
        {sub && <span className="dash-stat-card__sub">{sub}</span>}
    </Link>;
}

export default function ClubDashboard({ data, onCategoryChange, canManageMemberships = false }) {
    if (!data) return <div className="dash-empty"><p className="muted">No stats available yet.</p></div>;
    const { metrics, admin, topPlayers = [], recentMatches = [], selectedCategory = 'blitz' } = data;
    const pendingTotal = (admin?.pendingJoinRequests || 0) + (admin?.pendingPlayerLinks || 0);
    const categoryCounts = metrics.gamesByCategory;
    const maxCategoryCount = Math.max(1, ...CATEGORIES.map(category => categoryCounts[category]));

    return <div className="club-dashboard">
        {pendingTotal > 0 && <div className="dash-pending-banner">
            <strong>{pendingTotal} item{pendingTotal === 1 ? '' : 's'} need attention</strong>
            <span>{admin.pendingJoinRequests} join requests · {admin.pendingPlayerLinks} player claims</span>
        </div>}

        <div className="dash-stats-grid">
            <StatCard label="Members" value={metrics.activeMembers} to={canManageMemberships ? '/club?tab=members' : '/club'} />
            <StatCard label="Players" value={metrics.rosterPlayers} sub={`${metrics.activePlayers} active`} to="/players" />
            <StatCard label="Games" value={metrics.totalGames} sub={`${metrics.ratedGames} rated`} to="/matches" />
            <StatCard label="Tournaments" value={metrics.totalTournaments} to="/tournaments" />
        </div>

        <div className="dash-columns">
            <div className="dash-panel">
                <h3 className="dash-panel__title">Games by category</h3>
                <div className="dash-category-bars">{CATEGORIES.map(category => {
                    const count = categoryCounts[category];
                    return <div key={category} className="dash-category-row">
                        <span className="dash-category-label">{title(category)}</span>
                        <div className="dash-category-track"><div className="dash-category-fill" style={{ width: `${Math.round(count / maxCategoryCount * 100)}%` }} /></div>
                        <span className="dash-category-count">{count}</span>
                    </div>;
                })}</div>
            </div>

            <div className="dash-panel">
                <div className="dash-panel__header">
                    <h3 className="dash-panel__title">Top players</h3>
                    <select aria-label="Top player category" value={selectedCategory}
                        onChange={event => onCategoryChange?.(event.target.value)}>
                        {CATEGORIES.map(category => <option key={category} value={category}>{title(category)}</option>)}
                    </select>
                </div>
                {!topPlayers.length ? <p className="muted">No eligible players yet.</p> :
                    <ol className="dash-top-players">{topPlayers.map(player => <li key={player.playerId}>
                        <span className="dash-top-players__rank">{player.rank}</span>
                        <Link to={`/players/${player.playerId}`} className="dash-top-players__name">{player.playerName}</Link>
                        <span className="dash-top-players__rating">{player.selectedRating}</span>
                    </li>)}</ol>}
            </div>
        </div>

        <div className="dash-panel">
            <div className="dash-panel__header"><h3 className="dash-panel__title">Recent matches</h3><Link to="/matches">View match history</Link></div>
            {!recentMatches.length ? <p className="muted">No matches recorded yet.</p> : <div className="dash-matches-table-wrap" role="region" aria-label="Recent matches table" tabIndex="0"><table className="dash-matches-table">
                <thead><tr><th>Date</th><th>White</th><th>Black</th><th>Result</th><th>Rating category</th></tr></thead>
                <tbody>{recentMatches.map(match => <tr key={match.id}>
                    <td>{new Date(match.playedAt).toLocaleDateString()}</td>
                    <td>{match.whitePlayerId ? <Link to={`/players/${match.whitePlayerId}`}>{match.whitePlayerName}</Link> : match.whitePlayerName}</td><td>{match.blackPlayerId ? <Link to={`/players/${match.blackPlayerId}`}>{match.blackPlayerName}</Link> : match.blackPlayerName}</td>
                    <td>{RESULT_LABELS[match.result]}</td><td>{title(match.ratingCategory)}</td>
                </tr>)}</tbody>
            </table></div>}
        </div>
    </div>;
}
