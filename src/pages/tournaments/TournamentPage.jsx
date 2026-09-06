import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../../styles/tournaments.css';
import { useClub } from '../../app/contextHooks.js';
import { tournamentApi } from '../../features/tournaments/api/tournamentApi.js';
import { playerApi } from '../../features/players/api/playerApi.js';
import Button from '../../shared/common/Button.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

function localDateTime(value = new Date()) {
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
    const [clubPlayers, setClubPlayers] = useState([]);
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
            const requests = [tournamentApi.get(club.id, tournamentId)];
            if (isAdmin) requests.push(playerApi.fetchPlayers(club.id, { limit: 100 }));
            const [tournamentDetail, players = []] = await Promise.all(requests);
            setDetail(tournamentDetail);
            setClubPlayers(players);
            setError('');
        } catch (requestError) {
            setError(requestError.message || 'Unable to load tournament.');
        } finally {
            setLoading(false);
        }
    }, [club?.id, isAdmin, tournamentId]);

    useEffect(() => { void load(); }, [load]);

    const registeredIds = useMemo(
        () => new Set((detail?.participants || []).map(player => player.id)),
        [detail?.participants]
    );
    const availablePlayers = clubPlayers.filter(player => !registeredIds.has(player.id));
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
        if (!selectedPlayerId) return;
        await runAction(
            () => tournamentApi.addPlayer(club.id, tournamentId, selectedPlayerId),
            'Player registered.'
        );
        setSelectedPlayerId('');
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

    return (
        <div className="tournament-detail-page">
            <div className="page-header tournament-detail-header">
                <div>
                    <div className="tournament-heading"><h1>{tournament.name}</h1><span className={`tournament-status ${tournament.status}`}>{title(tournament.status)}</span></div>
                    <p className="muted">{title(tournament.type)} · {title(tournament.rating_category)} · {tournament.is_rated ? 'Rated' : 'Unrated'}</p>
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
                <div className="section-heading"><div><h2>Standings</h2><p className="muted">Match points, Buchholz, Sonneborn-Berger, then head-to-head.</p></div></div>
                <div className="tournament-table-wrap"><table className="tournament-table">
                    <thead><tr><th>#</th><th>Player</th><th>Pts</th><th>W</th><th>D</th><th>L</th><th>Buchholz</th><th>SB</th><th>H2H</th></tr></thead>
                    <tbody>{standings.map(row => <tr key={row.playerId}><td>{row.rank}</td><td>{row.playerName}</td><td><strong>{row.matchPoints}</strong></td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{row.buchholz}</td><td>{row.sonnebornBerger}</td><td>{row.directHeadToHead}</td></tr>)}
                        {!standings.length && <tr><td colSpan={9} className="muted">No participants yet.</td></tr>}
                    </tbody>
                </table></div>
            </section>

            <section className="tournament-section">
                <div className="section-heading"><div><h2>Rounds</h2><p className="muted">Byes count in standings but never create chess matches.</p></div>
                    {isAdmin && tournament.status === 'active' && <Button disabled={!canGenerate || saving} loading={saving} onClick={() => runAction(() => tournamentApi.generateRound(club.id, tournamentId), 'Next round paired.')}>Generate next round</Button>}
                </div>
                <div className="round-list">
                    {[...rounds].reverse().map(round => <article className="round-card" key={round.id}>
                        <div className="round-card__header"><h3>Round {round.roundNumber}</h3><span className={`tournament-status ${round.status}`}>{title(round.status)}</span></div>
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
                        {isAdmin && !pairing.isBye && <details className="pairing-result-details">
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
                    </article>)}
                    {!rounds.length && <p className="muted">No rounds have been generated.</p>}
                </div>
            </section>

            <section className="tournament-section">
                <div className="section-heading"><div><h2>Participants</h2><p className="muted">Late registrations become eligible for the next round.</p></div>
                    {isAdmin && tournament.status !== 'completed' && <div className="participant-add"><select className="input" value={selectedPlayerId} onChange={event => setSelectedPlayerId(event.target.value)}><option value="">Select active club player</option>{availablePlayers.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select><Button disabled={!selectedPlayerId || saving} onClick={addPlayer}>Add</Button></div>}
                </div>
                <div className="tournament-table-wrap"><table className="tournament-table"><thead><tr><th>Player</th><th>Rating</th><th>Entered</th><th>Status</th><th>Byes</th>{isAdmin && <th>Action</th>}</tr></thead>
                    <tbody>{participants.map(player => <tr key={player.id}><td>{player.name}</td><td>{player.rating}</td><td>Round {player.registrationRound}</td><td>{title(player.status)}</td><td>{player.byeCount}</td>{isAdmin && <td>{player.status === 'active' && (tournament.current_round > 0 ? <Button variant="warning" onClick={() => runAction(() => tournamentApi.withdrawPlayer(club.id, tournamentId, player.id), `${player.name} withdrawn.`)}>Withdraw</Button> : <Button variant="danger" onClick={() => runAction(() => tournamentApi.removePlayer(club.id, tournamentId, player.id), `${player.name} removed.`)}>Remove</Button>)}</td>}</tr>)}</tbody>
                </table></div>
            </section>

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
