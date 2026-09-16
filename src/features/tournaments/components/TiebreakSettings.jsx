import React, { useState } from 'react';
import Button from '../../../shared/common/Button.jsx';
import { tournamentApi } from '../api/tournamentApi.js';
import { TIEBREAKS, DEFAULT_TIEBREAKS } from '../tiebreaks.js';
export function TiebreakHelp({ name }) {
    return <span className="tiebreak-help" tabIndex={0} title={TIEBREAKS[name].help}>{TIEBREAKS[name].label}<span role="tooltip">{TIEBREAKS[name].help}</span></span>;
}
export default function TiebreakSettings({ clubId, tournament, onSaved }) {
    const [selected, setSelected] = useState(tournament.tiebreaks || DEFAULT_TIEBREAKS);
    const [busy, setBusy] = useState(false); const [error, setError] = useState('');
    function move(index, delta) { setSelected(current => { const next = [...current]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; }); }
    async function save() { setBusy(true); setError(''); try { await tournamentApi.update(clubId, tournament.id, { tiebreaks: selected }); await onSaved(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
    return <details className="tiebreak-settings"><summary>Choose and order tiebreaks</summary><p>Match points always come first. Changes immediately reorder standings.</p><fieldset disabled={busy}>{DEFAULT_TIEBREAKS.map(key => <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() => setSelected(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])} />{TIEBREAKS[key].label}</label>)}<ol>{selected.map((key, index) => <li key={key}>{TIEBREAKS[key].label} <Button variant="secondary" disabled={index === 0} aria-label={`Move ${TIEBREAKS[key].label} up`} onClick={() => move(index, -1)}>↑</Button> <Button variant="secondary" disabled={index === selected.length - 1} aria-label={`Move ${TIEBREAKS[key].label} down`} onClick={() => move(index, 1)}>↓</Button></li>)}</ol><Button onClick={save} loading={busy}>Save tiebreaks</Button></fieldset>{error && <p role="alert">{error}</p>}</details>;
}
