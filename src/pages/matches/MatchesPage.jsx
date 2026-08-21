import React, { useCallback, useEffect, useMemo, useState } from 'react';
import '../../styles/matches.css';
import Button from '../../shared/common/Button.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { useClub } from '../../app/contextHooks.js';
import { matchApi } from '../../features/matches/api/matchApi.js';
import { playerApi } from '../../features/players/api/playerApi.js';
import { tournamentApi } from '../../features/tournaments/api/tournamentApi.js';

const CATEGORIES = ['blitz', 'rapid', 'classical'];
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
    const [players, setPlayers] = useState([]);
    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingMatch, setEditingMatch] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [duplicateConfirmation, setDuplicateConfirmation] = useState(null);
    const [lifecycleAction, setLifecycleAction] = useState(null);

    const refreshAll = useCallback(async () => {
        if (!club) return;
        setLoading(true);
        try {
            const [loadedMatches, loadedPlayers, tournamentResponse] = await Promise.all([
                matchApi.list(club.id, { q: search, limit: 100 }),
                playerApi.fetchPlayers(club.id, { limit: 100 }),
                tournamentApi.list(club.id, { limit: 100 }),
            ]);
            setMatches(loadedMatches);
            setPlayers(loadedPlayers);
            setTournaments(tournamentResponse.tournaments);
            setError(null);
        } catch (requestError) {
            setError(requestError.message || 'Failed to load matches.');
        } finally {
            setLoading(false);
        }
    }, [club, search]);

    useEffect(() => {
        void refreshAll();
    }, [refreshAll]);

    const compatibleTournaments = useMemo(() => tournaments.filter(tournament => (
        tournament.rating_category === form.ratingCategory
        && tournament.is_rated === form.isRated
    )), [tournaments, form.ratingCategory, form.isRated]);

    const playerNames = useMemo(
        () => new Map(players.map(player => [player.id, player.name])),
        [players]
    );

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

    const visibleMatches = matches;

    return (
        <div className="matches-page">
            <div className="page-header">
                <h1>Matches</h1>
                {isAdmin && <Button onClick={openAddModal}>Add Match</Button>}
            </div>
            {error && !modalOpen && <div className="error" role="alert">{error}</div>}
            {notice && <div className="match-notice" role="status">{notice}</div>}
            <div className="matches-controls">
                <input className="input" placeholder="Search by player or notes" value={search}
                    onChange={event => setSearch(event.target.value)} aria-label="Search matches" />
            </div>

            <div className="matches-list">
                {loading ? <div className="muted">Loading...</div> : (
                    <table className="matches-table">
                        <thead><tr>
                            <th>Date</th><th>White</th><th>Black</th><th>Result</th>
                            <th>Category</th><th>Rating</th><th>Status</th><th>Notes</th>
                            {isAdmin && <th>Actions</th>}
                        </tr></thead>
                        <tbody>
                            {visibleMatches.map(match => (
                                <tr key={match.id} className={match.status === 'voided' ? 'voided-match' : ''}>
                                    <td>{new Date(match.playedAt).toLocaleString()}</td>
                                    <td>{match.whitePlayerName || playerNames.get(match.whitePlayerId)}</td>
                                    <td>{match.blackPlayerName || playerNames.get(match.blackPlayerId)}</td>
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
                            {!visibleMatches.length && <tr><td colSpan={isAdmin ? 9 : 8} className="muted">No matches found.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>

            {modalOpen && <div className="modal-backdrop">
                <div className="modal-content small" role="dialog" aria-modal="true" aria-labelledby="match-form-title">
                    <div className="modal-header">
                        <h3 id="match-form-title">{editingMatch ? 'Edit Match' : 'Add Match'}</h3>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>Close</Button>
                    </div>
                    <div className="modal-body">
                        {error && <div className="error" role="alert">{error}</div>}
                        <label className="form-row"><span className="label">White</span>
                            <select value={form.whitePlayerId} onChange={event => setForm({ ...form, whitePlayerId: event.target.value })} className="input">
                                <option value="">Select White</option>
                                {players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
                            </select>
                        </label>
                        <label className="form-row"><span className="label">Black</span>
                            <select value={form.blackPlayerId} onChange={event => setForm({ ...form, blackPlayerId: event.target.value })} className="input">
                                <option value="">Select Black</option>
                                {players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
                            </select>
                        </label>
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
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
                        <Button variant="primary" disabled={saving} onClick={() => saveMatch(false)}>
                            {saving ? 'Saving...' : editingMatch ? 'Save changes' : 'Create match'}
                        </Button>
                    </div>
                </div>
            </div>}

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
