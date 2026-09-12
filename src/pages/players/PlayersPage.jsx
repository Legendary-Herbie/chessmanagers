import ClaimedBadge from '../../features/players/components/ClaimedBadge.jsx';
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

    const [visibleCount, setVisibleCount] = useState(24);
    const [restoringId, setRestoringId] = useState(null);
    const [archiveSearch, setArchiveSearch] = useState('');
    useEffect(() => { setVisibleCount(24); }, [club?.id, searchTerm, statusFilter, sortBy, ratingCategory]);
    const clearFilters = () => { setSearchTerm(''); setStatusFilter('all'); };
    const hasFilters = Boolean(searchTerm || statusFilter !== 'all');
    const visiblePlayers = processedPlayers.slice(0, visibleCount);
    const handleRestore = async (player) => {
        setRestoringId(player.id);
        try {
            await runPlayerAction(() => restorePlayer(player.id), {
                notify, successMessage: `${player.name} restored.`, fallbackError: 'Could not restore player.',
            });
        } finally { setRestoringId(null); }
    };

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
                        Find players and manage the roster for <strong>{club.name}</strong>.
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
            <div className="players-toolbar roster-controls">
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

                <div className="players-toolbar__filters">
                    <label className="roster-control-label">Account link
                    <select
                        className="players-filter-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        aria-label="Filter by link status"
                    >
                        <option value="all">All players</option>
                        <option value="claimed">Claimed</option>
                        <option value="pending">Pending claim</option>
                        <option value="unlinked">Unlinked</option>
                    </select></label>

                    <label className="roster-control-label">Sort by<select
                        className="players-filter-select"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        aria-label="Sort players"
                    >
                        <option value="rating_desc">Highest Rapid rating first</option>
                        <option value="rating_asc">Lowest Rapid rating first</option>
                        <option value="name_asc">Name (A-Z)</option>
                        <option value="games_desc">Most games (all categories)</option>
                        <option value="winrate_desc">Highest win rate (all categories)</option>
                    </select></label>

                    <div className="view-toggle" role="group" aria-label="Roster view">
                        <button
                            type="button"
                            className={`view-toggle__button ${viewMode === 'grid' ? 'view-toggle__button--active' : ''}`}
                            aria-pressed={viewMode === 'grid'}
                            onClick={() => setViewMode('grid')}
                        >
                            <Icon name="grid" /> Grid
                        </button>
                        <button
                            type="button"
                            className={`view-toggle__button ${viewMode === 'table' ? 'view-toggle__button--active' : ''}`}
                            aria-pressed={viewMode === 'table'}
                            onClick={() => setViewMode('table')}
                        >
                            <Icon name="list" /> List
                        </button>
                    </div>
                </div>
            </div>

            <div className="roster-results">
                <p role="status">{loading ? 'Loading roster…' : `${processedPlayers.length} of ${stats.totalPlayers} players`}</p>
                {hasFilters && <button type="button" className="btn-secondary btn-sm" onClick={clearFilters}>Clear filters</button>}
            </div>

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
                                ? 'No players matched your search filters. Clear the filters to see the full roster.'
                                : 'No players have been added to this club roster yet.'}
                        </p>
                    </div>

                    {isAdmin && !searchTerm && statusFilter === 'all' && <button type="button" className="btn-primary empty-state__action"
                        onClick={() => setShowInlineAddForm(true)}>Add your first players</button>}
                </div>
            ) : viewMode === 'grid' ? (
                /* Grid View */
                <div className="players-grid">
                    {visiblePlayers.map((player) => (
                        <PlayerCard
                            key={player.id}
                            player={player}
                            showAllRatings
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
                    players={visiblePlayers}
                    currentUser={user}
                    onClaim={handleClaimClick}
                    onUnlink={handleUnlinkClick}
                    showAllRatings
                    ratingCategory={ratingCategory}
                    currentLinkedPlayerId={linkedPlayer?.id}
                    isAdmin={isAdmin}
                    onEdit={(p) => setEditingPlayer(p)}
                    onDelete={handleDeleteClick}
                />
            )}

            {!loading && !error && processedPlayers.length > visibleCount && <div className="roster-load-more">
                <button type="button" className="btn-secondary" onClick={() => setVisibleCount(count => count + 24)}>
                    Show more players ({processedPlayers.length - visibleCount} remaining)
                </button>
            </div>}

            <Disclosure className="roster-summary" title="Roster statistics">
                <p>{stats.activePlayers} players with games played. Average Elo ratings: Blitz {stats.averageRatings.blitz ?? '—'} · Rapid {stats.averageRatings.rapid ?? '—'} · Classical {stats.averageRatings.classical ?? '—'}</p>
            </Disclosure>

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
                <Disclosure className="roster-archive" title={`Archived players (${inactivePlayers.length})`}>
                    <p className="muted">Archived players retain their match and rating history.</p>
                    <input className="input" aria-label="Search archived players" placeholder="Search archived players"
                        value={archiveSearch} onChange={event => setArchiveSearch(event.target.value)} />
                    {inactivePlayers.filter(player => player.name.toLocaleLowerCase().includes(archiveSearch.trim().toLocaleLowerCase())).map(archived => (
                        <div key={archived.id} className="roster-archive__row">
                            <Link className="name-link" to={`/players/${archived.id}`}>{archived.name} <ClaimedBadge status={archived.link_status} /></Link>
                            <button type="button" className="btn-secondary btn-sm" disabled={Boolean(restoringId)} onClick={() => handleRestore(archived)}>
                                {restoringId === archived.id ? 'Restoring…' : 'Restore'}
                            </button>
                        </div>
                    ))}
                    {!inactivePlayers.some(player => player.name.toLocaleLowerCase().includes(archiveSearch.trim().toLocaleLowerCase())) && <p role="status">No archived players match your search.</p>}
                </Disclosure>
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
