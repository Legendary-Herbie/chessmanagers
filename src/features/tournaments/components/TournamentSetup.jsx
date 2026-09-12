import ClaimedBadge from '../../players/components/ClaimedBadge.jsx';
import React, { useEffect, useState } from 'react';
import { playerApi } from '../../players/api/playerApi.js';
import { tournamentApi } from '../api/tournamentApi.js';
import Button from '../../../shared/common/Button.jsx';

export default function TournamentSetup({ clubId, tournamentId, participants, onComplete, onSaveLater }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [selected, setSelected] = useState({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        async function loadPlayers() {
            try {
                const players = [];
                let offset = 0;
                while (!controller.signal.aborted) {
                    const data = await playerApi.searchPlayers(clubId, { offset, limit: 100, signal: controller.signal });
                    players.push(...data.players);
                    offset += data.players.length;
                    if (!data.players.length || offset >= data.total) break;
                }
                if (!controller.signal.aborted) { setResults(players); setError(''); }
            } catch (err) { if (!controller.signal.aborted) setError(err.message || 'Could not load players.'); }
            finally { if (!controller.signal.aborted) setLoading(false); }
        }
        void loadPlayers();
        return () => controller.abort();
    }, [clubId, retry]);
    const filtered = results.filter(player => {
        const name = player.name.toLocaleLowerCase();
        const letters = query.trim().toLocaleLowerCase();
        let cursor = 0;
        for (const letter of name) if (letter === letters[cursor]) cursor++;
        return cursor === letters.length;
    });
    const registered = new Set(participants.map(player => player.id));
    const additions = Object.values(selected).filter(player => !registered.has(player.id));
    const allActiveSelected = results.length > 0 && results.every(player => registered.has(player.id) || selected[player.id]);
    function toggle(player) {
        setSelected(current => {
            const next = { ...current };
            if (next[player.id]) delete next[player.id]; else next[player.id] = player;
            return next;
        });
    }
    async function save(start) {
        if (saving) return;
        setSaving(true); setError('');
        try {
            await tournamentApi.setup(clubId, tournamentId, additions.length > 250 && allActiveSelected
                ? { playerIds: [], allActivePlayers: true, start }
                : { playerIds: additions.map(player => player.id), start });
            setSelected({});
            if (start) await onComplete(); else onSaveLater();
        } catch (err) { setError(err.message || 'Could not save setup. Your selection is still here.'); }
        finally { setSaving(false); }
    }
    return <section className="tournament-setup">
        <h2>Set up your tournament</h2>
        <p>Select players together, review the roster, then start the first round.</p>
        {saving && <p role="status">Saving tournament setup…</p>}
        {error && <div role="alert">{error} <Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Retry player search</Button></div>}
        <fieldset disabled={saving}>
            <label>Find club players<input type="search" className="input" value={query} onChange={event => setQuery(event.target.value)} /></label>
            {loading ? <p role="status">Loading players…</p> : <>
                <Button variant="secondary" onClick={() => setSelected(current => ({ ...current, ...Object.fromEntries(results.filter(player => !registered.has(player.id)).map(player => [player.id, player])) }))}>Select all {results.length} active players</Button>
                <div className="setup-player-options">{filtered.map(player => <label key={player.id}>
                    <input type="checkbox" disabled={registered.has(player.id)} checked={registered.has(player.id) || Boolean(selected[player.id])} onChange={() => toggle(player)} />
                    {player.name} <ClaimedBadge status={player.link_status} />{registered.has(player.id) && <small> Registered</small>}
                </label>)}</div>
                {!filtered.length && <p>No matching players.</p>}
            </>}
            <div><strong>{participants.length + additions.length} players selected</strong>
                <div className="setup-selection">{participants.map(player => <span key={player.id}>{player.name}</span>)}
                    {additions.map(player => <button type="button" key={player.id} onClick={() => toggle(player)} aria-label={`Remove ${player.name} from selection`}>{player.name} <ClaimedBadge status={player.link_status} /> ×</button>)}
                </div>
            </div>
            <div className="setup-actions"><Button variant="secondary" disabled={additions.length > 250 && !allActiveSelected} onClick={() => save(false)}>Save for later</Button><Button disabled={participants.length + additions.length < 2 || additions.length > 250 && !allActiveSelected} onClick={() => save(true)}>Start and pair round 1</Button></div>
            {additions.length > 250 && !allActiveSelected && <p role="alert">Select all active players, or save up to 250 additional players at a time.</p>}
        </fieldset>
    </section>;
}
