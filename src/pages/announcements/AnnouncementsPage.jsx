import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useClub } from '../../app/contextHooks.js';
import { announcementApi } from '../../features/announcements/api/announcementApi.js';
import RichTextEditor from '../../features/announcements/components/RichTextEditor.jsx';
import Button from '../../shared/common/Button.jsx';
import '../../styles/announcements.css';

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

    if (!club) return <p>Select a club to view announcements.</p>;

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
                <form className="announcement-composer card" onSubmit={create}>
                    <h2>Create draft</h2>
                    <label>Title<input className="input" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required /></label>
                    <label>Content</label>
                    <RichTextEditor value={contentHtml} onChange={setContentHtml} />
                    <div className="announcement-actions">
                        <Button type="submit" loading={creating}>Save draft</Button>
                        <Button variant="secondary" onClick={() => setShowComposer(false)}>Cancel</Button>
                    </div>
                </form>
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
            {!loading && !error && announcements.length === 0 && <div className="announcement-empty">No announcements found.</div>}
            <div className="announcement-grid">
                {announcements.map(announcement => (
                    <Link className="announcement-card" to={`/announcements/${announcement.id}`} key={announcement.id}>
                        <div className="announcement-card__meta">
                            <span className={`announcement-status announcement-status--${announcement.status}`}>{announcement.status}</span>
                            <time>{new Date(announcement.publishedAt || announcement.updatedAt).toLocaleDateString()}</time>
                        </div>
                        <h2>{announcement.title}</h2>
                        <p>{announcement.contentText}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
