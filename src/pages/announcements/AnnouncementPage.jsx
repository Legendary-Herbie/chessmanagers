import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useClub } from '../../app/contextHooks.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { announcementApi } from '../../features/announcements/api/announcementApi.js';
import AttachmentList from '../../features/announcements/components/AttachmentList.jsx';
import RichTextEditor from '../../features/announcements/components/RichTextEditor.jsx';
import Button from '../../shared/common/Button.jsx';
import '../../styles/announcements.css';

export default function AnnouncementPage() {
    const { announcementId } = useParams();
    const navigate = useNavigate();
    const { club, capabilities } = useClub();
    const canManage = Boolean(capabilities.canManageAnnouncements);
    const [announcement, setAnnouncement] = useState(null);
    const [title, setTitle] = useState('');
    const [contentHtml, setContentHtml] = useState('');
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState(null);
    const [confirmAction, setConfirmAction] = useState(null);

    const load = useCallback(async () => {
        if (!club?.id) return;
        setLoading(true);
        setError(null);
        try {
            const result = await announcementApi.get(club.id, announcementId);
            setAnnouncement(result.announcement);
            setTitle(result.announcement.title);
            setContentHtml(result.announcement.contentHtml);
        } catch (loadError) {
            setError(loadError.message || 'Could not load announcement.');
        } finally {
            setLoading(false);
        }
    }, [announcementId, club?.id]);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        setWorking(true);
        setError(null);
        try {
            const result = await announcementApi.update(club.id, announcementId, { title, contentHtml });
            setAnnouncement(current => ({ ...current, ...result.announcement, attachments: current.attachments }));
            setEditing(false);
        } catch (saveError) {
            setError(saveError.message || 'Could not save announcement.');
        } finally { setWorking(false); }
    };

    const runLifecycle = async action => {
        setWorking(true);
        setError(null);
        try {
            if (action === 'publish') await announcementApi.publish(club.id, announcementId);
            if (action === 'archive') await announcementApi.archive(club.id, announcementId);
            if (action === 'delete') {
                await announcementApi.delete(club.id, announcementId);
                navigate('/announcements');
                return;
            }
            await load();
        } catch (actionError) {
            setError(actionError.message || 'Could not update announcement.');
        } finally {
            setWorking(false);
            setConfirmAction(null);
        }
    };

    const upload = async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        setWorking(true);
        setError(null);
        try {
            await announcementApi.uploadAttachment(club.id, announcementId, file);
            await load();
        } catch (uploadError) {
            setError(uploadError.message || 'Could not upload attachment.');
        } finally {
            setWorking(false);
            event.target.value = '';
        }
    };

    const removeAttachment = async attachmentId => {
        setWorking(true);
        try {
            await announcementApi.deleteAttachment(club.id, announcementId, attachmentId);
            await load();
        } catch (removeError) {
            setError(removeError.message || 'Could not remove attachment.');
        } finally { setWorking(false); }
    };

    if (loading) return <p>Loading announcement…</p>;
    if (error && !announcement) return <p className="announcement-error" role="alert">{error}</p>;
    if (!announcement) return null;

    const editable = canManage && announcement.status !== 'archived';
    return (
        <article className="announcement-detail">
            <Link to="/announcements">← All announcements</Link>
            <header>
                <span className={`announcement-status announcement-status--${announcement.status}`}>{announcement.status}</span>
                {editing ? (
                    <input className="input announcement-title-input" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} />
                ) : <h1>{announcement.title}</h1>}
                <time>{new Date(announcement.publishedAt || announcement.updatedAt).toLocaleString()}</time>
            </header>

            {error && <p className="announcement-error" role="alert">{error}</p>}
            {editing ? (
                <RichTextEditor value={contentHtml} onChange={setContentHtml} disabled={working} />
            ) : (
                <div className="announcement-rich-content" dangerouslySetInnerHTML={{ __html: announcement.contentHtml }} />
            )}

            {canManage && (
                <div className="announcement-actions">
                    {editable && !editing && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
                    {editing && <Button onClick={save} loading={working}>Save changes</Button>}
                    {editing && <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>}
                    {announcement.status === 'draft' && <Button onClick={() => setConfirmAction('publish')}>Publish</Button>}
                    {announcement.status === 'published' && <Button variant="secondary" onClick={() => setConfirmAction('archive')}>Archive</Button>}
                    <Button variant="danger" onClick={() => setConfirmAction('delete')}>Delete</Button>
                </div>
            )}

            {editable && (
                <label className="announcement-upload">
                    <span>Add image or PDF</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={working} onChange={upload} />
                </label>
            )}

            <AttachmentList
                clubId={club.id}
                announcementId={announcementId}
                attachments={announcement.attachments}
                canManage={canManage}
                onDelete={removeAttachment}
            />

            <ConfirmDialog
                isOpen={Boolean(confirmAction)}
                title={`${confirmAction?.[0]?.toUpperCase() || ''}${confirmAction?.slice(1) || ''} announcement`}
                message={confirmAction === 'delete'
                    ? 'This removes the announcement from the club while preserving its audit history.'
                    : `Are you sure you want to ${confirmAction} this announcement?`}
                confirmLabel={confirmAction === 'delete' ? 'Delete' : confirmAction === 'publish' ? 'Publish' : 'Archive'}
                variant={confirmAction === 'delete' ? 'danger' : 'primary'}
                loading={working}
                onClose={() => setConfirmAction(null)}
                onConfirm={() => runLifecycle(confirmAction)}
            />
        </article>
    );
}
