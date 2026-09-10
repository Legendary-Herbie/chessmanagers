import React, { useEffect, useState } from 'react';
import { playerApi } from '../api/playerApi.js';
import Dialog from '../../../shared/common/Dialog.jsx';
import { parseBulkPlayers, readStartRatings } from './bulkPlayerEntry.js';
import '../../../styles/playerForms.css';

const categories = ['blitz', 'rapid', 'classical'];
const title = value => value[0].toUpperCase() + value.slice(1);

export default function AddPlayerForm({ isOpen = false, isInline = false, onClose, clubId, ratingSettings = {}, onPlayerAdded }) {
    const [tab, setTab] = useState('single');
    const [name, setName] = useState('');
    const [bio, setBio] = useState('');
    const [ratings, setRatings] = useState({});
    const [bulkRatings, setBulkRatings] = useState({});
    const [useShared, setUseShared] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState('');
    const blitz = ratingSettings.blitz?.initialRating ?? 1500;
    const rapid = ratingSettings.rapid?.initialRating ?? 1500;
    const classical = ratingSettings.classical?.initialRating ?? 1500;
    useEffect(() => {
        const defaults = { blitz: String(blitz), rapid: String(rapid), classical: String(classical) };
        setRatings(defaults); setBulkRatings(defaults);
    }, [blitz, rapid, classical, clubId]);
    if (!isInline && !isOpen) return null;
    const parsed = parseBulkPlayers(bulkText, { sharedRatings: useShared ? bulkRatings : null, settings: ratingSettings });
    const save = async (event, bulk) => {
        event.preventDefault();
        if (loading) return;
        setError(null); setNotice('');
        try {
            const startRatings = bulk ? null : readStartRatings(ratings, ratingSettings);
            if (bulk && parsed.errors.length) throw new Error(parsed.errors.join(' '));
            if (bulk && !parsed.players.length) throw new Error('Enter at least one player name.');
            setLoading(true);
            if (bulk) {
                const created = await playerApi.createPlayersBulk(clubId, parsed.players);
                setNotice(`Added ${created.length} players.`); setBulkText('');
            } else {
                await playerApi.createPlayer(clubId, { name: name.trim(), startRatings, bio: bio.trim() || undefined });
                setName(''); setBio(''); setNotice('Player added.');
            }
            await onPlayerAdded?.();
            onClose?.();
        } catch (requestError) { setError(requestError.message || 'Could not add players.'); }
        finally { setLoading(false); }
    };
    const ratingFields = bulk => <fieldset className="player-start-ratings">
        <legend>Starting ratings</legend>
        <div className="player-rating-inputs">{categories.map(category => <label key={category}>
            {title(category)}<input type="number" className="form-input" aria-label={`${bulk ? 'Bulk ' : ''}${title(category)}`}
                value={(bulk ? bulkRatings : ratings)[category] ?? ''} min={ratingSettings[category]?.ratingFloor ?? 100} max={4000} step={1}
                onChange={event => (bulk ? setBulkRatings : setRatings)(current => ({ ...current, [category]: event.target.value }))} />
        </label>)}</div>
        {bulk && <label className="identity-name-lock"><input type="checkbox" checked={useShared} onChange={event => setUseShared(event.target.checked)} />Use these ratings for all players</label>}
    </fieldset>;
    const actions = bulk => <div className="player-form-actions">
        {onClose && <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>}
        <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Adding…' : bulk ? (parsed.players.length ? `Add ${parsed.players.length} Player(s)` : 'Add players') : 'Add Player'}</button>
    </div>;
    const content = <>
        <div className="player-entry-tabs" role="group" aria-label="Player entry mode">
            <button type="button" aria-pressed={tab === 'single'} onClick={() => setTab('single')}>Single Player</button>
            <button type="button" aria-pressed={tab === 'bulk'} onClick={() => setTab('bulk')}>Bulk roster entry</button>
        </div>
        {error && <p className="error-box player-entry-message" role="alert">{error}</p>}
        {notice && <p className="player-entry-message" role="status">{notice}</p>}
        <div className="player-entry-columns">
            {tab === 'single' && <form className="player-entry-panel" onSubmit={event => save(event, false)}>
                <fieldset disabled={loading} className="player-form-body">
                    <h3>Single player</h3>
                    <label className="form-group">Player Full Name *<input className="form-input" value={name} onChange={event => setName(event.target.value)} required maxLength={100} /></label>
                    {ratingFields(false)}
                    <label className="form-group">Biography / Notes (Optional)<textarea className="form-textarea" value={bio} onChange={event => setBio(event.target.value)} maxLength={500} rows={5} /></label>
                    {actions(false)}
                </fieldset>
            </form>}
            {tab === 'bulk' && <form className="player-entry-panel" onSubmit={event => save(event, true)}>
                <fieldset disabled={loading} className="player-form-body">
                    <h3>Bulk player entry</h3>
                    {ratingFields(true)}
                    <label className="form-group">Paste Player Names (One per line)<textarea className="form-textarea bulk-player-text" value={bulkText} onChange={event => setBulkText(event.target.value)} rows={6}
                        placeholder={'Alex Morgan\nSam Lee, 1500, 1600, 1700, Club captain'} /></label>
                    <p className="form-helper">Name, Blitz, Rapid, Classical, Bio<br />or Name, Rating (all), Bio. Names alone use club defaults. Put names containing commas in quotes.</p>
                    {!!parsed.players.length && <details><summary>Preview {parsed.players.length} players</summary><ul>{parsed.players.slice(0, 5).map((player, i) => <li key={i}>{player.name}</li>)}</ul></details>}
                    {actions(true)}
                </fieldset>
            </form>}
        </div>
    </>;
    return isInline ? <section className="player-entry-inline">{content}</section>
        : <Dialog title="Add players" className="player-entry-dialog" onClose={onClose} busy={loading}>{content}</Dialog>;
}
