import Icon from '../../shared/common/Icon.jsx';
import ErrorBoundary from '../../shared/common/ErrorBoundary.jsx';
import { TIEBREAKS, DEFAULT_TIEBREAKS } from '../../features/tournaments/tiebreaks.js';
import TiebreakSettings, { TiebreakHelp } from '../../features/tournaments/components/TiebreakSettings.jsx';
import { flushSync } from 'react-dom';
import PairingsPrintSheet from '../../features/tournaments/components/PairingsPrintSheet.jsx';
import RatingCategoryIcon from '../../shared/common/RatingCategoryIcon.jsx';
import Disclosure from '../../shared/common/Disclosure.jsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '../../styles/tournaments.css';
import { useClub } from '../../app/contextHooks.js';
import { tournamentApi } from '../../features/tournaments/api/tournamentApi.js';
import PlayerSearchSelect from '../../features/players/components/PlayerSearchSelect.jsx';
import TournamentCrosstable from '../../features/tournaments/components/TournamentCrosstable.jsx';
import TournamentSetup from '../../features/tournaments/components/TournamentSetup.jsx';
import Dialog from '../../shared/common/Dialog.jsx';
import CopyPublicLink from '../../shared/common/CopyPublicLink.jsx';
import Button from '../../shared/common/Button.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

function localDateTime(value) {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
        .toISOString().slice(0, 19);
}

const title = value => value?.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

function resultLabel(result) {
    if (result === 'white') return '1–0';
    if (result === 'black') return '0–1';
    if (result === 'draw') return '½–½';
    if (result === 'bye') return 'Bye';
    return '—';
}

