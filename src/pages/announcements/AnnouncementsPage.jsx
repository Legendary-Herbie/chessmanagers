import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useClub } from '../../app/contextHooks.js';
import { announcementApi } from '../../features/announcements/api/announcementApi.js';
import RichTextEditor from '../../features/announcements/components/RichTextEditor.jsx';
import Button from '../../shared/common/Button.jsx';
import Dialog from '../../shared/common/Dialog.jsx';
import '../../styles/announcements.css';
import NoClubState from '../../shared/common/NoClubState.jsx';

export default function AnnouncementsPage() {
    const { club, capabilities } = useClub();
    const navigate = useNavigate();
    const canManage = Boolean(capabilities.canManageAnnouncements);
    const [announcements, setAnnouncements] = useState([]);
    const [status, setStatus] = useState('');
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [creating, setCreating] = useState(false);
    const [showComposer, setShowComposer] = useState(false);
    const [title, setTitle] = useState('');
    const [contentHtml, setContentHtml] = useState('<p></p>');

    const load = useCallback(async () => {
        if (!club?.id) return;
        setLoading(true);
        setError(null);
        try {
            const result = await announcementApi.list(club.id, {
                ...(canManage && status ? { status } : {}),
                ...(query ? { q: query } : {}),
            });
            setAnnouncements(result.announcements);
        } catch (loadError) {
            setError(loadError.message || 'Could not load announcements.');
        } finally {
            setLoading(false);
        }
    }, [canManage, club?.id, query, status]);

    useEffect(() => { load(); }, [load]);

    const create = async event => {
        event.preventDefault();
        setCreating(true);
        setError(null);
        try {
            const result = await announcementApi.create(club.id, { title, contentHtml });
            navigate(`/announcements/${result.announcement.id}`);
        } catch (createError) {
            setError(createError.message || 'Could not create announcement.');
        } finally {
            setCreating(false);
        }
    };

    if (!club) return <NoClubState title="Keep everyone informed"
        feature="Announcements give a club one place for news, event details, rich text, and shared files."
        description="Create a club or join one to publish and read its updates." />;

    return (
        <div className="announcements-page">
            <header className="announcement-page-header">
                <div>
                    <span className="eyebrow">{club.name}</span>
                    <h1>Announcements</h1>
                    <p>Club news, updates, and shared files.</p>
                </div>
                {canManage && <Button onClick={() => setShowComposer(value => !value)}>New announcement</Button>}
            </header>

            {showComposer && canManage && (
                <Dialog title="New announcement" busy={creating} onClose={() => setShowComposer(false)}>
                <form className="announcement-composer" onSubmit={create}>
                    <p className="muted">Share an update with {club.name}. Save a draft to add files and review it before publishing.</p>
                    {error && <p className="announcement-error" role="alert">{error}</p>}
                    <label>Title<input className="input" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required /></label>
                    <label>Content</label>
                    <RichTextEditor value={contentHtml} onChange={setContentHtml} />
                    <div className="announcement-actions">
                        <Button type="submit" loading={creating}>Save draft</Button>
                        <Button variant="secondary" onClick={() => setShowComposer(false)}>Cancel</Button>
                    </div>
                </form>
                </Dialog>
            )}

            <div className="announcement-filters">
                <label>Search<input className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search announcements" /></label>
                {canManage && (
                    <label>Status<select className="input" value={status} onChange={event => setStatus(event.target.value)}>
                        <option value="">All states</option>
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="archived">Archived</option>
                    </select></label>
                )}
            </div>

            {error && <p className="announcement-error" role="alert">{error}</p>}
            {loading && <p>Loading announcements…</p>}
            {!loading && !error && announcements.length === 0 && <section className="announcement-empty">
                <span className="announcement-empty__icon" aria-hidden="true">◈</span>
                <h2>{query || status ? 'No announcements match these filters' : 'A quieter feed—for now'}</h2>
                <p>{query || status ? 'Try a different search or status.'
                    : 'Published updates, event details, and shared club files will appear here in one easy-to-find place.'}</p>
                {canManage && !query && !status && <Button onClick={() => setShowComposer(true)}>Create the first announcement</Button>}
            </section>}
            <div className="announcement-grid">
                {announcements.map(announcement => (
                    <article className="announcement-card" key={announcement.id}>
                        <header className="announcement-post-header">
                            <span className="announcement-avatar" aria-hidden="true">{club.name?.slice(0, 1).toUpperCase()}</span>
                            <div className="announcement-post-author"><strong>{club.name}</strong>
                                <time dateTime={announcement.publishedAt || announcement.updatedAt}>{new Date(announcement.publishedAt || announcement.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
                            </div>
                            {announcement.status !== 'published' && <span className={`announcement-status announcement-status--${announcement.status}`}>{announcement.status}</span>}
                        </header>
                        <h2><Link to={`/announcements/${announcement.id}`}>{announcement.title}</Link></h2>
                        <p className="announcement-post-text">{announcement.contentText}</p>
                        <footer className="announcement-post-footer"><Link to={`/announcements/${announcement.id}`}>View announcement <span aria-hidden="true">→</span></Link></footer>
                    </article>
                ))}
            </div>
        </div>
    );
}
