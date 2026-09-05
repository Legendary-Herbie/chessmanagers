import React, { useCallback, useEffect, useMemo, useState } from 'react';
import '../../styles/matches.css';
import Button from '../../shared/common/Button.jsx';
import Dialog from '../../shared/common/Dialog.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { useClub } from '../../app/contextHooks.js';
import { matchApi } from '../../features/matches/api/matchApi.js';
import PlayerSearchSelect from '../../features/players/components/PlayerSearchSelect.jsx';
import { tournamentApi } from '../../features/tournaments/api/tournamentApi.js';
import NoClubState from '../../shared/common/NoClubState.jsx';

const CATEGORIES = ['blitz', 'rapid', 'classical'];
const PAGE_SIZE = 25;
const categoryLabel = category => category[0].toUpperCase() + category.slice(1);

function localDateTime(value = new Date()) {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
        .toISOString().slice(0, 16);
}

function emptyForm() {
    return {
        whitePlayerId: '',
        blackPlayerId: '',
        result: 'white',
        ratingCategory: 'blitz',
        isRated: true,
        playedAt: localDateTime(),
        tournamentId: '',
        notes: '',
    };
}

function resultLabel(result) {
    if (result === 'white') return '1–0';
    if (result === 'black') return '0–1';
    return '½–½';
}

