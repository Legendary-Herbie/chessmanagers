import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '../../../shared/common/Button.jsx';
import { tournamentApi } from '../api/tournamentApi.js';
import { TIEBREAKS, DEFAULT_TIEBREAKS } from '../tiebreaks.js';
export function TiebreakHelp({ name }) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const trigger = useRef(null);
    const tooltip = useRef(null);
    const dismissTimer = useRef(null);
    const id = useId();
    const help = TIEBREAKS[name];
    function show() { clearTimeout(dismissTimer.current); setOpen(true); }
    function leave() {
        if (document.activeElement !== trigger.current) {
            dismissTimer.current = setTimeout(() => setOpen(false), 150);
        }
    }
    useEffect(() => () => clearTimeout(dismissTimer.current), []);
    useLayoutEffect(() => {
        if (!open) return;
        const anchor = trigger.current.getBoundingClientRect();
        const { width, height } = tooltip.current.getBoundingClientRect();
        setPosition({
            left: Math.max(8, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 8)),
            top: Math.max(8, anchor.bottom + height + 8 <= window.innerHeight
                ? anchor.bottom + 6 : anchor.top - height - 6),
        });
        const close = () => setOpen(false);
        const escape = event => { if (event.key === 'Escape') close(); };
        const outside = event => {
            if (!trigger.current?.contains(event.target) && !tooltip.current?.contains(event.target)) close();
        };
        document.addEventListener('keydown', escape);
        document.addEventListener('pointerdown', outside);
        document.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            document.removeEventListener('keydown', escape);
            document.removeEventListener('pointerdown', outside);
            document.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [open]);
    return <>
        <button ref={trigger} type="button" className="tiebreak-help" aria-describedby={open ? id : undefined}
            onMouseEnter={show} onMouseLeave={leave} onFocus={show} onBlur={() => setOpen(false)} onClick={show}>
            {help.label}
        </button>
        {open && createPortal(<span ref={tooltip} id={id} className="tiebreak-tooltip" role="tooltip"
            style={position} onMouseEnter={show} onMouseLeave={leave}>{help.help}</span>, document.body)}
    </>;
}
export default function TiebreakSettings({ clubId, tournament, onSaved }) {
    const [selected, setSelected] = useState(tournament.tiebreaks || DEFAULT_TIEBREAKS);
    const [busy, setBusy] = useState(false); const [error, setError] = useState('');
    function move(index, delta) { setSelected(current => { const next = [...current]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; }); }
    async function save() { setBusy(true); setError(''); try { await tournamentApi.update(clubId, tournament.id, { tiebreaks: selected }); await onSaved(); } catch (err) { setError(err.message); } finally { setBusy(false); } }
    return <details className="tiebreak-settings"><summary>Choose and order tiebreaks</summary><p>Match points always come first. Changes immediately reorder standings.</p><fieldset disabled={busy}>{DEFAULT_TIEBREAKS.map(key => <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() => setSelected(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])} />{TIEBREAKS[key].label}</label>)}<ol>{selected.map((key, index) => <li key={key}>{TIEBREAKS[key].label} <Button variant="secondary" disabled={index === 0} aria-label={`Move ${TIEBREAKS[key].label} up`} onClick={() => move(index, -1)}>↑</Button> <Button variant="secondary" disabled={index === selected.length - 1} aria-label={`Move ${TIEBREAKS[key].label} down`} onClick={() => move(index, 1)}>↓</Button></li>)}</ol><Button onClick={save} loading={busy}>Save tiebreaks</Button></fieldset>{error && <p role="alert">{error}</p>}</details>;
}
