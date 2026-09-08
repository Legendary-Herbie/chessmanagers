import React, { useState } from 'react';
import Button from './Button.jsx';

export default function CopyPublicLink({ path }) {
    const [message, setMessage] = useState('');
    const [failed, setFailed] = useState(false);
    const url = new URL(path, window.location.origin).href;
    async function copy() {
        try {
            await navigator.clipboard.writeText(url);
            setFailed(false);
            setMessage('Public link copied.');
        } catch {
            setFailed(true);
            setMessage('Copy is unavailable. Select and copy the link below.');
        }
    }
    return <div className="copy-public-link">
        <Button variant="secondary" onClick={copy}>Copy public link</Button>
        {message && <p role="status">{message}</p>}
        {failed && <input aria-label="Public link" className="input" readOnly value={url} onFocus={event => event.target.select()} />}
    </div>;
}