export default function MatchesPage() {
    const { club, capabilities } = useClub();
    const isAdmin = Boolean(capabilities.canManageMatches);
    const [matches, setMatches] = useState([]);
    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [ratedFilter, setRatedFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [playerFilter, setPlayerFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [sortOrder, setSortOrder] = useState('playedAt-desc');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingMatch, setEditingMatch] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [duplicateConfirmation, setDuplicateConfirmation] = useState(null);
    const [lifecycleAction, setLifecycleAction] = useState(null);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(timer);
    }, [search]);

    const loadMatches = useCallback(async (signal) => {
        if (!club) return;
        setLoading(true);
        try {
            const [sortBy, sortDirection] = sortOrder.split('-');
            const response = await matchApi.list(club.id, {
                q: debouncedSearch,
                ratingCategory: categoryFilter === 'all' ? undefined : categoryFilter,
                isRated: ratedFilter === 'all' ? undefined : ratedFilter === 'rated',
                status: statusFilter === 'all' ? undefined : statusFilter,
                playerId: playerFilter || undefined,
                playedFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
                playedTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
                sortBy,
                sortDirection,
                limit: PAGE_SIZE,
                offset: page * PAGE_SIZE,
                signal,
            });
            if (signal?.aborted) return;
            setMatches(response.matches);
            setTotal(response.total);
            setError(null);
        } catch (requestError) {
            if (signal?.aborted) return;
            setError(requestError.message || 'Failed to load matches.');
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [club, debouncedSearch, categoryFilter, ratedFilter, statusFilter, playerFilter, dateFrom, dateTo, sortOrder, page]);

    const loadReferences = useCallback(async () => {
        if (!club) return;
        try {
            const tournamentResponse = await tournamentApi.list(club.id, { limit: 100 });
            setTournaments(tournamentResponse.tournaments);
        } catch (requestError) {
            setError(requestError.message || 'Failed to load match form options.');
        }
    }, [club]);

    useEffect(() => {
        const controller = new AbortController();
        void loadMatches(controller.signal);
        return () => controller.abort();
    }, [loadMatches]);

    useEffect(() => {
        void loadReferences();
    }, [loadReferences]);

    const refreshAll = useCallback(async () => {
        await Promise.all([loadMatches(), loadReferences()]);
    }, [loadMatches, loadReferences]);

    const compatibleTournaments = useMemo(() => tournaments.filter(tournament => (
        tournament.rating_category === form.ratingCategory
        && tournament.is_rated === form.isRated
    )), [tournaments, form.ratingCategory, form.isRated]);

    function openAddModal() {
        setEditingMatch(null);
        setForm(emptyForm());
        setError(null);
        setModalOpen(true);
    }

    function openEditModal(match) {
        setEditingMatch(match);
        setForm({
            whitePlayerId: match.whitePlayerId,
            blackPlayerId: match.blackPlayerId,
            result: match.result,
            ratingCategory: match.ratingCategory,
            isRated: match.isRated,
            playedAt: localDateTime(match.playedAt),
            tournamentId: match.tournamentId || '',
            notes: match.notes || '',
        });
        setError(null);
        setModalOpen(true);
    }

    function setRatingField(field, value) {
        setForm(current => ({ ...current, [field]: value, tournamentId: '' }));
    }

    function payload(confirmDuplicate = false) {
        return {
            whitePlayerId: form.whitePlayerId,
            blackPlayerId: form.blackPlayerId,
            result: form.result,
            ratingCategory: form.ratingCategory,
            isRated: form.isRated,
            playedAt: new Date(form.playedAt).toISOString(),
            tournamentId: form.tournamentId || null,
            notes: form.notes || null,
            confirmDuplicate,
        };
    }

    async function saveMatch(confirmDuplicate = false) {
        setError(null);
        if (!form.whitePlayerId || !form.blackPlayerId) {
            setError('Select both players.');
            return;
        }
        if (form.whitePlayerId === form.blackPlayerId) {
            setError('White and black must be different players.');
            return;
        }
        if (!form.playedAt || Number.isNaN(new Date(form.playedAt).valueOf())) {
            setError('Enter a valid match date and time.');
            return;
        }
        setSaving(true);
        try {
            const requestPayload = payload(confirmDuplicate);
            const response = editingMatch
                ? await matchApi.update(club.id, editingMatch.id, requestPayload)
                : await matchApi.create(club.id, requestPayload);
            setDuplicateConfirmation(null);
            setModalOpen(false);
            setNotice(response.ratingStatus === 'recalculation_pending'
                ? 'Match saved. Ratings are being recalculated.'
                : 'Match saved.');
            await refreshAll();
        } catch (requestError) {
            if (requestError.code === 'POSSIBLE_DUPLICATE_MATCH') {
                setDuplicateConfirmation({ editing: Boolean(editingMatch) });
            } else {
                setError(requestError.message || 'Failed to save match.');
            }
        } finally {
            setSaving(false);
        }
    }

    async function confirmLifecycleAction() {
        if (!lifecycleAction) return;
        if (lifecycleAction.kind === 'void' && !lifecycleAction.reason.trim()) {
            setLifecycleAction(current => ({ ...current, error: 'A void reason is required.' }));
            return;
        }
        setSaving(true);
        try {
            const response = lifecycleAction.kind === 'void'
                ? await matchApi.void(club.id, lifecycleAction.match.id, lifecycleAction.reason.trim())
                : await matchApi.delete(club.id, lifecycleAction.match.id, lifecycleAction.reason.trim() || null);
            setLifecycleAction(null);
            setNotice(response.ratingStatus === 'recalculation_pending'
                ? `Match ${lifecycleAction.kind === 'void' ? 'voided' : 'deleted'}. Ratings are being recalculated.`
                : `Match ${lifecycleAction.kind === 'void' ? 'voided' : 'deleted'}.`);
            await refreshAll();
        } catch (requestError) {
            setLifecycleAction(current => ({
                ...current,
                error: requestError.message || `Failed to ${current.kind} match.`,
            }));
        } finally {
            setSaving(false);
        }
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const firstResult = total === 0 ? 0 : page * PAGE_SIZE + 1;
    const lastResult = Math.min((page + 1) * PAGE_SIZE, total);
    const activeFilterCount = [debouncedSearch, categoryFilter !== 'all', ratedFilter !== 'all',
        statusFilter !== 'all', playerFilter, dateFrom, dateTo, sortOrder !== 'playedAt-desc'].filter(Boolean).length;

    if (!club) return <NoClubState title="Keep every result in one reliable history"
        feature="Record opponents, result, rating category, and when the game was played. Ratings and player statistics update from that shared record."
        description="Create a club or join one before recording and reviewing matches." />;

    return (
        <div className="matches-page">
            <div className="page-header">
                <h1>Matches</h1>
                <div className="matches-header-actions">
                    <Button variant="secondary" aria-expanded={filtersOpen} aria-controls="match-filters"
                        onClick={() => setFiltersOpen(open => !open)}>
                        {filtersOpen ? 'Hide filters' : `Show filters${activeFilterCount ? ` (${activeFilterCount})` : ''}`}
                    </Button>
                    {isAdmin && <Button onClick={openAddModal}>Add Match</Button>}
                </div>
            </div>
            {error && !modalOpen && <div className="error" role="alert"><p>{error}</p><Button variant="secondary" disabled={loading} onClick={() => refreshAll()}>Retry</Button></div>}
            {notice && <div className="match-notice" role="status">{notice}</div>}
            <div className="matches-controls">
                <input className="input" placeholder="Search by player or notes" value={search}
                    onChange={event => { setSearch(event.target.value); setPage(0); }} aria-label="Search matches" />
            </div>
            {filtersOpen && <div className="matches-controls" id="match-filters">
                <PlayerSearchSelect clubId={club.id} label="Filter by player" value={playerFilter}
                    onChange={playerId => { setPlayerFilter(playerId); setPage(0); }}
                    placeholder="All players" allowClear />
                <select className="input" aria-label="Filter by rating category" value={categoryFilter}
                    onChange={event => { setCategoryFilter(event.target.value); setPage(0); }}>
                    <option value="all">All categories</option>
                    {CATEGORIES.map(category => <option key={category} value={category}>{categoryLabel(category)}</option>)}
                </select>
                <select className="input" aria-label="Filter by rated status" value={ratedFilter}
                    onChange={event => { setRatedFilter(event.target.value); setPage(0); }}>
                    <option value="all">Rated and unrated</option>
                    <option value="rated">Rated only</option>
                    <option value="unrated">Unrated only</option>
                </select>
                <select className="input" aria-label="Filter by match status" value={statusFilter}
                    onChange={event => { setStatusFilter(event.target.value); setPage(0); }}>
                    <option value="all">Active and voided</option>
                    <option value="active">Active only</option>
                    <option value="voided">Voided only</option>
                </select>
                <label className="matches-date-filter"><span>From</span><input className="input" type="date" value={dateFrom}
                    onChange={event => { setDateFrom(event.target.value); setPage(0); }} /></label>
                <label className="matches-date-filter"><span>To</span><input className="input" type="date" value={dateTo}
                    min={dateFrom || undefined} onChange={event => { setDateTo(event.target.value); setPage(0); }} /></label>
                <select className="input" aria-label="Sort matches" value={sortOrder}
                    onChange={event => { setSortOrder(event.target.value); setPage(0); }}>
                    <option value="playedAt-desc">Newest played first</option>
                    <option value="playedAt-asc">Oldest played first</option>
                    <option value="createdAt-desc">Recently added first</option>
                    <option value="createdAt-asc">Earliest added first</option>
                </select>
            </div>}

            <div className="matches-list" role="region" aria-label="Match history" tabIndex={0}>
                {loading ? <div className="muted">Loading...</div> : (
                    <table className="matches-table">
                        <thead><tr>
                            <th>Date</th><th>White</th><th>Black</th><th>Result</th>
                            <th>Rating category</th><th>Rated / Unrated</th><th>Status</th><th>Notes</th>
                            {isAdmin && <th>Actions</th>}
                        </tr></thead>
                        <tbody>
                            {matches.map(match => (
                                <tr key={match.id} className={match.status === 'voided' ? 'voided-match' : ''}>
                                    <td>{new Date(match.playedAt).toLocaleString()}</td>
                                    <td>{match.whitePlayerName || match.whitePlayerId}</td>
                                    <td>{match.blackPlayerName || match.blackPlayerId}</td>
                                    <td>{resultLabel(match.result)}</td>
                                    <td><span className="badge time-control">{categoryLabel(match.ratingCategory)}</span></td>
                                    <td>{match.isRated ? 'Rated' : 'Unrated'}</td>
                                    <td><span className={`match-status ${match.status}`}>{categoryLabel(match.status)}</span></td>
                                    <td>{match.notes || '—'}</td>
                                    {isAdmin && <td className="match-actions">
                                        {match.status === 'active' && <>
                                            <Button variant="secondary" onClick={() => openEditModal(match)}>Edit</Button>
                                            <Button variant="warning" onClick={() => setLifecycleAction({ kind: 'void', match, reason: '', error: null })}>Void</Button>
                                        </>}
                                        <Button variant="danger" onClick={() => setLifecycleAction({ kind: 'delete', match, reason: '', error: null })}>Delete</Button>
                                    </td>}
                                </tr>
                            ))}
                            {!matches.length && <tr><td colSpan={isAdmin ? 9 : 8} className="muted">No matches found.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="matches-pagination" aria-label="Match results pagination">
                <span>{firstResult}–{lastResult} of {total}</span>
                <div>
                    <Button variant="secondary" disabled={page === 0 || loading} onClick={() => setPage(current => Math.max(0, current - 1))}>Previous</Button>
                    <span>Page {page + 1} of {totalPages}</span>
                    <Button variant="secondary" disabled={page + 1 >= totalPages || loading} onClick={() => setPage(current => current + 1)}>Next</Button>
                </div>
            </div>

            {modalOpen && <Dialog title={editingMatch ? 'Edit Match' : 'Add Match'} busy={saving}
                onClose={() => setModalOpen(false)}>
                    <div className="modal-body">
                        {error && <div className="error" role="alert">{error}</div>}
                        <PlayerSearchSelect clubId={club.id} label="White" value={form.whitePlayerId}
                            selectedPlayer={editingMatch ? {
                                id: editingMatch.whitePlayerId,
                                name: editingMatch.whitePlayerName || editingMatch.whitePlayerId,
                            } : null}
                            onChange={playerId => setForm(current => ({ ...current, whitePlayerId: playerId }))}
                            placeholder="Search for White" />
                        <PlayerSearchSelect clubId={club.id} label="Black" value={form.blackPlayerId}
                            selectedPlayer={editingMatch ? {
                                id: editingMatch.blackPlayerId,
                                name: editingMatch.blackPlayerName || editingMatch.blackPlayerId,
                            } : null}
                            onChange={playerId => setForm(current => ({ ...current, blackPlayerId: playerId }))}
                            placeholder="Search for Black" />
                        <label className="form-row"><span className="label">Result</span>
                            <select value={form.result} onChange={event => setForm({ ...form, result: event.target.value })} className="input">
                                <option value="white">White wins</option><option value="black">Black wins</option><option value="draw">Draw</option>
                            </select>
                        </label>
                        <div className="form-row"><span className="label">Rating category</span>
                            <div className="match-category-switcher" role="group" aria-label="Rating category">
                                {CATEGORIES.map(category => <button type="button" key={category}
                                    className={form.ratingCategory === category ? 'active' : ''}
                                    onClick={() => setRatingField('ratingCategory', category)}>{categoryLabel(category)}</button>)}
                            </div>
                        </div>
                        <label className="rated-toggle">
                            <input type="checkbox" checked={form.isRated}
                                onChange={event => setRatingField('isRated', event.target.checked)} />
                            Rated match
                        </label>
                        <label className="form-row"><span className="label">Played at</span>
                            <input type="datetime-local" className="input" required value={form.playedAt}
                                onChange={event => setForm({ ...form, playedAt: event.target.value })} />
                        </label>
                        {compatibleTournaments.length > 0 && <label className="form-row"><span className="label">Tournament (optional)</span>
                            <select className="input" value={form.tournamentId}
                                onChange={event => setForm({ ...form, tournamentId: event.target.value })}>
                                <option value="">Not a tournament match</option>
                                {compatibleTournaments.map(tournament => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}
                            </select>
                        </label>}
                        <label className="form-row"><span className="label">Notes (optional)</span>
                            <textarea className="input" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} />
                        </label>
                    </div>
                    <div className="modal-footer">
                        <Button variant="secondary" disabled={saving} onClick={() => setModalOpen(false)}>Cancel</Button>
                        <Button variant="primary" disabled={saving} onClick={() => saveMatch(false)}>
                            {saving ? 'Saving...' : editingMatch ? 'Save changes' : 'Create match'}
                        </Button>
                    </div>
            </Dialog>}

            <ConfirmDialog isOpen={Boolean(duplicateConfirmation)} title="Possible duplicate match"
                message="A matching record exists within five minutes. Save this match anyway?"
                confirmLabel="Save anyway" variant="warning" loading={saving}
                onClose={() => setDuplicateConfirmation(null)} onConfirm={() => saveMatch(true)} />

            <ConfirmDialog isOpen={Boolean(lifecycleAction)}
                title={lifecycleAction?.kind === 'void' ? 'Void match' : 'Delete match'}
                message={lifecycleAction?.kind === 'void'
                    ? 'Voiding preserves the record but excludes it from ratings and statistics.'
                    : 'Deleting hides the match while preserving its audit history.'}
                confirmLabel={lifecycleAction?.kind === 'void' ? 'Void match' : 'Delete match'}
                variant={lifecycleAction?.kind === 'void' ? 'warning' : 'danger'} loading={saving}
                onClose={() => setLifecycleAction(null)} onConfirm={confirmLifecycleAction}>
                <label className="form-row"><span className="label">
                    Reason {lifecycleAction?.kind === 'void' ? '(required)' : '(optional)'}
                </span><textarea className="input" value={lifecycleAction?.reason || ''}
                    onChange={event => setLifecycleAction(current => ({ ...current, reason: event.target.value, error: null }))} /></label>
                {lifecycleAction?.error && <div className="error" role="alert">{lifecycleAction.error}</div>}
            </ConfirmDialog>
        </div>
    );
}
