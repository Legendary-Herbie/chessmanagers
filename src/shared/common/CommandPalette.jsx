import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClub, useTheme } from '../../app/contextHooks.js';
import { playerApi } from '../../features/players/api/playerApi.js';
import { tournamentApi } from '../../features/tournaments/api/tournamentApi.js';
import { announcementApi } from '../../features/announcements/api/announcementApi.js';
import Dialog from './Dialog.jsx';
import Icon from './Icon.jsx';
import './commandPalette.css';
export default function CommandPalette() {
    const { club, capabilities } = useClub(); const { toggleTheme } = useTheme(); const navigate = useNavigate();
    const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [active, setActive] = useState(0); const input = useRef(null);
    useEffect(() => {
        const key = event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey && !event.isComposing) {
            if (document.querySelector('[role="dialog"][aria-modal="true"]') && !open) return;
            event.preventDefault(); setOpen(value => !value);
        } };
        window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
    }, [open]);
    useEffect(() => { setOpen(false); setQuery(''); setResults([]); }, [club?.id]);
    useEffect(() => { if (open) { setQuery(''); setActive(0); input.current?.focus(); } }, [open]);
    useEffect(() => {
        if (!open || !club?.id) return;
        let current = true; setLoading(true); setResults([]); setError(''); setActive(0);
        const timer = setTimeout(async () => {
            const settled = await Promise.allSettled([
                playerApi.searchPlayers(club.id, { q: query, limit: 8 }),
                tournamentApi.list(club.id, { q: query, status: 'active', limit: 5 }),
                announcementApi.list(club.id, { q: query, status: 'published', limit: 5 }),
            ]);
            if (!current) return;
            const [players, tournaments, announcements] = settled.map(result => result.status === 'fulfilled' ? result.value : {});
            setResults([...(players.players || []).map(player => ({ label: player.name, kind: 'Player', to: `/players/${player.id}` })),
                ...(tournaments.tournaments || []).map(tournament => ({ label: tournament.name, kind: 'Tournament', to: `/tournaments/${tournament.id}` })),
                ...(announcements.announcements || []).map(post => ({ label: post.title, kind: 'Announcement', to: `/announcements/${post.id}` }))]);
            if (settled.some(result => result.status === 'rejected')) setError('Some results could not load. Try your search again.');
            setLoading(false);
        }, 200);
        return () => { current = false; clearTimeout(timer); };
    }, [open, query, club?.id]);
    const actions = [
        ...(capabilities.canManageMatches ? [{ label:'Record match', to:'/matches?action=add' }] : []),
        ...(capabilities.canManagePlayers ? [{ label:'Add player', to:'/players?action=add' }] : []),
        { label:'Toggle dark / light mode', action:toggleTheme },
        ...['Dashboard','Players','Matches','Tournaments','Announcements'].map(label => ({ label, to:`/${label.toLowerCase()}` })),
    ].filter(item => item.label.toLowerCase().includes(query.toLowerCase()));
    const choices = [...actions, ...results];
    useEffect(() => { if (open) document.getElementById(`command-${active}`)?.scrollIntoView?.({ block: 'nearest' }); }, [open, active]);
    const choose = item => { setOpen(false); if (item.action) item.action(); else navigate(item.to); };
    return <><button className="command-trigger" type="button" aria-label="Quick search" title="Search (Ctrl / Cmd K)" onClick={() => setOpen(true)}><Icon name="search" size="lg" /></button>{open && <Dialog title="Quick search" onClose={() => setOpen(false)}>
        <div className="command-content"><input ref={input} className="input" role="combobox" aria-label="Search players, tournaments, announcements and actions" aria-expanded="true" aria-controls="command-results" aria-activedescendant={choices[active] ? `command-${active}` : undefined} maxLength={100} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(value => Math.max(0, Math.min(choices.length - 1, value + (event.key === 'ArrowDown' ? 1 : -1)))); }
            if (event.key === 'Enter' && choices[active]) { event.preventDefault(); choose(choices[active]); }
        }} />
        <p className="muted">{club?.name || 'Choose a club to search its records'} · Use ↑ ↓ and Enter</p>
        {loading && <p role="status">Searching…</p>}{error && <p role="alert">{error}</p>}
        <ul id="command-results" role="listbox" className="command-results">{choices.map((item, index) => <li id={`command-${index}`} role="option" aria-selected={index === active} key={`${item.kind || 'Action'}:${item.to || item.label}`} onMouseDown={event => event.preventDefault()} onClick={() => choose(item)} onMouseEnter={() => setActive(index)}>{item.label}<small>{item.kind || 'Action'}</small></li>)}</ul>
        {!loading && !choices.length && <p>No matches. Try another name.</p>}
        </div></Dialog>}</>;
}
