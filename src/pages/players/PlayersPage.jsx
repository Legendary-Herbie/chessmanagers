import Disclosure from '../../shared/common/Disclosure.jsx';
import Icon from '../../shared/common/Icon.jsx';
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth, useClub, useNotifications } from '../../app/contextHooks.js';
import { usePlayers } from '../../features/players/hooks/usePlayers.js';

import PlayerCard from '../../features/players/components/PlayerCard.jsx';
import PlayerTable from '../../features/players/roster/PlayerTable.jsx';
import AddPlayerForm from '../../features/players/admin/AddPlayerForm.jsx';
import EditPlayerForm from '../../features/players/admin/EditPlayerForm.jsx';
import PendingLinksList from '../../features/players/admin/PendingLinksList.jsx';
import { runPlayerAction } from '../../features/players/playerActionFeedback.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import NoClubState from '../../shared/common/NoClubState.jsx';

import '../../styles/players.css';

export default function PlayersPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const { club, linkedPlayer, capabilities, loading: clubLoading } = useClub();
    const { notify } = useNotifications();
    const isAdmin = Boolean(capabilities.canManagePlayers);

    const {
        processedPlayers,
        inactivePlayers,
        stats,
        loading,
        error,
        ratingCategory,
        setRatingCategory,
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

    // Player creation lives in a focused modal so the roster stays uncluttered.
    const [showInlineAddForm, setShowInlineAddForm] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState(null);
    useEffect(() => {
        if (club?.id && isAdmin && searchParams.get('action') === 'add') {
            setShowInlineAddForm(true);
            const next = new URLSearchParams(searchParams); next.delete('action');
            setSearchParams(next, { replace: true });
        }
    }, [club?.id, isAdmin, searchParams, setSearchParams]);

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
                await runPlayerAction(() => claimPlayer(player.id), {
                    notify,
                    successMessage: 'Claim request submitted.',
                    fallbackError: 'Failed to submit claim request.',
                });
                closeConfirmModal();
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
                await runPlayerAction(() => unlinkPlayer(player.id), {
                    notify,
                    successMessage: 'Player link removed.',
                    fallbackError: 'Failed to unlink player.',
                });
                closeConfirmModal();
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
                await runPlayerAction(() => archivePlayer(player.id), {
                    notify,
                    successMessage: 'Player archived.',
                    fallbackError: 'Failed to archive player.',
                });
                closeConfirmModal();
            },
        });
    };

    if (clubLoading) {
        return (
            <div className="players-container">
                <div className="page-empty">
                    Loading club context...
                </div>
            </div>
        );
    }

    if (!club) {
        return <NoClubState title="Create a roster people can trust"
            feature="Players can exist with or without accounts, keep separate Blitz, Rapid, and Classical ratings, and retain their match history."
            description="Create a new club or join one to view and manage its players." />;
    }

    return (
        <div className="players-container">
            {/* Header */}
            <div className="players-header">
                <div className="players-header__title-group">
                    <h1>Club Players</h1>
                    <p className="players-header__subtitle">
                        Manage player rosters, Elo ratings, and account linkage for <strong>{club.name}</strong>.
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
                            Add players
                        </button>
                    </div>
                )}
            </div>

            {/* Admin Pending Requests Banner */}


            {/* Toolbar: Search, Filters, Sorting & View Toggle */}
            <div className="players-toolbar">
                <div className="players-toolbar__search">
                    <span className="players-toolbar__search-icon"><Icon name="search" /></span>
                    <input
                        type="text"
                        className="players-toolbar__search-input"
                        placeholder="Search players by name or bio..."
                        aria-label="Search players"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <Disclosure className="players-filter-disclosure" title="Filters and view"><div className="players-toolbar__filters">
                    <label>Rating category <select className="players-filter-select" value={ratingCategory}
                        onChange={event => setRatingCategory(event.target.value)}>
                        <option value="blitz">Blitz</option><option value="rapid">Rapid</option><option value="classical">Classical</option>
                    </select></label>
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
                        <option value="rating_desc">Highest Elo rating first</option>
                        <option value="rating_asc">Lowest Elo rating first</option>
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
                            <Icon name="grid" /> Grid
                        </button>
                        <button
                            type="button"
                            className={`view-toggle__button ${viewMode === 'table' ? 'view-toggle__button--active' : ''}`}
                            onClick={() => setViewMode('table')}
                        >
                            <Icon name="list" /> List
                        </button>
                    </div>
                </div></Disclosure>
            </div>

            <Disclosure className="roster-summary" title={loading ? 'Loading roster…' : `${stats.totalPlayers} players · ${stats.activePlayers} with games played`}>
                <p>Average Elo ratings: Blitz {stats.averageRatings.blitz ?? '—'} · Rapid {stats.averageRatings.rapid ?? '—'} · Classical {stats.averageRatings.classical ?? '—'}</p>
            </Disclosure>



            {/* Error banner */}
            {error && <div className="error-box" role="alert"><p>Couldn’t load players. Try again. {error}</p><button type="button" className="btn-secondary" disabled={loading} onClick={() => refetch()}>Retry</button></div>}

            {/* Loading & Empty states */}
            {loading ? (
                <div className="page-empty">
                    Fetching player records...
                </div>
            ) : error ? null : processedPlayers.length === 0 ? (
                <div className="page-stack">
                    <div className="empty-state">
                        <span className="empty-state__icon"><Icon name="players" size="xl" /></span>
                        <h3 className="empty-state__title">No Players Found</h3>
                        <p className="empty-state__description">
                            {searchTerm || statusFilter !== 'all'
                                ? 'No players matched your search filters. Try clearing search parameters.'
                                : 'No players have been added to this club roster yet.'}
                        </p>
                    </div>

                    {isAdmin && !searchTerm && statusFilter === 'all' && <button type="button" className="btn-primary empty-state__action"
                        onClick={() => setShowInlineAddForm(true)}>Add your first players</button>}
                </div>
            ) : viewMode === 'grid' ? (
                /* Grid View */
                <div className="players-grid">
                    {processedPlayers.map((player) => (
                        <PlayerCard
                            key={player.id}
                            player={player}
                            ratingCategory={ratingCategory}
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
                    ratingCategory={ratingCategory}
                    currentLinkedPlayerId={linkedPlayer?.id}
                    isAdmin={isAdmin}
                    onEdit={(p) => setEditingPlayer(p)}
                    onDelete={handleDeleteClick}
                />
            )}

            {isAdmin && <PendingLinksList clubId={club.id} onActionComplete={refetch} />}

            {/* Edit Player Modal */}
            <EditPlayerForm
                isOpen={!!editingPlayer}
                onClose={() => setEditingPlayer(null)}
                clubId={club.id}
                player={editingPlayer}
                isAdmin={isAdmin}
                isOwner={Boolean(capabilities.canManageClubSettings)}
                onPlayerUpdated={refetch}
            />

            {isAdmin && <AddPlayerForm isOpen={showInlineAddForm} clubId={club.id}
                ratingSettings={club.rating_settings} onPlayerAdded={refetch}
                onClose={() => setShowInlineAddForm(false)} />}

            {isAdmin && inactivePlayers.length > 0 && (
                <section className="players-table-wrapper" style={{ marginTop: '24px', padding: '16px' }}>
                    <h2 style={{ marginTop: 0 }}>Archived players</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Archived records retain their full match and rating history.</p>
                    {inactivePlayers.map((archived) => (
                        <div key={archived.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                            <Link className="name-link" to={`/players/${archived.id}`}>{archived.name}</Link>
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
