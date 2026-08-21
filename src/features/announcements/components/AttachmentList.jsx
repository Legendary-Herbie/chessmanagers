import React, { useEffect, useState } from 'react';
import { announcementApi } from '../api/announcementApi.js';

function ImageAttachment({ clubId, announcementId, attachment }) {
    const [url, setUrl] = useState(null);
    useEffect(() => {
        let active = true;
        let objectUrl;
        announcementApi.fetchAttachment(clubId, announcementId, attachment.id)
            .then(blob => {
                objectUrl = URL.createObjectURL(blob);
                if (active) setUrl(objectUrl);
            })
            .catch(() => {});
        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [announcementId, attachment.id, clubId]);
    return url ? <img src={url} alt={attachment.originalName} /> : <span>Loading image…</span>;
}

export default function AttachmentList({ clubId, announcementId, attachments, canManage, onDelete }) {
    const download = async attachment => {
        const blob = await announcementApi.fetchAttachment(clubId, announcementId, attachment.id);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.originalName;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (!attachments?.length) return null;
    return (
        <section className="announcement-attachments" aria-label="Attachments">
            <h2>Attachments</h2>
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
                        <button type="button" onClick={() => download(attachment)}>Download</button>
                        {canManage && <button type="button" onClick={() => onDelete(attachment.id)}>Remove</button>}
                    </li>
                ))}
            </ul>
        </section>
    );
}
