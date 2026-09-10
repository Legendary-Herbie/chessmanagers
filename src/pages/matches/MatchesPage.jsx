import MatchRating from '../../features/matches/components/MatchRating.jsx';
import NotificationMatchPreview from '../../features/matches/components/NotificationMatchPreview.jsx';
import Disclosure from '../../shared/common/Disclosure.jsx';
import ActionMenu from '../../shared/common/ActionMenu.jsx';
import React, { useCallback, useEffect, useState } from 'react';
import '../../styles/matches.css';
import Button from '../../shared/common/Button.jsx';
import Dialog from '../../shared/common/Dialog.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { useClub } from '../../app/contextHooks.js';
import { matchApi } from '../../features/matches/api/matchApi.js';
import PlayerSearchSelect from '../../features/players/components/PlayerSearchSelect.jsx';
import NoClubState from '../../shared/common/NoClubState.jsx';
import { useSearchParams } from 'react-router-dom';

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
        ratingCategory: 'rapid',
        isRated: true,
        playedAt: localDateTime(),
        notes: '',
    };
}

function resultLabel(result) {
    if (result === 'white') return '1–0';
    if (result === 'black') return '0–1';
    return '½–½';
}

export default function MatchesPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { club, capabilities } = useClub();
    const isAdmin = Boolean(capabilities.canManageMatches);
    const [matches, setMatches] = useState([]);
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
    const [entrySettings, setEntrySettings] = useState({ ratingCategory: 'rapid', isRated: true });
    const [entryVersion, setEntryVersion] = useState(0);

    useEffect(() => {
        setModalOpen(false);
        setEntrySettings({ ratingCategory: 'rapid', isRated: true });
        setDuplicateConfirmation(null);
    }, [club?.id]);
    useEffect(() => {
        if (club?.id && isAdmin && searchParams.get('action') === 'add') {
            setEditingMatch(null); setForm(emptyForm()); setModalOpen(true);
            const next = new URLSearchParams(searchParams); next.delete('action');
            setSearchParams(next, { replace: true });
        }
    }, [club?.id, isAdmin, searchParams, setSearchParams]);

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

    useEffect(() => {
        const controller = new AbortController();
        void loadMatches(controller.signal);
        return () => controller.abort();
    }, [loadMatches]);

    const refreshAll = () => loadMatches();

    function openAddModal() {
        setEditingMatch(null);
        setForm({ ...emptyForm(), ...entrySettings });
        setEntryVersion(value => value + 1);
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
            notes: match.notes || '',
        });
        setError(null);
        setModalOpen(true);
    }

    function setRatingField(field, value) {
        setForm(current => ({ ...current, [field]: value }));
        if (!editingMatch) setEntrySettings(current => ({ ...current, [field]: value }));
    }

    function payload(confirmDuplicate = false) {
        return {
            whitePlayerId: form.whitePlayerId,
            blackPlayerId: form.blackPlayerId,
            result: form.result,
            ratingCategory: form.ratingCategory,
            isRated: form.isRated,
            playedAt: new Date(form.playedAt).toISOString(),
            notes: form.notes || null,
            confirmDuplicate,
        };
    }

    async function saveMatch(confirmDuplicate = false, addAnother = false) {
        if (saving) return;
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
            if (addAnother && !editingMatch) {
                setForm({ ...emptyForm(), ratingCategory: form.ratingCategory, isRated: form.isRated });
                setEntryVersion(value => value + 1);
            } else setModalOpen(false);
            setNotice(response.ratingStatus === 'recalculation_pending'
                ? 'Match saved. Ratings are being recalculated.'
                : 'Match saved.');
            await refreshAll();
        } catch (requestError) {
            if (requestError.code === 'POSSIBLE_DUPLICATE_MATCH') {
                setDuplicateConfirmation({ editing: Boolean(editingMatch), addAnother });
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
                    {isAdmin && <Button onClick={openAddModal}>Add Match</Button>}
                    <Button variant="secondary" aria-expanded={filtersOpen} aria-controls="match-filters"
                        onClick={() => setFiltersOpen(open => !open)}>
                        {filtersOpen ? 'Hide filters' : `Show filters${activeFilterCount ? ` (${activeFilterCount})` : ''}`}
                    </Button>
                </div>
            </div>
            {error && !modalOpen && <div className="error" role="alert"><p>{error}</p><Button variant="secondary" disabled={loading} onClick={() => refreshAll()}>Retry</Button></div>}
            {notice && <div className="match-notice" role="status">{notice}</div>}
            {searchParams.get('matchId') && <NotificationMatchPreview clubId={club.id} matchId={searchParams.get('matchId')} />}
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
                    <div className="match-history-cards">
                        {matches.map(match => <article key={match.id} className={`match-history-card ${match.status === 'voided' ? 'voided-match' : ''}`}>
                            <div className="match-history-result">
                                <div className="match-history-player"><strong className="entity-name">{match.whitePlayerName || match.whitePlayerId}</strong><MatchRating match={match} color="white" /></div>
                                <span className="match-score">{resultLabel(match.result)}</span>
                                <div className="match-history-player"><strong className="entity-name">{match.blackPlayerName || match.blackPlayerId}</strong><MatchRating match={match} color="black" /></div>
                            </div>
                            <div className="match-history-meta">
                                <time dateTime={match.playedAt}>{new Date(match.playedAt).toLocaleString()}</time>
                                <span>{categoryLabel(match.ratingCategory)} · {match.isRated ? 'Rated' : 'Unrated'}</span>
                                {match.status !== 'active' && <span className="match-status">{categoryLabel(match.status)}</span>}
                            </div>
                            <div className="match-history-footer">
                                <Disclosure title="Details">
                                    <p>Status: {categoryLabel(match.status)}</p>
                                    {match.notes && <p className="match-history-notes">{match.notes}</p>}
                                    {!match.notes && <p className="muted">No notes.</p>}
                                </Disclosure>
                                {isAdmin && <div className="match-actions">
                                    {match.status === 'active' && <Button variant="secondary" onClick={() => openEditModal(match)}>Edit</Button>}
                                    <ActionMenu>
                                        {match.status === 'active' && <Button variant="warning" onClick={() => setLifecycleAction({ kind: 'void', match, reason: '', error: null })}>Void</Button>}
                                        <Button variant="danger" onClick={() => setLifecycleAction({ kind: 'delete', match, reason: '', error: null })}>Delete</Button>
                                    </ActionMenu>
                                </div>}
                            </div>
                        </article>)}
                        {!matches.length && <p className="muted">No matches found.</p>}
                    </div>
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
                className="match-entry-dialog" onClose={() => setModalOpen(false)}>
                    <div className="modal-body">
                        {error && <div className="error" role="alert">{error}</div>}
                        {notice && <p role="status">{notice}</p>}
                        <label className="rated-toggle">
                            <input type="checkbox" checked={form.isRated}
                                onChange={event => setRatingField('isRated', event.target.checked)} />
                            Rated match
                        </label>
                        <div className="match-entry-players">
                        <PlayerSearchSelect key={`white-${entryVersion}`} clubId={club.id} label="White" allowCreate={Boolean(capabilities.canManagePlayers)} value={form.whitePlayerId}
                            selectedPlayer={editingMatch ? {
                                id: editingMatch.whitePlayerId,
                                name: editingMatch.whitePlayerName || editingMatch.whitePlayerId,
                            } : null}
                            onChange={playerId => setForm(current => ({ ...current, whitePlayerId: playerId }))}
                            placeholder="Search for White" />
                        <span className="match-entry-versus" aria-hidden="true">vs.</span>
                        <PlayerSearchSelect key={`black-${entryVersion}`} clubId={club.id} label="Black" allowCreate={Boolean(capabilities.canManagePlayers)} value={form.blackPlayerId}
                            selectedPlayer={editingMatch ? {
                                id: editingMatch.blackPlayerId,
                                name: editingMatch.blackPlayerName || editingMatch.blackPlayerId,
                            } : null}
                            onChange={playerId => setForm(current => ({ ...current, blackPlayerId: playerId }))}
                            placeholder="Search for Black" />
                        </div>
                        <fieldset className="match-entry-result"><legend>Result</legend>
                            <div className="match-category-switcher">
                                {[['white', '1–0', 'White wins'], ['draw', '½–½', 'Draw'], ['black', '0–1', 'Black wins']].map(([value, score, label]) => (
                                    <button key={value} type="button" aria-label={`${score} ${label}`} aria-pressed={form.result === value}
                                        className={form.result === value ? 'active' : ''}
                                        onClick={() => setForm(current => ({ ...current, result: value }))}>{score}</button>
                                ))}
                            </div>
                        </fieldset>
                        <div className="form-row"><span className="label">Rating category</span>
                            <div className="match-category-switcher" role="group" aria-label="Rating category">
                                {CATEGORIES.map(category => <button type="button" key={category}
                                    className={form.ratingCategory === category ? 'active' : ''}
                                    aria-pressed={form.ratingCategory === category}
                                    onClick={() => setRatingField('ratingCategory', category)}>{categoryLabel(category)}</button>)}
                            </div>
                        </div>
                        <label className="form-row"><span className="label">Played at</span>
                            <input type="datetime-local" className="input" required value={form.playedAt}
                                onChange={event => setForm({ ...form, playedAt: event.target.value })} />
                        </label>
                        <Disclosure key={`notes-${entryVersion}`} defaultOpen={Boolean(editingMatch?.notes)} title="Notes (optional)">
                        <label className="form-row"><span className="sr-only">Notes (optional)</span>
                            <textarea className="input" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} />
                        </label>
                        </Disclosure>
                    </div>
                    <div className="modal-footer">
                        <Button variant="secondary" disabled={saving} onClick={() => setModalOpen(false)}>Cancel</Button>
                        {!editingMatch && <Button variant="secondary" disabled={saving} onClick={() => saveMatch(false, true)}>Save and add another</Button>}
                        <Button variant="primary" disabled={saving} onClick={() => saveMatch(false)}>
                            {saving ? 'Saving...' : editingMatch ? 'Save changes' : 'Create match'}
                        </Button>
                    </div>
            </Dialog>}

            <ConfirmDialog isOpen={Boolean(duplicateConfirmation)} title="Possible duplicate match"
                message="A matching record exists within five minutes. Save this match anyway?"
                confirmLabel="Save anyway" variant="warning" loading={saving}
                onClose={() => setDuplicateConfirmation(null)} onConfirm={() => saveMatch(true, duplicateConfirmation?.addAnother)} />

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
