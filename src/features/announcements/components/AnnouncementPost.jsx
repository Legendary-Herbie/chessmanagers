import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { announcementApi } from '../api/announcementApi.js';
import AttachmentList, { ImageAttachment } from './AttachmentList.jsx';

export default function AnnouncementPost({ announcement, club }) {
    const ref = useRef(null);
    const [views, setViews] = useState(announcement.viewCount ?? 0);
    useEffect(() => {
        if (announcement.status !== 'published' || !window.IntersectionObserver) return;
        let active = true;
        const observer = new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            observer.disconnect();
            announcementApi.view(club.id, announcement.id).then(result => {
                if (active) setViews(result.viewCount);
            }).catch(() => {});
        }, { threshold: 0.1 });
        observer.observe(ref.current);
        return () => { active = false; observer.disconnect(); };
    }, [announcement.id, announcement.status, club.id]);
    const files = announcement.attachments ?? [];
    const author = announcement.authorName || club.name;
    return <article className="announcement-card" ref={ref}>
        <header className="announcement-post-header">
            <span className="announcement-avatar" aria-hidden="true">{author?.slice(0, 1).toUpperCase()}</span>
            <div className="announcement-post-author"><strong>{author}</strong>
                <time dateTime={announcement.publishedAt || announcement.updatedAt}>{new Date(announcement.publishedAt || announcement.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
            </div>
            {announcement.status !== 'published' && <span className={`announcement-status announcement-status--${announcement.status}`}>{announcement.status}</span>}
        </header>
        <h2><Link className="title-link" to={`/announcements/${announcement.id}`}>{announcement.title}</Link></h2>
        {!!files.filter(file => file.kind === 'image').length && <div className="announcement-post-images">
            {files.filter(file => file.kind === 'image').map(file => <ImageAttachment key={file.id} clubId={club.id} announcementId={announcement.id} attachment={file} />)}
        </div>}
        {announcement.contentHtml ? <div className="announcement-content" dangerouslySetInnerHTML={{ __html: announcement.contentHtml }} />
            : <p className="announcement-post-text">{announcement.contentText}</p>}
        <AttachmentList clubId={club.id} announcementId={announcement.id} attachments={files.filter(file => file.kind !== 'image')} canManage={false} />
        <footer className="announcement-post-footer">
            <span title="Unique signed-in viewers">{views} {views === 1 ? 'view' : 'views'}</span>
            <Link className="text-link" to={`/announcements/${announcement.id}`}>Open announcement <span aria-hidden="true">→</span></Link>
        </footer>
    </article>;
}
