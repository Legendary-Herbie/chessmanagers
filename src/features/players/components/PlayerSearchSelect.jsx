import ClaimedBadge from './ClaimedBadge.jsx';
import React, { useEffect, useId, useRef, useState } from 'react';
import { isCancelledError } from '../../../config/api.js';
import { playerApi } from '../api/playerApi.js';

const SEARCH_LIMIT = 20;

export default function PlayerSearchSelect({
    clubId,
    label,
    value,
    onChange,
    selectedPlayer = null,
    placeholder = 'Search players',
    allowClear = false,
    excludePlayerId = null,
    onSelect,
    allowCreate = false,
}) {
    const inputId = useId();
    const listboxId = `${inputId}-results`;
    const selectedPlayerId = selectedPlayer?.id || null;
    const selectedPlayerName = selectedPlayer?.name || '';
    const [query, setQuery] = useState(selectedPlayer?.name || '');
    const [selected, setSelected] = useState(selectedPlayer);
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const requestSequence = useRef(0);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');
    const creatingLock = useRef(false);
    const context = useRef(null);
    useEffect(() => {
        const token = {};
        context.current = token;
        return () => { if (context.current === token) context.current = null; };
    }, [clubId]);
    const canCreate = allowCreate && query.trim().length > 0 && query.trim().length <= 100
        && !loading && !loadError && !selected
        && !results.some(player => player.name.toLocaleLowerCase() === query.trim().toLocaleLowerCase());
    const optionCount = results.length + (canCreate ? 1 : 0);

    async function createPlayer() {
        if (!canCreate || creatingLock.current) return;
        const token = context.current;
        creatingLock.current = true;
        setCreating(true);
        setCreateError('');
        try {
            const player = await playerApi.createPlayer(clubId, { name: query.trim() });
            if (context.current === token) choose(player);
        } catch (error) {
            if (context.current === token) setCreateError(error.message || 'Couldn’t add player. Try again.');
        } finally {
            creatingLock.current = false;
            if (context.current === token) setCreating(false);
        }
    }

    useEffect(() => {
        setSelected(selectedPlayerId ? { id: selectedPlayerId, name: selectedPlayerName } : null);
        setQuery(selectedPlayerName);
    }, [clubId, selectedPlayerId, selectedPlayerName]);

    useEffect(() => {
        if (!open || !clubId) return undefined;
        const controller = new AbortController();
        const sequence = ++requestSequence.current;
        setLoading(true);
        setLoadError(false);
        setResults([]);
        setActiveIndex(-1);
        const timer = setTimeout(async () => {
            try {
                const response = await playerApi.searchPlayers(clubId, {
                    q: query.trim(),
                    limit: SEARCH_LIMIT,
                    signal: controller.signal,
                });
                if (controller.signal.aborted || sequence !== requestSequence.current) return;
                setResults(response.players.filter(player => player.id !== excludePlayerId));
                setActiveIndex(response.players.length ? 0 : -1);
            } catch (error) {
                if (controller.signal.aborted || isCancelledError(error)) return;
                setResults([]);
                setActiveIndex(-1);
                setLoadError(true);
            } finally {
                if (!controller.signal.aborted && sequence === requestSequence.current) setLoading(false);
            }
        }, 250);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [clubId, open, query, excludePlayerId]);

    function choose(player) {
        setSelected(player);
        setQuery(player.name);
        setOpen(false);
        setActiveIndex(-1);
        onChange(player.id);
        onSelect?.(player);
    }

    function clearSelection() {
        setSelected(null);
        setQuery('');
        setOpen(false);
        setResults([]);
        setActiveIndex(-1);
        onChange('');
    }

    function handleInputChange(event) {
        setCreateError('');
        setQuery(event.target.value);
        setOpen(true);
        if (selected || value) {
            setSelected(null);
            onChange('');
        }
    }

    function handleKeyDown(event) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(index => Math.min(index + 1, optionCount - 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(index => Math.max(index - 1, 0));
        } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (results[activeIndex]) choose(results[activeIndex]);
            else if (canCreate && (activeIndex === results.length || results.length === 0)) void createPlayer();
        } else if (event.key === 'Escape' && open) {
            event.stopPropagation();
            setOpen(false);
            setActiveIndex(-1);
        }
    }

    return (
        <div className="player-search-select">
            <label className="player-search-select__label" htmlFor={inputId}>{label}</label>
            <div className="player-search-select__control">
                <input
                    id={inputId}
                    className="input"
                    type="text"
                    role="combobox"
                    autoComplete="off"
                    readOnly={creating}
                    aria-busy={creating}
                    aria-autocomplete="list"
                    aria-expanded={open}
                    aria-controls={listboxId}
                    aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
                    placeholder={placeholder}
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => setOpen(true)}
                    onBlur={() => { if (!creatingLock.current) setOpen(false); }}
                    onKeyDown={handleKeyDown}
                />
                {allowClear && value && (
                    <button type="button" className="player-search-select__clear"
                        aria-label={`Clear ${label.toLowerCase()}`} onMouseDown={event => event.preventDefault()}
                        onClick={clearSelection}>×</button>
                )}
            </div>
            {open && (
                <div className="player-search-select__results" id={listboxId} role="listbox">
                    {loading && <div className="player-search-select__status">Searching…</div>}
                    {!loading && loadError && <div className="player-search-select__status">Player search is unavailable.</div>}
                    {!loading && !loadError && results.map((player, index) => (
                        <button
                            type="button"
                            id={`${listboxId}-${index}`}
                            role="option"
                            aria-selected={player.id === value}
                            className={`player-search-select__option ${index === activeIndex ? 'active' : ''}`}
                            key={player.id}
                            onMouseDown={event => event.preventDefault()}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => choose(player)}
                        >
                            <span>{player.name} <ClaimedBadge status={player.link_status} /></span>
                            {player.ratings && <small>
                                B {player.ratings.blitz?.current_rating ?? '—'} · R {player.ratings.rapid?.current_rating ?? '—'} · C {player.ratings.classical?.current_rating ?? '—'}
                            </small>}
                        </button>
                    ))}
                    {canCreate && <button type="button" role="option" aria-selected="false"
                        id={`${listboxId}-${results.length}`} disabled={creating}
                        className={`player-search-select__option ${activeIndex === results.length ? 'active' : ''}`}
                        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(results.length)}
                        onClick={createPlayer}>{creating ? 'Adding player…' : `+ Add “${query.trim()}” as new player`}
                        <small>Uses this club’s starting ratings</small>
                    </button>}
                    {!loading && !loadError && !results.length && !canCreate && (
                        <div className="player-search-select__status">No players found.</div>
                    )}
                </div>
            )}
            {createError && <p role="alert">{createError}</p>}
        </div>
    );
}
