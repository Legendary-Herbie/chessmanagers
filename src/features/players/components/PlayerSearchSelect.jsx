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
                setResults(response.players);
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
    }, [clubId, open, query]);

    function choose(player) {
        setSelected(player);
        setQuery(player.name);
        setOpen(false);
        setActiveIndex(-1);
        onChange(player.id);
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
            setActiveIndex(index => Math.min(index + 1, results.length - 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(index => Math.max(index - 1, 0));
        } else if (event.key === 'Enter' && open && activeIndex >= 0 && results[activeIndex]) {
            event.preventDefault();
            choose(results[activeIndex]);
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
                    aria-autocomplete="list"
                    aria-expanded={open}
                    aria-controls={listboxId}
                    aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
                    placeholder={placeholder}
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setOpen(false)}
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
                            <span>{player.name}</span>
                            {player.ratings && <small>
                                B {player.ratings.blitz?.current_rating ?? '—'} · R {player.ratings.rapid?.current_rating ?? '—'} · C {player.ratings.classical?.current_rating ?? '—'}
                            </small>}
                        </button>
                    ))}
                    {!loading && !loadError && !results.length && (
                        <div className="player-search-select__status">No players found.</div>
                    )}
                </div>
            )}
        </div>
    );
}
