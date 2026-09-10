import React, { useState } from 'react';
import Button from '../../../shared/common/Button.jsx';

export default function ShareControls({ value, label = 'Invite link', qrValue = value }) {
    const [message, setMessage] = useState('');
    const [fallback, setFallback] = useState(false);
    const [busy, setBusy] = useState(false);
    async function copy() {
        try { await navigator.clipboard.writeText(value); setMessage('Copied'); }
        catch { setFallback(true); setMessage('Select and copy below.'); }
    }
    async function downloadQr() {
        setBusy(true);
        try {
            const { default: QRCode } = await import('qrcode');
            const url = await QRCode.toDataURL(qrValue, { width: 800, margin: 4 });
            const link = document.createElement('a');
            link.href = url; link.download = 'club-invite-qr.png';
            document.body.appendChild(link); link.click(); link.remove();
            setMessage('QR code downloaded');
        } catch { setMessage('Could not create QR code. Try again.'); }
        finally { setBusy(false); }
    }
    return <div className="share-controls">
        <div className="queue-actions"><Button variant="secondary" onClick={copy}>Copy {label.toLowerCase()}</Button>
            <Button variant="secondary" disabled={busy} onClick={downloadQr}>{busy ? 'Preparing…' : 'Download QR'}</Button></div>
        {message && <small role="status">{message}</small>}
        {fallback && <input className="input" aria-label={label} readOnly value={value} onFocus={event => event.target.select()} />}
    </div>;
}
