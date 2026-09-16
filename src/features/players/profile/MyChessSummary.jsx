import React from 'react';
import { Link } from 'react-router-dom';
import RatingCategoryIcon from '../../../shared/common/RatingCategoryIcon.jsx';
import Icon from '../../../shared/common/Icon.jsx';
import '../../../styles/club-dashboard.css';

const categories = ['blitz', 'rapid', 'classical'];
const title = value => value[0].toUpperCase() + value.slice(1);
export default function MyChessSummary({ summary }) {
    if (!summary) return null;
    const initials = summary.player.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('');
    return <section className="my-chess-summary" aria-label="My Chess Summary">
        <header className="my-chess-summary__header">
            <span className="my-chess-summary__avatar" aria-hidden="true">{initials}</span>
            <div className="my-chess-summary__identity"><span className="my-chess-summary__eyebrow">My Chess Summary</span>
                <h2><Link className="name-link" to={`/players/${summary.player.id}`}>{summary.player.name}</Link></h2>
                <span className="my-chess-summary__member"><Icon name="check" />Club member</span>
            </div>
            <Link className="btn-secondary my-chess-summary__profile" to={`/players/${summary.player.id}`}>View profile</Link>
        </header>
        <div className="my-chess-summary__ratings">{categories.map(category => {
            const stats = summary.categories?.[category] || {};
            const change = stats.lastRatingChange;
            return <div className="my-chess-summary__rating" key={category}>
                <span className="my-chess-summary__category"><RatingCategoryIcon category={category} />{title(category)}</span>
                <div className="my-chess-summary__rating-value"><strong>{stats.currentRating ?? '—'}</strong><span>Elo</span></div>
                {Number.isFinite(change) && <span className={`my-chess-summary__change ${change > 0 ? 'positive' : change < 0 ? 'negative' : ''}`}>
                    {change > 0 ? '+' : ''}{change} <span>last rated game</span>
                </span>}
                {stats.currentWinStreak > 0 && <span className="my-chess-summary__streak"><Icon name="chart" />{stats.currentWinStreak} win streak</span>}
            </div>;
        })}</div>
        {!!summary.pairings?.length && <div className="my-chess-summary__pairings">{summary.pairings.map(pairing => <div className="my-chess-summary__pairing" key={pairing.id}>
            <div className="my-chess-summary__board"><span>Board</span><strong>{pairing.board}</strong></div>
            <div className="my-chess-summary__opponent"><span>{pairing.tournamentName} · Round {pairing.roundNumber}</span>
                <strong>vs. {pairing.opponentName}</strong><span className={`piece-color piece-color--${pairing.color.toLowerCase()}`}>{pairing.color === 'White' ? '♔' : '♚'} Playing {pairing.color}</span></div>
            <Link className="btn-primary" to={`/tournaments/${pairing.tournamentId}?tab=pairings`}>View pairing</Link>
        </div>)}</div>}
        {!!summary.recentMatches?.length && <div className="my-chess-summary__recent"><h3>Recent matches</h3><ul>{summary.recentMatches.map(match => <li key={match.id}>
            <span>{match.whitePlayerName} <strong>{({ white:'1–0', draw:'½–½', black:'0–1' })[match.result]}</strong> {match.blackPlayerName}</span>
            <time dateTime={match.playedAt}>{new Date(match.playedAt).toLocaleDateString()}</time>
        </li>)}</ul></div>}
    </section>;
}
