import Dialog from '../../../shared/common/Dialog.jsx';
import { createPortal } from 'react-dom';
import './shareQr.css';
import React, { useEffect, useRef, useState } from 'react';
import Button from '../../../shared/common/Button.jsx';

export default function ShareControls({ value, label = 'Invite link', qrValue = value }) {
    const generation = useRef({ value: 0 });
    useEffect(() => { const state = generation.current; state.value++; setQr(null); setBusy(false); return () => { state.value++; }; }, [qrValue]);
    const [qr, setQr] = useState(null);
    const [message, setMessage] = useState('');
    const [fallback, setFallback] = useState(false);
    const [busy, setBusy] = useState(false);
    async function copy() {
        try { await navigator.clipboard.writeText(value); setMessage('Copied'); }
        catch { setFallback(true); setMessage('Select and copy below.'); }
    }
    async function downloadQr() {
        const request = generation.current.value;
        setBusy(true);
        try {
            const { default: QRCode } = await import('qrcode');
            const url = await QRCode.toDataURL(qrValue, { width: 1600, margin: 4 });
            if (request === generation.current.value) setQr(url);
        } catch { if (request === generation.current.value) setMessage('Could not create QR code. Try again.'); }
        finally { if (request === generation.current.value) setBusy(false); }
    }
    return <div className="share-controls">
        <div className="queue-actions"><Button variant="secondary" onClick={copy}>Copy {label.toLowerCase()}</Button>
            <Button variant="secondary" disabled={busy} onClick={downloadQr}>{busy ? 'Preparing…' : 'Generate QR code'}</Button></div>
        {qr && <><Dialog title="Club invitation QR code" onClose={() => setQr(null)}><div className="club-qr-preview"><img src={qr} alt="Scan to join the club" /><p>Scan to open the club invitation.</p><a className="btn btn-secondary" href={qr} download="club-invite-qr.png">Download PNG</a><Button onClick={() => window.print()}>Print QR code</Button></div></Dialog>{createPortal(<div className="club-qr-print" aria-hidden="true"><h1>Join our chess club</h1><img src={qr} alt="" /><p>Scan to join</p><p>{qrValue}</p></div>, document.body)}</>}
        {message && <small role="status">{message}</small>}
        {fallback && <input className="input" aria-label={label} readOnly value={value} onFocus={event => event.target.select()} />}
    </div>;
}