export default function TournamentPage() {
    const { tournamentId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { club, capabilities } = useClub();
    const isAdmin = Boolean(capabilities.canManageMatches);
    const [detail, setDetail] = useState(null);
    const [participantsOpen, setParticipantsOpen] = useState(false);
    const [participantQuery, setParticipantQuery] = useState('');
    const [playerSearchVersion, setPlayerSearchVersion] = useState(0);
    const [printMode, setPrintMode] = useState('pairings');
    function printTournament(mode) { flushSync(() => setPrintMode(mode)); window.print(); }
    const [tableView, setTableView] = useState('standings');
    const [selectedPlayerId, setSelectedPlayerId] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [resultDrafts, setResultDrafts] = useState({});
    const [pendingResults, setPendingResults] = useState({});
    const resultSaving = useRef(new Set());
    const [resultPending, setResultPending] = useState(new Set());
    const [selectedRound, setSelectedRound] = useState(null);
    const loadSequence = useRef(0);
    const scoreboard = useRef(null);
    const [duplicateConfirmation, setDuplicateConfirmation] = useState(null);
    const [archiveConfirmation, setArchiveConfirmation] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState(false);
    const [resumeConfirmation, setResumeConfirmation] = useState(false);


    const load = useCallback(async () => {
        if (!club?.id) return;
        const sequence = ++loadSequence.current;
        setLoading(true);
        try {
            const tournamentDetail = await tournamentApi.get(club.id, tournamentId);
            if (sequence !== loadSequence.current) return;
            setDetail(tournamentDetail);
            setError('');
        } catch (requestError) {
            if (sequence === loadSequence.current) setError(requestError.message || 'Unable to load tournament.');
        } finally {
            if (sequence === loadSequence.current) setLoading(false);
        }
    }, [club?.id, tournamentId]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { setSelectedRound(detail?.tournament.current_round || null); }, [detail?.tournament.current_round]);

    const registeredIds = useMemo(
        () => new Set((detail?.participants || []).map(player => player.id)),
        [detail?.participants]
    );
    const currentRound = detail?.rounds?.find(round => (
        round.roundNumber === detail.tournament.current_round
    ));
    const canGenerate = detail?.tournament.status === 'active'
        && (!currentRound || currentRound.status === 'completed');

    async function runAction(action, successMessage) {
        setSaving(true);
        setError('');
        setDuplicateConfirmation(null);
        try {
            await action();
            setNotice(successMessage);
            await load();
            return true;
        } catch (requestError) {
            setError(requestError.message || 'Tournament operation failed.');
            return false;
        } finally {
            setSaving(false);
        }
    }

    async function resumeTournament() {
        const resumed = await runAction(
            () => tournamentApi.setStatus(club.id, tournamentId, 'active'),
            'Tournament resumed. You can add players or generate the next round.'
        );
        if (resumed) setResumeConfirmation(false);
    }

    async function addPlayer() {
        if (!selectedPlayerId || registeredIds.has(selectedPlayerId) || saving) return;
        const added = await runAction(
            () => tournamentApi.addPlayer(club.id, tournamentId, selectedPlayerId),
            'Player registered.'
        );
        if (added) { setSelectedPlayerId(''); setPlayerSearchVersion(version => version + 1); }
    }

    function resultValues(pairing) {
        return resultDrafts[pairing.id] || {
            playedAt: pairing.playedAt || new Date().toISOString(),
            notes: pairing.notes || '',
        };
    }

    function updateResultDraft(pairing, field, value) {
        setResultDrafts(current => ({ ...current, [pairing.id]: { ...resultValues(pairing), [field]: value } }));
    }

    async function saveResult(pairingId, values, confirmDuplicate = false) {
        if (resultSaving.current.has(pairingId) || saving || duplicateConfirmation && !confirmDuplicate) return;
        if (!values.playedAt || Number.isNaN(new Date(values.playedAt).valueOf())) {
            setError('Enter a valid played date and time.');
            return;
        }
        resultSaving.current.add(pairingId);
        setPendingResults(current => ({ ...current, [pairingId]: values.result }));
        setResultPending(new Set(resultSaving.current));
        setError('');
        const payload = { ...values, playedAt: new Date(values.playedAt).toISOString(), notes: values.notes || null, confirmDuplicate };
        try {
            const response = await tournamentApi.recordResult(club.id, tournamentId, pairingId, payload);
            setDuplicateConfirmation(current => current?.pairingId === pairingId ? null : current);
            setResultDrafts(current => {
                const next = { ...current };
                delete next[pairingId];
                return next;
            });
            setNotice(response.ratingStatus === 'recalculation_pending'
                ? 'Result saved. Ratings are being recalculated.' : 'Result saved.');
            await load();
        } catch (requestError) {
            if (requestError.code === 'POSSIBLE_DUPLICATE_MATCH' && !confirmDuplicate) {
                setDuplicateConfirmation({ pairingId, values: payload });
                return;
            }
            setError(requestError.message || 'Unable to save result.');
        } finally {
            setPendingResults(current => { const next = { ...current }; delete next[pairingId]; return next; });
            resultSaving.current.delete(pairingId);
            setResultPending(new Set(resultSaving.current));
        }
    }

    function scoreboardKeyDown(event) {
        if (event.target.closest('input, textarea, select') || event.altKey || event.ctrlKey || event.metaKey) return;
        const row = event.target.closest('[data-board]');
        if (!row) return;
        const rows = [...scoreboard.current.querySelectorAll('[data-board]')];
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            const next = rows[(rows.indexOf(row) + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length];
            next.querySelector('.pairing-score-buttons button:not(:disabled)')?.focus();
        } else if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
            event.preventDefault();
            const buttons = [...row.querySelectorAll('.pairing-score-buttons button:not(:disabled)')];
            buttons[(buttons.indexOf(event.target) + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        } else if (['1', '2', '0'].includes(event.key) && event.target.closest('.pairing-score-buttons')) {
            event.preventDefault();
            row.querySelectorAll('.pairing-score-buttons button')[{ '1': 0, '2': 1, '0': 2 }[event.key]]?.click();
        }
    }

    async function deleteTournament() {
        setSaving(true);
        try {
            await tournamentApi.delete(club.id, tournamentId);
            setDeleteConfirmation(false);
            navigate('/tournaments');
        } catch (requestError) {
            setDeleteConfirmation(false);
            setError(requestError.message || 'Unable to delete tournament.');
            setSaving(false);
        }
    }

    async function archiveTournament() {
        setSaving(true);
        try {
            await tournamentApi.archive(club.id, tournamentId);
            setArchiveConfirmation(false);
            navigate('/tournaments');
        } catch (requestError) {
            setError(requestError.message || 'Unable to archive tournament.');
            setSaving(false);
        }
    }

    if (loading && !detail) return <div className="tournament-detail-page"><p className="muted">Loading...</p></div>;
    if (!detail) return <div className="tournament-detail-page">
        {error && <div className="error" role="alert">{error}</div>}
        <Button onClick={load} disabled={loading}>Retry</Button>
        <Button variant="secondary" onClick={() => navigate('/tournaments')}>Back to tournaments</Button>
    </div>;
    const { tournament, participants, rounds, standings } = detail;
    const missingResults = rounds.flatMap(round => round.pairings).filter(pairing => !pairing.isBye && !['white', 'black', 'draw'].includes(pairing.result)).length;

    const archived = Boolean(tournament.archived_at) || tournament.status === 'archived';
    const canEdit = isAdmin && !archived;
    const tabs = [
        { id: 'standings', label: 'Standings & Crosstable', icon: 'trophy' },
        { id: 'pairings', label: 'Pairings & Scoreboard', icon: 'matches' },
        { id: 'participants', label: 'Participants', icon: 'players' },
        ...(isAdmin ? [{ id: 'settings', label: 'Settings & Tiebreaks', icon: 'edit' }] : []),
    ];
    const requestedTab = searchParams.get('tab');
    const workspaceTab = tabs.some(tab => tab.id === requestedTab) ? requestedTab : (canEdit && tournament.status === 'upcoming' ? 'participants' : 'standings');
    function selectTab(tab) {
        const next = new URLSearchParams(searchParams); next.set('tab', tab); setSearchParams(next, { replace: true });
    }
    function tabKeyDown(event) {
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const index = tabs.findIndex(tab => tab.id === workspaceTab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        selectTab(tabs[next].id);
        event.currentTarget.querySelectorAll('[role="tab"]')[next]?.focus();
    }
    return (
        <div className="tournament-detail-page tournament-workspace">
            <header className="tournament-hero">
                <div className="tournament-hero__top"><div>
                    <Link className="text-link tournament-back" to="/tournaments">← Tournaments</Link>
                    <div className="tournament-heading"><h1>{tournament.name}</h1><span className={`tournament-status tournament-status--dot ${archived ? 'archived' : tournament.status}`}>{archived ? 'Archived' : title(tournament.status)}</span></div>
                    <div className="tournament-hero__chips">
                        <span><Icon name="trophy" />{title(tournament.type)}</span>
                        <span><RatingCategoryIcon category={tournament.rating_category} />{title(tournament.rating_category)}</span>
                        <span title={tournament.is_rated ? 'Results affect club ratings' : 'Results do not affect club ratings'}><Icon name="chart" />{tournament.is_rated ? 'Rated' : 'Unrated'}</span>
                    </div>
                    {club.visibility === 'public' && <CopyPublicLink path={`/clubs/${club.id}/tournaments/${tournamentId}`} />}
                </div>
                <div className="tournament-actions">
                    {canEdit && tournament.status === 'active' && <Button variant="secondary" loading={saving} disabled={resultPending.size > 0} onClick={() => runAction(() => tournamentApi.setStatus(club.id, tournamentId, 'completed'), 'Tournament completed.')}>Complete</Button>}
                    {canEdit && tournament.status === 'completed' && <Button loading={saving} onClick={() => setResumeConfirmation(true)}>Resume tournament</Button>}
                    {canEdit && <Button variant="secondary" disabled={saving || resultPending.size > 0} onClick={() => setArchiveConfirmation(true)}>Archive</Button>}
                    {isAdmin && <Button variant="danger" disabled={saving || resultPending.size > 0} onClick={() => setDeleteConfirmation(true)}>Delete</Button>}
                    <Button variant="secondary" disabled={workspaceTab === 'pairings' ? !rounds.length : !standings.length} onClick={() => printTournament(workspaceTab === 'pairings' ? 'pairings' : 'standings')}>Print</Button>
                </div></div>
                <dl className="tournament-hero__metrics">
                    <div><dt>Participants</dt><dd>{participants.length}</dd></div>
                    <div><dt>Rounds paired</dt><dd>{rounds.length}</dd></div>
                    <div><dt>Rounds complete</dt><dd>{rounds.filter(round => round.status === 'completed').length}</dd></div>
                    {isAdmin && <div className={missingResults ? 'needs-attention' : ''}><dt>Missing results</dt><dd>{missingResults}</dd></div>}
                </dl>
            </header>
            <div className="tournament-workspace-tabs" role="tablist" aria-label="Tournament workspace" onKeyDown={tabKeyDown}>
                {tabs.map(tab => <button type="button" role="tab" id={`tournament-tab-${tab.id}`} aria-controls={`tournament-panel-${tab.id}`} aria-selected={workspaceTab === tab.id} tabIndex={workspaceTab === tab.id ? 0 : -1} key={tab.id} onClick={() => selectTab(tab.id)}><Icon name={tab.icon} />{tab.label}</button>)}
            </div>
            {error && <div className="error" role="alert">{error}</div>}
            {notice && <div className="match-notice" role="status">{notice}</div>}
            <section className="tournament-section" role="tabpanel" id="tournament-panel-standings" aria-labelledby="tournament-tab-standings" hidden={workspaceTab !== 'standings'}>
                <div className="section-heading"><div><h2>{tableView === 'standings' ? 'Standings' : 'Crosstable'}</h2><p className="muted">Match points{(tournament.tiebreaks || DEFAULT_TIEBREAKS).map(key => ` → ${TIEBREAKS[key].label}`).join('')}.</p></div>
                    <div className="tournament-actions" role="group" aria-label="Tournament table view"><Button variant="secondary" disabled={!standings.length} onClick={() => printTournament('standings')}>Print standings</Button>{['standings', 'crosstable'].map(view => <Button key={view} variant={tableView === view ? 'primary' : 'secondary'} aria-pressed={tableView === view} onClick={() => setTableView(view)}>{title(view)}</Button>)}</div>
                </div>
                {tableView === 'crosstable' ? <ErrorBoundary resetKey={`${club.id}:${tournament.id}`} message="Unable to display the crosstable."><TournamentCrosstable participants={participants} rounds={rounds} standings={standings} /></ErrorBoundary> : <><div className="tournament-table-wrap table-scroll" tabIndex={0} role="region" aria-label="Tournament standings"><table className="tournament-table tournament-standings">
                    <thead><tr><th>#</th><th>Player</th><th>Pts</th><th>W</th><th>D</th><th>L</th>{(tournament.tiebreaks || DEFAULT_TIEBREAKS).map(key => <th key={key}><TiebreakHelp name={key} /></th>)}</tr></thead>
                    <tbody>{standings.map(row => <tr key={row.playerId}><td><span className={`rank-badge rank-badge--${row.rank}`} aria-label={`Rank ${row.rank}`}>{row.rank}</span></td><td><Link className="name-link" to={`/players/${row.playerId}`}>{row.playerName}</Link></td><td><strong>{row.matchPoints}</strong></td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td>{(tournament.tiebreaks || DEFAULT_TIEBREAKS).map(key => <td key={key}>{row[key]}</td>)}</tr>)}
                        {!standings.length && <tr><td colSpan={6 + (tournament.tiebreaks || DEFAULT_TIEBREAKS).length} className="muted">No participants yet.</td></tr>}
                    </tbody>
                </table></div><p className="muted standings-legend">Pts: match points · W/D/L: wins/draws/losses · SB: Sonneborn-Berger · H2H: head-to-head. Standings are calculated by the server.</p></>}
            </section>
            <div role="tabpanel" id="tournament-panel-pairings" aria-labelledby="tournament-tab-pairings" hidden={workspaceTab !== 'pairings'}>
            <section className="tournament-section tournament-pairings" aria-label="Pairings">
                <div className="section-heading"><div><h2>Pairings</h2></div>
                    <Button variant="secondary" disabled={!rounds.length} onClick={() => printTournament('pairings')}>Print pairings</Button>
                    {canEdit && tournament.status === 'active' && <Button disabled={!canGenerate || saving || resultPending.size > 0} loading={saving} onClick={() => runAction(() => tournamentApi.generateRound(club.id, tournamentId), 'Next round paired.')}>Generate next round</Button>}
                </div>
                <div className="scoreboard-toolbar">
                    <label>Round<select className="input" aria-label="Select round" value={selectedRound || tournament.current_round || ''} onChange={event => setSelectedRound(Number(event.target.value))}>
                        {[...rounds].reverse().map(round => <option key={round.id} value={round.roundNumber}>Round {round.roundNumber}{isAdmin ? ` · ${title(round.status)}` : ''}</option>)}
                    </select></label>
                    {isAdmin && <p className="muted">New results use the current time. Adjust time or notes only when needed.<span className="scoreboard-keyboard-help"> Arrow keys move between scores and boards; 1 / 2 / 0 records a win / draw / loss for White.</span></p>}
                </div>
                <div className="round-list">
                    {rounds.filter(round => round.roundNumber === (selectedRound || tournament.current_round)).map(round => <div className="round-card" key={round.id}>
                        <div className="round-card__header"><strong>Round {round.roundNumber}</strong><span hidden={!isAdmin} className={`tournament-status ${round.status}`}>{title(round.status)}</span><span hidden={!isAdmin}>{round.pairings.filter(pairing => !pairing.isBye && !['white', 'black', 'draw'].includes(pairing.result)).length} missing results · {round.pairings.filter(pairing => pairing.isBye).length} byes</span></div>
                        <div className="pairing-list" ref={scoreboard} onKeyDown={scoreboardKeyDown}>{round.pairings.map(pairing => <div className="pairing-item" data-board={pairing.board} key={pairing.id}><div className={`pairing-row${isAdmin ? '' : ' pairing-row--read-only'}`}>
                            <span className="board-number"><small>Board</small>{pairing.board}</span>
                            <span className="pairing-player entity-name"><small>♔ White</small><Link className="name-link" to={`/players/${pairing.whitePlayerId}`}>{pairing.whitePlayerName || participants.find(player => player.id === pairing.whitePlayerId)?.name}</Link></span>
                            <strong className="pairing-result">{resultLabel(pairing.result)}</strong>
                            <span className="pairing-player black entity-name">{pairing.isBye ? 'Bye' : <><small>♚ Black</small><Link className="name-link" to={`/players/${pairing.blackPlayerId}`}>{pairing.blackPlayerName || participants.find(player => player.id === pairing.blackPlayerId)?.name}</Link></>}</span>
                            {canEdit && !pairing.isBye && <div className="pairing-score-buttons" role="group" aria-label={`Result for round ${round.roundNumber}, board ${pairing.board}`}>
                                {['white', 'draw', 'black'].map(result => <Button key={result}
                                    variant={(pendingResults[pairing.id] ?? pairing.result) === result ? 'primary' : 'secondary'}
                                    aria-pressed={(pendingResults[pairing.id] ?? pairing.result) === result} disabled={saving || Boolean(duplicateConfirmation)}
                                    aria-disabled={resultPending.has(pairing.id)} aria-busy={resultPending.has(pairing.id)}
                                    onClick={() => saveResult(pairing.id, { ...resultValues(pairing), result })}>{resultLabel(result)}</Button>)}
                            </div>}
                        </div>
                        {isAdmin && <span className={`board-result-state ${pairing.result ? 'recorded' : 'missing'}`}>{pairing.isBye ? 'Bye' : pairing.result ? 'Recorded' : 'Needs result'}</span>}
                        {resultPending.has(pairing.id) && <p role="status">Saving board {pairing.board}…</p>}
                        {canEdit && !pairing.isBye && <Disclosure className="pairing-result-details" title="Played at & notes">
                            <label>Played at (round {round.roundNumber}, board {pairing.board})
                                <input type="datetime-local" step="1" className="input" required disabled={saving || resultPending.has(pairing.id) || Boolean(duplicateConfirmation)}
                                    value={resultValues(pairing).playedAt ? localDateTime(resultValues(pairing).playedAt) : ''} onChange={event => updateResultDraft(pairing, 'playedAt', event.target.value)} /></label>
                            <label>Notes (round {round.roundNumber}, board {pairing.board})
                                <textarea className="input" disabled={saving || resultPending.has(pairing.id) || Boolean(duplicateConfirmation)} value={resultValues(pairing).notes}
                                    onChange={event => updateResultDraft(pairing, 'notes', event.target.value)} /></label>
                            <p className="muted">Choose a score above to save the result with these details.</p>
                        </Disclosure>}
                        {duplicateConfirmation?.pairingId === pairing.id && <div className="pairing-duplicate" role="alert">
                            <p>A matching result already exists within five minutes. Save this result anyway?</p>
                            <Button disabled={saving || resultPending.size > 0} onClick={() => saveResult(pairing.id, duplicateConfirmation.values, true)}>Save anyway</Button>
                            <Button variant="secondary" disabled={saving || resultPending.size > 0} onClick={() => setDuplicateConfirmation(null)}>Cancel</Button>
                        </div>}
                        </div>)}</div>
                    </div>)}
                    {!rounds.length && <p className="muted">No rounds have been generated.</p>}
                </div>
            </section>



            </div>
            <section className="tournament-section" role="tabpanel" id="tournament-panel-participants" aria-labelledby="tournament-tab-participants" hidden={workspaceTab !== 'participants'}>
                {canEdit && tournament.status === 'upcoming' && <TournamentSetup key={`${club.id}-${tournamentId}`} clubId={club.id} tournamentId={tournamentId} participants={participants}
                    onComplete={async () => { await load(); selectTab('pairings'); }} onSaveLater={() => navigate('/tournaments')} />}

                <div className="section-heading"><div><h2>Participants</h2><p className="muted">Late registrations become eligible for the next round.</p></div>
                    {canEdit && <Button onClick={() => setParticipantsOpen(true)}>Manage participants</Button>}
                </div>
                <div className="tournament-table-wrap table-scroll"><table className="tournament-table tournament-participants"><thead><tr><th>Player</th><th>Rating</th><th>Entered</th><th>Status</th><th>Byes</th>{isAdmin && <th>Action</th>}</tr></thead>
                    <tbody>{participants.map(player => <tr key={player.id}><td><Link className="name-link" to={`/players/${player.id}`}>{player.name}</Link></td><td>{player.rating}</td><td>Round {player.registrationRound}</td><td>{title(player.status)}</td><td>{player.byeCount}</td>{isAdmin && <td>{canEdit && tournament.status !== 'completed' && player.status === 'active' && <Button variant="secondary" disabled={saving || resultPending.size > 0} onClick={() => runAction(() => tournament.current_round > 0 ? tournamentApi.withdrawPlayer(club.id, tournamentId, player.id) : tournamentApi.removePlayer(club.id, tournamentId, player.id), `${player.name} ${tournament.current_round > 0 ? 'withdrawn' : 'removed'}.`)}>{tournament.current_round > 0 ? 'Withdraw' : 'Remove'}</Button>}</td>}</tr>)}</tbody>
                </table></div>
            </section>

            {isAdmin && <section className="tournament-section" role="tabpanel" id="tournament-panel-settings" aria-labelledby="tournament-tab-settings" hidden={workspaceTab !== 'settings'}>
                <h2>Settings & Tiebreaks</h2>
                <p className="muted">Points come first. Choose the order used to separate tied players.</p>
                {!archived && <TiebreakSettings key={`${tournament.id}:${(tournament.tiebreaks || DEFAULT_TIEBREAKS).join(',')}`} clubId={club.id} tournament={tournament} onSaved={load} />}
                <div className="tournament-lifecycle-note"><h3>Tournament lifecycle</h3><p>Complete pauses play; resume reopens it. Archive keeps the results. Delete permanently removes this tournament and its matches.</p><p className="muted">Use the controls in the tournament header to change its status.</p></div>
            </section>}

            {participantsOpen && isAdmin && <Dialog title="Manage participants" busy={saving} onClose={() => setParticipantsOpen(false)}>
                <div className="modal-body">
                {error && <p role="alert">{error}</p>}
                {notice && <p role="status">{notice}</p>}
                {tournament.status !== 'completed' && <div className="participant-add">
                    <PlayerSearchSelect key={playerSearchVersion} clubId={club.id} label="Add club player" value={selectedPlayerId} onChange={setSelectedPlayerId} />
                    <Button disabled={saving || !selectedPlayerId || registeredIds.has(selectedPlayerId)} onClick={addPlayer}>Add</Button>
                </div>}
                {registeredIds.has(selectedPlayerId) && <p>This player is already registered.</p>}
                <label>Search registered participants<input className="input" type="search" value={participantQuery} onChange={event => setParticipantQuery(event.target.value)} /></label>
                <ul className="participant-manager-list">{participants.filter(player => player.name.toLowerCase().includes(participantQuery.trim().toLowerCase())).map(player => <li key={player.id}>
                    <span>{player.name} · {title(player.status)}</span>
                    {tournament.status !== 'completed' && player.status === 'active' && <Button disabled={saving || resultPending.size > 0} variant="secondary" onClick={() => runAction(() => tournament.current_round > 0 ? tournamentApi.withdrawPlayer(club.id, tournamentId, player.id) : tournamentApi.removePlayer(club.id, tournamentId, player.id), `${player.name} ${tournament.current_round > 0 ? 'withdrawn' : 'removed'}.`)}>{tournament.current_round > 0 ? 'Withdraw' : 'Remove'}</Button>}
                </li>)}</ul>
                {!participants.some(player => player.name.toLowerCase().includes(participantQuery.trim().toLowerCase())) && <p>No matching participants.</p>}
                <p className="muted">Changes save immediately. Withdrawals preserve earlier results. Late entries join future rounds only.</p>
                </div>
            </Dialog>}

            <PairingsPrintSheet mode={printMode} standings={standings} tournament={tournament} participants={participants} round={rounds.find(round => round.roundNumber === (selectedRound || tournament.current_round))} />

            <ConfirmDialog isOpen={archiveConfirmation} title="Archive tournament?"
                message="Its rounds and results will be preserved."
                confirmLabel="Archive tournament" variant="danger" loading={saving}
                onClose={() => setArchiveConfirmation(false)} onConfirm={archiveTournament} />
            <ConfirmDialog isOpen={deleteConfirmation} title="Permanently delete tournament?"
                message="This removes the tournament, rounds, results, and linked matches, and recalculates affected ratings. Your club, players, and unrelated records will remain. This cannot be undone."
                confirmLabel="Delete tournament" variant="danger" loading={saving}
                onClose={() => setDeleteConfirmation(false)} onConfirm={deleteTournament} />
            <ConfirmDialog isOpen={resumeConfirmation} title="Resume tournament?"
                message="The tournament will become active again. Existing rounds, results, standings, and linked matches will be preserved."
                confirmLabel="Resume tournament" loading={saving}
                onClose={() => setResumeConfirmation(false)} onConfirm={resumeTournament} />
        </div>
    );
}
