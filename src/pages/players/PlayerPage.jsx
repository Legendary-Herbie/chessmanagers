import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth, useClub } from '../../app/contextHooks.js';
import { usePlayer } from '../../features/players/hooks/usePlayer.js';

import EditPlayerForm from '../../features/players/admin/EditPlayerForm.jsx';
import PlayerRatingChart from '../../features/players/profile/PlayerRatingChart.jsx';
import HeadToHeadView from '../../features/players/profile/HeadToHeadView.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

import '../../styles/players.css';

export default function PlayerPage() {
    const { playerId } = useParams();
    const navigate = useNavigate();
    const { user, isAdmin } = useAuth();
    const { club, loading: clubLoading } = useClub();

    const {
        player,
        allPlayers,
        matches,
        ratingHistory,
        loading,
        error,
        refetch,
        claimPlayer,
        unlinkPlayer,
        deletePlayer,
    } = usePlayer(club?.id, playerId);

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
                try {
                    await claimPlayer();
                } catch (err) {
                    alert(err.message || 'Failed to submit claim request.');
                } finally {
                    closeConfirmModal();
                }
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
                try {
                    await unlinkPlayer();
                } catch (err) {
                    alert(err.message || 'Failed to unlink player.');
                } finally {
                    closeConfirmModal();
                }
            },
        });
    };

    // Delete Player Handler with ConfirmDialog
    const handleDelete = () => {
        setConfirmModal({
            isOpen: true,
            title: 'Delete Player',
            message: `PERMANENTLY DELETE "${player?.name}"? This action cannot be undone.`,
            variant: 'danger',
            onConfirm: async () => {
                try {
                    await deletePlayer();
                    navigate('/players');
                } catch (err) {
                    alert(err.message || 'Failed to delete player.');
                } finally {
                    closeConfirmModal();
                }
            },
        });
    };

    if (clubLoading || loading) {
        return (
            <div className="players-container">
                <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
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
        rating = 1200,
        start_rating = 1200,
        bio,
        games = 0,
        wins = 0,
        draws = 0,
        losses = 0,
        link_status,
        linked_user_id,
        created_at,
    } = player;

    const initials = name
        ? name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
        : 'P';

    const winRate = games > 0 ? Math.round(((wins + draws * 0.5) / games) * 100) : 0;
    const ratingDelta = rating - start_rating;
    const isSelf = user && linked_user_id === user.id;
    const canEdit = isAdmin || isSelf;
    const isLinked = link_status === 'approved';
    const isPending = link_status === 'pending';
    const canClaim = user && !isAdmin && !isLinked && !isPending && !user.linkStatus;

    return (
        <div className="players-container">
            {/* Breadcrumb navigation */}
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                <Link to="/players" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
                    ← Players Roster
                </Link>
                <span style={{ margin: '0 8px' }}>/</span>
                <span>{name}</span>
            </div>

            {/* Profile Header Card */}
            <div className="player-detail__header-card">
                <div className="player-detail__identity">
                    <div className="player-detail__avatar">{initials}</div>
                    <div className="player-detail__title-block">
                        <h1>{name}</h1>
                        <div className="player-detail__badges">
                            <span className="rating-badge" style={{ fontSize: '0.85rem', padding: '4px 10px' }}>
                                🏆 {rating} ELO
                            </span>
                            {isLinked && <span className="link-badge link-badge--approved">✓ Claimed Profile</span>}
                            {isPending && <span className="link-badge link-badge--pending">⏳ Pending Claim</span>}
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
                            ✏️ Edit Profile
                        </button>
                    )}
                    {isAdmin && isLinked && (
                        <button type="button" className="btn-secondary" onClick={handleUnlink}>
                            Unlink Account
                        </button>
                    )}
                    {isAdmin && (
                        <button type="button" className="btn-danger" onClick={handleDelete}>
                            Delete
                        </button>
                    )}
                </div>
            </div>

            {/* Biography */}
            {bio && (
                <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px' }}>
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
                    <span className="stat-card__label">ELO Growth</span>
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
                    📈 Rating History Trajectory
                </button>
                <button
                    type="button"
                    className={`player-tab-btn ${activeTab === 'matches' ? 'player-tab-btn--active' : ''}`}
                    onClick={() => setActiveTab('matches')}
                >
                    ⚔️ Match History ({matches.length})
                </button>
                <button
                    type="button"
                    className={`player-tab-btn ${activeTab === 'headToHead' ? 'player-tab-btn--active' : ''}`}
                    onClick={() => setActiveTab('headToHead')}
                >
                    🤝 Head-to-Head Rivalry
                </button>
            </div>

            {/* Tab 1: Overview & Rating Chart */}
            {activeTab === 'overview' && (
                <PlayerRatingChart history={ratingHistory} startRating={start_rating} />
            )}

            {/* Tab 2: Match History Table */}
            {activeTab === 'matches' && (
                <div className="players-table-wrapper">
                    {matches.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                                    const isWhite = m.white_player_id === player.id;
                                    const colorPlayed = isWhite ? 'White ♔' : 'Black ♚';
                                    const opponentName = isWhite ? (m.black_name || 'Opponent') : (m.white_name || 'Opponent');
                                    const opponentId = isWhite ? m.black_player_id : m.white_player_id;

                                    let outcome = 'Draw';
                                    let outcomeColor = 'var(--warning)';

                                    if (m.result === 'draw') {
                                        outcome = 'Draw 🤝';
                                        outcomeColor = 'var(--warning)';
                                    } else if ((m.result === 'white' && isWhite) || (m.result === 'black' && !isWhite)) {
                                        outcome = 'Win 🏆';
                                        outcomeColor = 'var(--accent)';
                                    } else {
                                        outcome = 'Loss ❌';
                                        outcomeColor = 'var(--danger)';
                                    }

                                    return (
                                        <tr key={m.id}>
                                            <td>{new Date(m.played_at || m.created_at).toLocaleDateString()}</td>
                                            <td>{colorPlayed}</td>
                                            <td>
                                                <Link to={`/players/${opponentId}`} style={{ color: 'var(--text-strong)', textDecoration: 'none', fontWeight: 600 }}>
                                                    {opponentName}
                                                </Link>
                                            </td>
                                            <td>
                                                <strong style={{ color: outcomeColor }}>{outcome}</strong>
                                            </td>
                                            <td style={{ textTransform: 'capitalize' }}>{m.type}</td>
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
