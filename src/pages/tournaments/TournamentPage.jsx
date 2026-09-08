import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../../styles/tournaments.css';
import { useClub } from '../../app/contextHooks.js';
import { tournamentApi } from '../../features/tournaments/api/tournamentApi.js';
import PlayerSearchSelect from '../../features/players/components/PlayerSearchSelect.jsx';
import TournamentCrosstable from '../../features/tournaments/components/TournamentCrosstable.jsx';
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
    return 'Pending';
}

export default function TournamentPage() {
    const { tournamentId } = useParams();
    const navigate = useNavigate();
    const { club, capabilities } = useClub();
    const isAdmin = Boolean(capabilities.canManageMatches);
    const [detail, setDetail] = useState(null);
    const [participantsOpen, setParticipantsOpen] = useState(false);
    const [participantQuery, setParticipantQuery] = useState('');
    const [playerSearchVersion, setPlayerSearchVersion] = useState(0);
    const [tableView, setTableView] = useState('standings');
    const [selectedPlayerId, setSelectedPlayerId] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [resultDrafts, setResultDrafts] = useState({});
    const resultSaving = useRef(false);
    const [duplicateConfirmation, setDuplicateConfirmation] = useState(null);
    const [archiveConfirmation, setArchiveConfirmation] = useState(false);
    const [resumeConfirmation, setResumeConfirmation] = useState(false);


    const load = useCallback(async () => {
        if (!club?.id) return;
        setLoading(true);
        try {
            const tournamentDetail = await tournamentApi.get(club.id, tournamentId);
            setDetail(tournamentDetail);
            setError('');
        } catch (requestError) {
            setError(requestError.message || 'Unable to load tournament.');
        } finally {
            setLoading(false);
        }
    }, [club?.id, tournamentId]);

    useEffect(() => { void load(); }, [load]);

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
            playedAt: pairing.playedAt || '',
            notes: pairing.notes || '',
        };
    }

    function updateResultDraft(pairing, field, value) {
        setResultDrafts(current => ({ ...current, [pairing.id]: { ...resultValues(pairing), [field]: value } }));
    }

    async function saveResult(pairingId, values, confirmDuplicate = false) {
        if (resultSaving.current) return;
        if (!values.playedAt || Number.isNaN(new Date(values.playedAt).valueOf())) {
            setError('Enter a valid played date and time.');
            return;
        }
        resultSaving.current = true;
        setSaving(true);
        setError('');
        const payload = { ...values, playedAt: new Date(values.playedAt).toISOString(), notes: values.notes || null, confirmDuplicate };
        try {
            const response = await tournamentApi.recordResult(club.id, tournamentId, pairingId, payload);
            setDuplicateConfirmation(null);
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
            resultSaving.current = false;
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

    return (
        <div className="tournament-detail-page">
            <div className="page-header tournament-detail-header">
                <div>
                    <div className="tournament-heading"><h1>{tournament.name}</h1><span className={`tournament-status ${tournament.status}`}>{title(tournament.status)}</span></div>
                    <p className="muted">{title(tournament.type)} · {title(tournament.rating_category)} · {tournament.is_rated ? 'Rated — affects club ratings' : 'Casual — no rating changes'}</p>
                    <p>{rounds.filter(round => round.status === 'completed').length} of {rounds.length} paired rounds complete · {missingResults ? `${missingResults} missing result${missingResults === 1 ? '' : 's'}` : 'No missing results'}</p>
                    {club.visibility === 'public' && <CopyPublicLink path={`/clubs/${club.id}/tournaments/${tournamentId}`} />}
                </div>
                {isAdmin && <div className="tournament-actions">
                    {tournament.status === 'upcoming' && <Button loading={saving} onClick={() => runAction(() => tournamentApi.setStatus(club.id, tournamentId, 'active'), 'Tournament started.')}>Start</Button>}
                    {tournament.status === 'active' && <Button variant="secondary" loading={saving} onClick={() => runAction(() => tournamentApi.setStatus(club.id, tournamentId, 'completed'), 'Tournament completed.')}>Complete</Button>}
                    {tournament.status === 'completed' && <Button loading={saving} onClick={() => setResumeConfirmation(true)}>Resume tournament</Button>}
                    <Button variant="danger" disabled={saving} onClick={() => setArchiveConfirmation(true)}>Archive</Button>
                </div>}
            </div>
            {error && <div className="error" role="alert">{error}</div>}
            {notice && <div className="match-notice" role="status">{notice}</div>}

            <div className="tournament-summary">
                <div><strong>{participants.length}</strong><span>Participants</span></div>
                <div><strong>{tournament.current_round || 0}</strong><span>Rounds paired</span></div>
                <div><strong>{rounds.filter(round => round.status === 'completed').length}</strong><span>Rounds complete</span></div>
            </div>

            <section className="tournament-section">
                <div className="section-heading"><div><h2>{tableView === 'standings' ? 'Standings' : 'Crosstable'}</h2><p className="muted">Match points, Buchholz, Sonneborn-Berger, then head-to-head.</p></div>
                    <div className="tournament-actions" role="group" aria-label="Tournament table view">{['standings', 'crosstable'].map(view => <Button key={view} variant={tableView === view ? 'primary' : 'secondary'} aria-pressed={tableView === view} onClick={() => setTableView(view)}>{title(view)}</Button>)}</div>
                </div>
                {tableView === 'crosstable' ? <TournamentCrosstable participants={participants} rounds={rounds} standings={standings} /> : <><div className="tournament-table-wrap" tabIndex={0} role="region" aria-label="Tournament standings"><table className="tournament-table">
                    <thead><tr><th>#</th><th>Player</th><th>Pts</th><th>W</th><th>D</th><th>L</th><th>Buchholz</th><th>SB</th><th>H2H</th></tr></thead>
                    <tbody>{standings.map(row => <tr key={row.playerId}><td>{row.rank}</td><td>{row.playerName}</td><td><strong>{row.matchPoints}</strong></td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{row.buchholz}</td><td>{row.sonnebornBerger}</td><td>{row.directHeadToHead}</td></tr>)}
                        {!standings.length && <tr><td colSpan={9} className="muted">No participants yet.</td></tr>}
                    </tbody>
                </table></div><p className="muted">Pts: match points · W/D/L: wins/draws/losses · SB: Sonneborn-Berger · H2H: head-to-head. Standings are calculated by the server.</p></>}
            </section>

            <section className="tournament-section">
                <div className="section-heading"><div><h2>Rounds</h2><p className="muted">Byes count in standings but never create chess matches.</p></div>
                    {isAdmin && tournament.status === 'active' && <Button disabled={!canGenerate || saving} loading={saving} onClick={() => runAction(() => tournamentApi.generateRound(club.id, tournamentId), 'Next round paired.')}>Generate next round</Button>}
                </div>
                <div className="round-list">
                    {[...rounds].reverse().map(round => <details className="round-card" key={round.id} open={round.roundNumber === tournament.current_round}>
                        <summary className="round-card__header"><strong>Round {round.roundNumber}</strong><span className={`tournament-status ${round.status}`}>{title(round.status)}</span><span>{round.pairings.filter(pairing => !pairing.isBye && !['white', 'black', 'draw'].includes(pairing.result)).length} missing results · {round.pairings.filter(pairing => pairing.isBye).length} byes</span></summary>
                        <div className="pairing-list">{round.pairings.map(pairing => <div className="pairing-item" key={pairing.id}><div className="pairing-row">
                            <span className="board-number">{pairing.board}</span>
                            <span className="pairing-player">{pairing.whitePlayerName || participants.find(player => player.id === pairing.whitePlayerId)?.name}</span>
                            <strong className="pairing-result">{resultLabel(pairing.result)}</strong>
                            <span className="pairing-player black">{pairing.isBye ? 'Bye' : pairing.blackPlayerName || participants.find(player => player.id === pairing.blackPlayerId)?.name}</span>
                            {isAdmin && !pairing.isBye && <div className="pairing-score-buttons" role="group" aria-label={`Result for round ${round.roundNumber}, board ${pairing.board}`}>
                                {['white', 'draw', 'black'].map(result => <Button key={result}
                                    variant={pairing.result === result ? 'primary' : 'secondary'}
                                    aria-pressed={pairing.result === result} disabled={saving || Boolean(duplicateConfirmation)}
                                    onClick={() => saveResult(pairing.id, { ...resultValues(pairing), result })}>{resultLabel(result)}</Button>)}
                            </div>}
                        </div>
                        {isAdmin && !pairing.isBye && <details className="pairing-result-details" open={!pairing.playedAt}>
                            <summary>Played at &amp; notes</summary>
                            <label>Played at (round {round.roundNumber}, board {pairing.board})
                                <input type="datetime-local" step="1" className="input" required disabled={saving || Boolean(duplicateConfirmation)}
                                    value={resultValues(pairing).playedAt ? localDateTime(resultValues(pairing).playedAt) : ''} onChange={event => updateResultDraft(pairing, 'playedAt', event.target.value)} /></label>
                            <label>Notes (round {round.roundNumber}, board {pairing.board})
                                <textarea className="input" disabled={saving || Boolean(duplicateConfirmation)} value={resultValues(pairing).notes}
                                    onChange={event => updateResultDraft(pairing, 'notes', event.target.value)} /></label>
                            <p className="muted">Choose a score above to save the result with these details.</p>
                        </details>}
                        {duplicateConfirmation?.pairingId === pairing.id && <div className="pairing-duplicate" role="alert">
                            <p>A matching result already exists within five minutes. Save this result anyway?</p>
                            <Button disabled={saving} onClick={() => saveResult(pairing.id, duplicateConfirmation.values, true)}>Save anyway</Button>
                            <Button variant="secondary" disabled={saving} onClick={() => setDuplicateConfirmation(null)}>Cancel</Button>
                        </div>}
                        </div>)}</div>
                    </details>)}
                    {!rounds.length && <p className="muted">No rounds have been generated.</p>}
                </div>
            </section>

            <section className="tournament-section">
                <div className="section-heading"><div><h2>Participants</h2><p className="muted">Late registrations become eligible for the next round.</p></div>
                    {isAdmin && <Button onClick={() => setParticipantsOpen(true)}>Manage participants</Button>}
                </div>
                <div className="tournament-table-wrap"><table className="tournament-table"><thead><tr><th>Player</th><th>Rating</th><th>Entered</th><th>Status</th><th>Byes</th>{isAdmin && <th>Action</th>}</tr></thead>
                    <tbody>{participants.map(player => <tr key={player.id}><td>{player.name}</td><td>{player.rating}</td><td>Round {player.registrationRound}</td><td>{title(player.status)}</td><td>{player.byeCount}</td>{isAdmin && <td>Use Manage participants</td>}</tr>)}</tbody>
                </table></div>
            </section>

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
                    {tournament.status !== 'completed' && player.status === 'active' && <Button disabled={saving} variant="secondary" onClick={() => runAction(() => tournament.current_round > 0 ? tournamentApi.withdrawPlayer(club.id, tournamentId, player.id) : tournamentApi.removePlayer(club.id, tournamentId, player.id), `${player.name} ${tournament.current_round > 0 ? 'withdrawn' : 'removed'}.`)}>{tournament.current_round > 0 ? 'Withdraw' : 'Remove'}</Button>}
                </li>)}</ul>
                {!participants.some(player => player.name.toLowerCase().includes(participantQuery.trim().toLowerCase())) && <p>No matching participants.</p>}
                <p className="muted">Changes save immediately. Withdrawals preserve earlier results. Late entries join future rounds only.</p>
                </div>
            </Dialog>}

            <ConfirmDialog isOpen={archiveConfirmation} title="Archive tournament?"
                message="Its rounds and results will be preserved."
                confirmLabel="Archive tournament" variant="danger" loading={saving}
                onClose={() => setArchiveConfirmation(false)} onConfirm={archiveTournament} />
            <ConfirmDialog isOpen={resumeConfirmation} title="Resume tournament?"
                message="The tournament will become active again. Existing rounds, results, standings, and linked matches will be preserved."
                confirmLabel="Resume tournament" loading={saving}
                onClose={() => setResumeConfirmation(false)} onConfirm={resumeTournament} />
        </div>
    );
}
