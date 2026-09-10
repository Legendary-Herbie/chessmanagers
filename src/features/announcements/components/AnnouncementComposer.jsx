import React, { useEffect, useRef, useState } from 'react';
import Dialog from '../../../shared/common/Dialog.jsx';
import Button from '../../../shared/common/Button.jsx';
import RichTextEditor from './RichTextEditor.jsx';
import { announcementApi } from '../api/announcementApi.js';

function SelectedFile({ file }) {
    const [url, setUrl] = useState(null);
    useEffect(() => {
        if (!file.type.startsWith('image/')) return;
        const value = URL.createObjectURL(file);
        setUrl(value);
        return () => URL.revokeObjectURL(value);
    }, [file]);
    return url ? <img src={url} alt={`Preview of ${file.name}`} /> : <span className="file-preview-pdf">PDF</span>;
}

export default function AnnouncementComposer({ clubId, onClose, onComplete }) {
    const [title, setTitle] = useState('');
    const [contentHtml, setContentHtml] = useState('<p></p>');
    const [files, setFiles] = useState([]);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    const draftId = useRef(null);
    const uploaded = useRef(new Map());
    const inFlight = useRef(false);
    const addFiles = chosen => {
        if (working || !chosen.length) return;
        if (chosen.some(file => file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type))) {
            setError('Choose JPEG, PNG, WebP, or PDF files under 5 MB each.');
        } else { setFiles(current => [...current, ...chosen]); setError(''); }
    };
    const save = async (event, publish) => {
        event.preventDefault();
        if (inFlight.current) return;
        inFlight.current = true;
        setWorking(true); setError('');
        try {
            if (!draftId.current) {
                const result = await announcementApi.create(clubId, { title, contentHtml });
                draftId.current = result.announcement.id;
            } else await announcementApi.update(clubId, draftId.current, { title, contentHtml });
            // Retry only unfinished uploads; the draft is retained until every file is ready.
            for (const file of files) {
                if (!uploaded.current.has(file)) {
                    const result = await announcementApi.uploadAttachment(clubId, draftId.current, file);
                    uploaded.current.set(file, result.attachment.id);
                }
            }
            if (publish) await announcementApi.publish(clubId, draftId.current);
            onComplete();
        } catch (saveError) {
            setError(`${saveError.message || 'Could not save announcement.'}${draftId.current ? ' Your draft is saved. Retry to finish.' : ''}`);
        } finally { inFlight.current = false; setWorking(false); }
    };
    const remove = async file => {
        if (working) return;
        setWorking(true);
        try {
            const attachmentId = uploaded.current.get(file);
            if (attachmentId) await announcementApi.deleteAttachment(clubId, draftId.current, attachmentId);
            uploaded.current.delete(file);
            setFiles(current => current.filter(value => value !== file));
        } catch (removeError) { setError(removeError.message); }
        finally { setWorking(false); }
    };
    return <Dialog title="New announcement" className="announcement-composer-dialog" busy={working} onClose={onClose}>
        <form onSubmit={event => save(event, true)}>
            <fieldset disabled={working} className="announcement-composer">
                {error && <p className="announcement-error" role="alert">{error}</p>}
                <label>Title<input className="input" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required placeholder="Give your update a title" /></label>
                <div><span className="composer-label">Content</span><RichTextEditor value={contentHtml} onChange={setContentHtml} disabled={working} onFiles={addFiles} /></div>
                <label className="announcement-file-picker" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); addFiles([...event.dataTransfer.files]); }}>Add, drop, or paste images and PDFs
                    <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => {
                        addFiles([...event.target.files]);
                        event.target.value = '';
                    }} />
                </label>
                <div className="announcement-file-previews">
                    {!files.length && <div className="announcement-preview-empty">Image previews will appear here</div>}
                    {files.map((file, index) => <div className="announcement-file-preview" key={`${file.name}-${index}`}>
                        <SelectedFile file={file} /><div><span>{file.name}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => remove(file)}>Remove</button></div>
                    </div>)}
                </div>
            </fieldset>
            <div className="modal-footer">
                <Button type="button" variant="secondary" disabled={working} onClick={event => {
                    if (event.currentTarget.form.reportValidity()) save(event, false);
                }}>Save draft</Button>
                <Button type="submit" loading={working}>Publish</Button>
            </div>
        </form>
    </Dialog>;
}
