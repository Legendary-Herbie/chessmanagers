import MatchRating from '../../features/matches/components/MatchRating.jsx';
import Icon from '../../shared/common/Icon.jsx';
import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth, useClub, useNotifications } from '../../app/contextHooks.js';
import { usePlayer } from '../../features/players/hooks/usePlayer.js';

import EditPlayerForm from '../../features/players/admin/EditPlayerForm.jsx';
import PlayerRatingChart from '../../features/players/profile/PlayerRatingChart.jsx';
import HeadToHeadView from '../../features/players/profile/HeadToHeadView.jsx';
import { runPlayerAction } from '../../features/players/playerActionFeedback.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { resolveAssetUrl } from '../../config/api.js';

import '../../styles/players.css';

const RATING_CATEGORIES = ['blitz', 'rapid', 'classical'];
const categoryLabel = category => category[0].toUpperCase() + category.slice(1);

export default function PlayerPage() {
    const { playerId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { club, linkedPlayer, capabilities, loading: clubLoading } = useClub();
    const { notify } = useNotifications();
    const isAdmin = Boolean(capabilities.canManagePlayers);
    const [ratingCategory, setRatingCategory] = useState('rapid');

    const {
        player,
        allPlayers,
        matches,
        ratingHistory,
        statistics,
        loading,
        error,
        refetch,
        claimPlayer,
        unlinkPlayer,
        archivePlayer,
    } = usePlayer(club?.id, playerId, ratingCategory);

    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'matches' | 'headToHead'
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // Confirm Modal state
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        variant: 'primary',
        onConfirm: null,
    });

    const closeConfirmModal = () => {
        setConfirmModal({ isOpen: false, title: '', message: '', variant: 'primary', onConfirm: null });
    };

    // Claim Player Handler with ConfirmDialog
    const handleClaim = () => {
        setConfirmModal({
            isOpen: true,
            title: 'Claim Player Profile',
            message: `Request to claim player profile "${player?.name}"? An admin will review your request.`,
            variant: 'primary',
            onConfirm: async () => {
                await runPlayerAction(claimPlayer, {
                    notify,
                    successMessage: 'Claim request submitted.',
                    fallbackError: 'Failed to submit claim request.',
                });
                closeConfirmModal();
            },
        });
    };

    // Unlink Player Handler with ConfirmDialog
    const handleUnlink = () => {
        setConfirmModal({
            isOpen: true,
            title: 'Unlink Account',
            message: `Unlink account from "${player?.name}"?`,
            variant: 'warning',
            onConfirm: async () => {
                await runPlayerAction(unlinkPlayer, {
                    notify,
                    successMessage: 'Player link removed.',
                    fallbackError: 'Failed to unlink player.',
                });
                closeConfirmModal();
            },
        });
    };

    const handleArchive = () => {
        setConfirmModal({
            isOpen: true,
            title: 'Archive Player',
            message: `Archive "${player?.name}"? Match and rating history will be preserved.`,
            variant: 'warning',
            onConfirm: async () => {
                const archived = await runPlayerAction(archivePlayer, {
                    notify,
                    successMessage: 'Player archived.',
                    fallbackError: 'Failed to archive player.',
                });
                if (archived) {
                    navigate('/players');
                }
                closeConfirmModal();
            },
        });
    };

    if (clubLoading || (loading && !player)) {
        return (
            <div className="players-container">
                <div className="page-empty">
                    Loading player profile...
                </div>
            </div>
        );
    }

    if (error || !player) {
        return (
            <div className="players-container">
                <div className="empty-state">
                    <span className="empty-state__icon">⚠️</span>
                    <h2 className="empty-state__title">Player Not Found</h2>
                    <p className="empty-state__description">
                        {error || 'The requested player profile does not exist in this club.'}
                    </p>
                    <Link to="/players" className="btn-primary">
                        ← Back to Players Roster
                    </Link>
                </div>
            </div>
        );
    }

    const {
        name,
        bio,
        link_status,
        status,
        photo_url,
        created_at,
    } = player;
    const selectedRating = player.ratings?.[ratingCategory];
    const categoryStats = statistics?.categories?.[ratingCategory] || {
        games: 0, wins: 0, draws: 0, losses: 0, weightedWinRate: 0,
        currentWinStreak: 0, currentLossStreak: 0,
    };
    const { games, wins, draws, losses } = categoryStats;
    const rating = categoryStats.currentRating ?? selectedRating?.current_rating ?? 1500;
    const start_rating = selectedRating?.start_rating ?? player.start_rating ?? 1500;

    const initials = name
        ? name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
        : 'P';

    const winRate = Math.round(categoryStats.weightedWinRate * 100);
    const ratingDelta = rating - start_rating;
    const isSelf = player.is_self || linkedPlayer?.id === player.id;
    const canEdit = isAdmin || isSelf;
    const isLinked = link_status === 'approved';
    const isPending = link_status === 'pending';
    const canClaim = user && !isAdmin && !isLinked && !isPending && !linkedPlayer;

    return (
        <div className="players-container">
            {/* Breadcrumb navigation */}
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                <Link to="/players" className="text-link">
                    ← Players Roster
                </Link>
                <span style={{ margin: '0 8px' }}>/</span>
                <span>{name}</span>
            </div>

            {/* Profile Header Card */}
            <div className="player-detail__header-card">
                <div className="player-detail__identity">
                    <div className="player-detail__avatar">
                        {photo_url ? <img src={resolveAssetUrl(photo_url)} alt={`${name} profile`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : initials}
                    </div>
                    <div className="player-detail__title-block">
                        <h1>{name}</h1>
                        <div className="player-external-links">
                            {player.chesscom_username && <a className="text-link" href={`https://www.chess.com/member/${encodeURIComponent(player.chesscom_username)}`} target="_blank" rel="noopener noreferrer">Chess.com ↗</a>}
                            {player.lichess_username && <a className="text-link" href={`https://lichess.org/@/${encodeURIComponent(player.lichess_username)}`} target="_blank" rel="noopener noreferrer">Lichess ↗</a>}
                        </div>
                        <div className="player-detail__badges">
                            <span className="rating-badge" style={{ fontSize: '0.85rem', padding: '4px 10px' }}>
                                <Icon name="trophy" /> {rating} {categoryLabel(ratingCategory)} Elo
                            </span>
                            {isLinked && <span className="link-badge link-badge--approved"><Icon name="check" /> Claimed Profile</span>}
                            {isPending && <span className="link-badge link-badge--pending"><Icon name="clock" /> Pending Claim</span>}
                            {!isLinked && !isPending && <span className="link-badge link-badge--unlinked">Unlinked Profile</span>}
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                                Joined {new Date(created_at).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {canClaim && (
                        <button type="button" className="btn-primary" onClick={handleClaim}>
                            Claim Profile
                        </button>
                    )}
                    {canEdit && (
                        <button type="button" className="btn-secondary" onClick={() => setIsEditModalOpen(true)}>
                            <Icon name="edit" /> Edit Profile
                        </button>
                    )}
                    {(isAdmin || isSelf) && isLinked && (
                        <button type="button" className="btn-secondary" onClick={handleUnlink}>
                            Unlink Account
                        </button>
                    )}
                    {isAdmin && status === 'active' && (
                        <button type="button" className="btn-danger" onClick={handleArchive}>
                            Archive
                        </button>
                    )}
                </div>
            </div>

            <div className="player-detail__tabs" role="group" aria-label="Rating category">
                {RATING_CATEGORIES.map(category => (
                    <button
                        type="button"
                        key={category}
                        className={`player-tab-btn ${ratingCategory === category ? 'player-tab-btn--active' : ''}`}
                        onClick={() => setRatingCategory(category)}
                    >
                        {categoryLabel(category)}
                    </button>
                ))}
            </div>
            <div className="player-category-loading" role="status" aria-live="polite">
                {loading ? `Updating ${categoryLabel(ratingCategory)} statistics…` : ''}
            </div>

            {/* Biography */}
            {bio && (
                <div className="app-card player-bio">
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Biography & Notes
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text)', lineHeight: 1.5 }}>
                        {bio}
                    </p>
                </div>
            )}

            {/* Stats Dashboard */}
            <div className="players-stats-bar">
                <div className="stat-card">
                    <span className="stat-card__label">Games Played</span>
                    <span className="stat-card__value">{games}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-card__label">Wins</span>
                    <span className="stat-card__value" style={{ color: 'var(--accent)' }}>{wins}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-card__label">Draws</span>
                    <span className="stat-card__value" style={{ color: 'var(--warning)' }}>{draws}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-card__label">Losses</span>
                    <span className="stat-card__value" style={{ color: 'var(--danger)' }}>{losses}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-card__label">Win Rate</span>
                    <span className="stat-card__value">{winRate}%</span>
                </div>
                <div className="stat-card">
                    <span className="stat-card__label">Current streak</span>
                    <span className="stat-card__value">
                        {categoryStats.currentWinStreak ? `${categoryStats.currentWinStreak} W` : categoryStats.currentLossStreak ? `${categoryStats.currentLossStreak} L` : '—'}
                    </span>
                </div>
                <div className="stat-card">
                    <span className="stat-card__label">{categoryLabel(ratingCategory)} Elo Growth</span>
                    <span className="stat-card__value" style={{ color: ratingDelta >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                        {ratingDelta >= 0 ? `+${ratingDelta}` : ratingDelta}
                    </span>
                    <span className="stat-card__subtext">Start rating: {start_rating}</span>
                </div>
            </div>

            {/* Tabbed Navigation */}
            <div className="player-detail__tabs">
                <button
                    type="button"
                    className={`player-tab-btn ${activeTab === 'overview' ? 'player-tab-btn--active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    <Icon name="chart" /> Rating history
                </button>
                <button
                    type="button"
                    className={`player-tab-btn ${activeTab === 'matches' ? 'player-tab-btn--active' : ''}`}
                    onClick={() => setActiveTab('matches')}
                >
                    <Icon name="matches" /> Match History ({matches.length})
                </button>
                <button
                    type="button"
                    className={`player-tab-btn ${activeTab === 'headToHead' ? 'player-tab-btn--active' : ''}`}
                    onClick={() => setActiveTab('headToHead')}
                >
                    <Icon name="players" /> Head-to-head
                </button>
            </div>

            {/* Tab 1: Overview & Rating Chart */}
            {activeTab === 'overview' && (
                <PlayerRatingChart
                    history={ratingHistory}
                    startRating={start_rating}
                    category={ratingCategory}
                />
            )}

            {/* Tab 2: Match History Table */}
            {activeTab === 'matches' && (
                <div className="players-table-wrapper">
                    {matches.length === 0 ? (
                        <div className="page-empty">
                            No match history recorded for this player yet.
                        </div>
                    ) : (
                        <table className="players-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Color Played</th>
                                    <th>Opponent</th>
                                    <th>Result</th>
                                    <th>Match Type</th>
                                </tr>
                            </thead>
                            <tbody>
                                {matches.map((m) => {
                                    const isWhite = m.whitePlayerId === player.id;
                                    const colorPlayed = isWhite ? 'White' : 'Black';
                                    const opponentName = isWhite ? m.blackPlayerName : m.whitePlayerName;
                                    const opponentId = isWhite ? m.blackPlayerId : m.whitePlayerId;

                                    let outcome = 'Draw';
                                    let outcomeColor = 'var(--warning)';

                                    if (m.result === 'draw') {
                                        outcome = 'Draw';
                                        outcomeColor = 'var(--warning)';
                                    } else if ((m.result === 'white' && isWhite) || (m.result === 'black' && !isWhite)) {
                                        outcome = 'Win';
                                        outcomeColor = 'var(--accent)';
                                    } else {
                                        outcome = 'Loss';
                                        outcomeColor = 'var(--danger)';
                                    }

                                    return (
                                        <tr key={m.id}>
                                            <td>{new Date(m.playedAt).toLocaleDateString()}</td>
                                            <td>{colorPlayed}<div className="player-match-rating"><MatchRating match={m} color={isWhite ? 'white' : 'black'} /></div></td>
                                            <td>
                                                <Link to={`/players/${opponentId}`} className="name-link">
                                                    {opponentName}
                                                </Link>
                                                <div className="player-match-rating"><MatchRating match={m} color={isWhite ? 'black' : 'white'} /></div>
                                            </td>
                                            <td>
                                                <strong style={{ color: outcomeColor }}>{outcome}</strong>
                                            </td>
                                            <td style={{ textTransform: 'capitalize' }}>{m.ratingCategory}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Tab 3: Head to Head */}
            {activeTab === 'headToHead' && (
                <HeadToHeadView
                    clubId={club.id}
                    playerA={player}
                    allPlayers={allPlayers}
                />
            )}

            {/* Edit Modal */}
            <EditPlayerForm
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                clubId={club.id}
                player={player}
                isAdmin={isAdmin}
                isOwner={Boolean(capabilities.canManageClubSettings)}
                onPlayerUpdated={refetch}
            />

            {/* Reusable Confirmation Dialog */}
            <ConfirmDialog
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                variant={confirmModal.variant}
                onConfirm={confirmModal.onConfirm}
                onClose={closeConfirmModal}
            />
        </div>
    );
}
