import React, { useEffect, useRef, useState } from 'react';
import { announcementApi } from '../api/announcementApi.js';

export function ImageAttachment({ clubId, announcementId, attachment }) {
    const [url, setUrl] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        let objectUrl;
        setUrl(null);
        setError('');
        announcementApi.fetchAttachment(clubId, announcementId, attachment.id)
            .then(blob => {
                if (!active) return;
                objectUrl = URL.createObjectURL(blob);
                setUrl(objectUrl);
            })
            .catch(() => { if (active) setError('Could not load image. Use Download to try again.'); });
        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [announcementId, attachment.id, clubId]);
    return error ? <span role="alert">{error}</span>
        : url ? <img src={url} alt={attachment.originalName} /> : <span>Loading image…</span>;
}

export default function AttachmentList({ clubId, announcementId, attachments, canManage, onDelete }) {
    const [error, setError] = useState('');
    const [downloading, setDownloading] = useState(false);
    const generation = useRef({ value: 0 });
    useEffect(() => {
        const requestState = generation.current;
        requestState.value++;
        setDownloading(false);
        setError('');
        return () => { requestState.value++; };
    }, [clubId, announcementId]);
    const download = async attachment => {
        if (downloading) return;
        const current = generation.current.value;
        setDownloading(true);
        setError('');
        let url;
        try {
            const blob = await announcementApi.fetchAttachment(clubId, announcementId, attachment.id);
            if (current !== generation.current.value) return;
            url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = attachment.originalName;
            link.click();
        } catch (downloadError) {
            if (current === generation.current.value) setError(downloadError.message || 'Download failed. Please try again.');
        } finally {
            if (url) URL.revokeObjectURL(url);
            if (current === generation.current.value) setDownloading(false);
        }
    };

    if (!attachments?.length) return null;
    return (
        <section className="announcement-attachments" aria-label="Attachments">
            <h2>Attachments</h2>
            {error && <p role="alert">{error}</p>}
            <ul>
                {attachments.map(attachment => (
                    <li key={attachment.id}>
                        {attachment.kind === 'image' && (
                            <ImageAttachment clubId={clubId} announcementId={announcementId} attachment={attachment} />
                        )}
                        <div>
                            <strong>{attachment.originalName}</strong>
                            <span>{Math.ceil(attachment.sizeBytes / 1024)} KB</span>
                        </div>
                        <button type="button" disabled={downloading} onClick={() => download(attachment)}>Download</button>
                        {canManage && <button type="button" onClick={() => onDelete(attachment.id)}>Remove</button>}
                    </li>
                ))}
            </ul>
        </section>
    );
}
