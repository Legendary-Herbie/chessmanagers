import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useClub } from '../../app/contextHooks.js';
import { usePlayers } from '../../features/players/hooks/usePlayers.js';

import PlayerCard from '../../features/players/components/PlayerCard.jsx';
import PlayerTable from '../../features/players/roster/PlayerTable.jsx';
import AddPlayerForm from '../../features/players/admin/AddPlayerForm.jsx';
import EditPlayerForm from '../../features/players/admin/EditPlayerForm.jsx';
import PendingLinksList from '../../features/players/admin/PendingLinksList.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

import '../../styles/players.css';

export default function PlayersPage() {
    const { user } = useAuth();
    const { club, linkedPlayer, capabilities, loading: clubLoading } = useClub();
    const isAdmin = Boolean(capabilities.canManagePlayers);

    const {
        processedPlayers,
        inactivePlayers,
        stats,
        loading,
        error,
        searchTerm,
        setSearchTerm,
        statusFilter,
        setStatusFilter,
        sortBy,
        setSortBy,
        viewMode,
        setViewMode,
        refetch,
        claimPlayer,
        unlinkPlayer,
        archivePlayer,
        restorePlayer,
    } = usePlayers(club?.id, { includeInactive: isAdmin });

    // Inline add form toggle
    const [showInlineAddForm, setShowInlineAddForm] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState(null);

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
    const handleClaimClick = (player) => {
        setConfirmModal({
            isOpen: true,
            title: 'Claim Player Profile',
            message: `Are you sure you want to request to claim the profile "${player.name}"? An admin will review your request.`,
            variant: 'primary',
            onConfirm: async () => {
                try {
                    await claimPlayer(player.id);
                } catch (err) {
                    alert(err.message || 'Failed to submit claim request.');
                } finally {
                    closeConfirmModal();
                }
            },
        });
    };

    // Unlink Player Handler with ConfirmDialog
    const handleUnlinkClick = (player) => {
        setConfirmModal({
            isOpen: true,
            title: 'Unlink Account',
            message: `Are you sure you want to unlink the user account from player "${player.name}"?`,
            variant: 'warning',
            onConfirm: async () => {
                try {
                    await unlinkPlayer(player.id);
                } catch (err) {
                    alert(err.message || 'Failed to unlink player.');
                } finally {
                    closeConfirmModal();
                }
            },
        });
    };

    // Archive removes a player from new match entry and rankings while preserving history.
    const handleDeleteClick = (player) => {
        setConfirmModal({
            isOpen: true,
            title: 'Archive Player',
            message: `Archive "${player.name}"? Their match and rating history will be preserved, and an admin can restore them later.`,
            variant: 'warning',
            onConfirm: async () => {
                try {
                    await archivePlayer(player.id);
                } catch (err) {
                    alert(err.message || 'Failed to archive player.');
                } finally {
                    closeConfirmModal();
                }
            },
        });
    };

    if (clubLoading) {
        return (
            <div className="players-container">
                <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    Loading club context...
                </div>
            </div>
        );
    }

    if (!club) {
        return (
            <div className="players-container">
                <div className="empty-state">
                    <span className="empty-state__icon">♟️</span>
                    <h2 className="empty-state__title">No Club Selected</h2>
                    <p className="empty-state__description">
                        You need to belong to or create a chess club to manage players.
                    </p>
                    <Link to="/create-club" className="btn-primary">
                        Create a Club
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="players-container">
            {/* Header */}
            <div className="players-header">
                <div className="players-header__title-group">
                    <h1>Club Players</h1>
                    <p className="players-header__subtitle">
                        Manage player rosters, ELO ratings, and account linkage for <strong>{club.name}</strong>.
                    </p>
                </div>

                {/* Only admins can toggle the Add Player Form */}
                {isAdmin && (
                    <div className="players-header__actions">
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => setShowInlineAddForm((prev) => !prev)}
                        >
                            {showInlineAddForm ? '✕ Close Form' : '➕ Add Player Form'}
                        </button>
                    </div>
                )}
            </div>

            {/* Integrated Inline Add Player Form (Admin only) */}
            {isAdmin && showInlineAddForm && (
                <AddPlayerForm
                    isInline={true}
                    clubId={club.id}
                    onPlayerAdded={() => {
                        refetch();
                    }}
                    onClose={() => setShowInlineAddForm(false)}
                />
            )}

            {/* Admin Pending Requests Banner */}
            {isAdmin && <PendingLinksList clubId={club.id} onActionComplete={refetch} />}

            {/* Stats Summary Bar */}
            <div className="players-stats-bar">
                <div className="stat-card">
                    <span className="stat-card__label">Total Roster</span>
                    <span className="stat-card__value">{stats.totalPlayers}</span>
                    <span className="stat-card__subtext">Registered club players</span>
                </div>
                <div className="stat-card">
                    <span className="stat-card__label">Average ELO</span>
                    <span className="stat-card__value">🏆 {stats.avgRating}</span>
                    <span className="stat-card__subtext">Club rating average</span>
                </div>
                <div className="stat-card">
                    <span className="stat-card__label">Active Players</span>
                    <span className="stat-card__value">{stats.activePlayers}</span>
                    <span className="stat-card__subtext">Played at least 1 match</span>
                </div>
                <div className="stat-card">
                    <span className="stat-card__label">Pending Claims</span>
                    <span className="stat-card__value" style={{ color: stats.pendingClaimsCount > 0 ? 'var(--warning)' : 'inherit' }}>
                        {stats.pendingClaimsCount}
                    </span>
                    <span className="stat-card__subtext">Awaiting admin review</span>
                </div>
            </div>

            {/* Toolbar: Search, Filters, Sorting & View Toggle */}
            <div className="players-toolbar">
                <div className="players-toolbar__search">
                    <span className="players-toolbar__search-icon">🔍</span>
                    <input
                        type="text"
                        className="players-toolbar__search-input"
                        placeholder="Search players by name or bio..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="players-toolbar__filters">
                    <select
                        className="players-filter-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        aria-label="Filter by link status"
                    >
                        <option value="all">All Statuses</option>
                        <option value="claimed">Claimed Only</option>
                        <option value="pending">Pending Claim</option>
                        <option value="unlinked">Unlinked Only</option>
                    </select>

                    <select
                        className="players-filter-select"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        aria-label="Sort players"
                    >
                        <option value="rating_desc">Highest ELO First</option>
                        <option value="rating_asc">Lowest ELO First</option>
                        <option value="name_asc">Name (A-Z)</option>
                        <option value="games_desc">Most Games Played</option>
                        <option value="winrate_desc">Highest Win Rate</option>
                    </select>

                    <div className="view-toggle">
                        <button
                            type="button"
                            className={`view-toggle__button ${viewMode === 'grid' ? 'view-toggle__button--active' : ''}`}
                            onClick={() => setViewMode('grid')}
                        >
                            ▦ Grid
                        </button>
                        <button
                            type="button"
                            className={`view-toggle__button ${viewMode === 'table' ? 'view-toggle__button--active' : ''}`}
                            onClick={() => setViewMode('table')}
                        >
                            ≡ List
                        </button>
                    </div>
                </div>
            </div>

            {/* Error banner */}
            {error && <div className="error-box">{error}</div>}

            {/* Loading & Empty states */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    Fetching player records...
                </div>
            ) : processedPlayers.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="empty-state">
                        <span className="empty-state__icon">👥</span>
                        <h3 className="empty-state__title">No Players Found</h3>
                        <p className="empty-state__description">
                            {searchTerm || statusFilter !== 'all'
                                ? 'No players matched your search filters. Try clearing search parameters.'
                                : 'No players have been added to this club roster yet.'}
                        </p>
                    </div>

                    {isAdmin && !showInlineAddForm && !searchTerm && (
                        <AddPlayerForm
                            isInline={true}
                            clubId={club.id}
                            onPlayerAdded={refetch}
                        />
                    )}
                </div>
            ) : viewMode === 'grid' ? (
                /* Grid View */
                <div className="players-grid">
                    {processedPlayers.map((player) => (
                        <PlayerCard
                            key={player.id}
                            player={player}
                            currentUser={user}
                            currentLinkedPlayerId={linkedPlayer?.id}
                            isAdmin={isAdmin}
                            onClaim={handleClaimClick}
                            onEdit={(p) => setEditingPlayer(p)}
                            onDelete={handleDeleteClick}
                            onUnlink={handleUnlinkClick}
                        />
                    ))}
                </div>
            ) : (
                /* Table View */
                <PlayerTable
                    players={processedPlayers}
                    currentLinkedPlayerId={linkedPlayer?.id}
                    isAdmin={isAdmin}
                    onEdit={(p) => setEditingPlayer(p)}
                    onDelete={handleDeleteClick}
                />
            )}

            {/* Edit Player Modal */}
            <EditPlayerForm
                isOpen={!!editingPlayer}
                onClose={() => setEditingPlayer(null)}
                clubId={club.id}
                player={editingPlayer}
                isAdmin={isAdmin}
                onPlayerUpdated={refetch}
            />

            {isAdmin && inactivePlayers.length > 0 && (
                <section className="players-table-wrapper" style={{ marginTop: '24px', padding: '16px' }}>
                    <h2 style={{ marginTop: 0 }}>Archived players</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Archived records retain their full match and rating history.</p>
                    {inactivePlayers.map((archived) => (
                        <div key={archived.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                            <Link to={`/players/${archived.id}`}>{archived.name}</Link>
                            <button type="button" className="btn-secondary btn-sm" onClick={() => restorePlayer(archived.id)}>
                                Restore
                            </button>
                        </div>
                    ))}
                </section>
            )}

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
