import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useClub } from '../../app/contextHooks.js';
import { announcementApi } from '../../features/announcements/api/announcementApi.js';
import AnnouncementComposer from '../../features/announcements/components/AnnouncementComposer.jsx';
import AnnouncementPost from '../../features/announcements/components/AnnouncementPost.jsx';
import Button from '../../shared/common/Button.jsx';
import NoClubState from '../../shared/common/NoClubState.jsx';
import '../../styles/announcements.css';
import { useSearchParams } from 'react-router-dom';

export default function AnnouncementsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { club, capabilities } = useClub();
    const canManage = Boolean(capabilities.canManageAnnouncements);
    const [announcements, setAnnouncements] = useState([]);
    const [status, setStatus] = useState('');
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showComposer, setShowComposer] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [feedClub, setFeedClub] = useState(null);
    const sentinel = useRef(null);
    const generation = useRef({ value: 0 });
    const busy = useRef(false);
    const offset = useRef(0);

    const load = useCallback(async (reset = false) => {
        if (!club?.id || (!reset && busy.current)) return;
        const current = ++generation.current.value;
        busy.current = true; setLoading(true); setError(null);
        if (reset) { offset.current = 0; setAnnouncements([]); setHasMore(false); }
        try {
            const result = await announcementApi.list(club.id, {
                ...(canManage && status ? { status } : {}), ...(query ? { q: query } : {}),
                ...(offset.current ? { offset: offset.current } : {}),
            });
            if (current !== generation.current.value) return;
            offset.current += result.announcements.length;
            setAnnouncements(previous => reset ? result.announcements : [...previous, ...result.announcements.filter(row => !previous.some(value => value.id === row.id))]);
            setHasMore(result.announcements.length > 0 && offset.current < (result.total ?? offset.current));
            setFeedClub(club.id);
        } catch (loadError) {
            if (current === generation.current.value) setError(loadError.message || 'Could not load announcements.');
        } finally {
            if (current === generation.current.value) { busy.current = false; setLoading(false); }
        }
    }, [canManage, club?.id, query, status]);
    useEffect(() => {
        const requestState = generation.current;
        load(true);
        return () => { requestState.value++; busy.current = false; };
    }, [load]);
    useEffect(() => { setShowComposer(false); }, [club?.id]);
    useEffect(() => {
        if (club?.id && canManage && searchParams.get('action') === 'create') {
            setShowComposer(true);
            const next = new URLSearchParams(searchParams); next.delete('action');
            setSearchParams(next, { replace: true });
        }
    }, [club?.id, canManage, searchParams, setSearchParams]);
    useEffect(() => {
        if (!hasMore || loading || error || !window.IntersectionObserver || !sentinel.current) return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) load();
        }, { rootMargin: '200px' });
        observer.observe(sentinel.current);
        return () => observer.disconnect();
    }, [hasMore, loading, error, load]);

    if (!club) return <NoClubState title="Keep everyone informed"
        feature="Announcements give a club one place for news, event details, rich text, and shared files."
        description="Create a club or join one to publish and read its updates." />;
    const visible = feedClub === club.id ? announcements : [];
    return <div className="announcements-page">
        <header className="announcement-page-header">
            <div><span className="eyebrow">{club.name}</span><h1>Announcements</h1><p>News from your club, all in one place.</p></div>
            {canManage && <Button onClick={() => setShowComposer(true)}>New announcement</Button>}
        </header>
        {showComposer && canManage && <AnnouncementComposer key={club.id} clubId={club.id}
            onClose={() => { setShowComposer(false); load(true); }}
            onComplete={() => { setShowComposer(false); load(true); }} />}
        <div className="announcement-filters">
            <label>Search<input className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search announcements" /></label>
            {canManage && <label>Status<select className="input" value={status} onChange={event => setStatus(event.target.value)}>
                <option value="">All states</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
            </select></label>}
        </div>
        {error && <div className="announcement-error" role="alert">{error} <Button variant="secondary" onClick={() => load(!visible.length)}>Retry</Button></div>}
        {!loading && !error && !visible.length && <section className="announcement-empty">
            <h2>{query || status ? 'No announcements match these filters' : 'Your club’s next update starts here'}</h2>
            <p>{query || status ? 'Try a different search or status.' : 'News, event details, and shared photos will appear in this feed.'}</p>
            {canManage && !query && !status && <Button onClick={() => setShowComposer(true)}>Create the first announcement</Button>}
        </section>}
        <div className="announcement-grid">{visible.map(announcement => <AnnouncementPost key={`${club.id}-${announcement.id}`} announcement={announcement} club={club} />)}</div>
        {loading && <p role="status">Loading announcements…</p>}
        <div ref={sentinel}>{hasMore && !loading && <Button variant="secondary" onClick={() => load()}>Load more announcements</Button>}</div>
    </div>;
}
