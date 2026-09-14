import React, { useCallback, useEffect, useRef, useState } from 'react';
import { playerApi } from '../api/playerApi.js';
import Dialog from '../../../shared/common/Dialog.jsx';
import Button from '../../../shared/common/Button.jsx';
import './selfRegistrationPanel.css';

export default function SelfRegistrationPanel({ clubId, userId, linkedPlayer, isAdmin, onChanged }) {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const [review, setReview] = useState(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const saving = useRef(false);
    const sequence = useRef(0);
    const [form, setForm] = useState({ name: '', bio: '', federationId: '' });
    const load = useCallback(async signal => {
        const request = ++sequence.current;
        setLoading(true);
        try {
            const rows = await playerApi.fetchRegistrations(clubId, { signal });
            if (!signal?.aborted && request === sequence.current) { setRequests(rows); setError(''); }
        } catch (failure) {
            if (!signal?.aborted && request === sequence.current) setError(failure.message || 'Unable to load self-registrations.');
        } finally { if (!signal?.aborted && request === sequence.current) setLoading(false); }
    }, [clubId]);
    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);
    const own = requests.find(row => row.user_id === userId);
    const pending = requests.filter(row => row.status === 'pending');

    async function submit(event) {
        event.preventDefault();
        if (saving.current) return;
        saving.current = true;
        setBusy(true); setError('');
        try {
            await playerApi.registerSelf(clubId, { name: form.name.trim(), bio: form.bio.trim() || null, federationId: form.federationId.trim() || null });
            setFormOpen(false);
            await load();
        } catch (failure) { setError(failure.message || 'Unable to submit self-registration.'); }
        finally { saving.current = false; setBusy(false); }
    }
    async function decide(event) {
        event.preventDefault();
        if (saving.current) return;
        saving.current = true;
        setBusy(true); setError('');
        try {
            await playerApi.reviewRegistration(clubId, review.request.id, { decision: review.decision, reason: reason.trim() || null });
            setReview(null);
            await load();
            await onChanged?.();
        } catch (failure) { setError(failure.message || 'Unable to review self-registration.'); }
        finally { saving.current = false; setBusy(false); }
    }
    if (linkedPlayer && !loading && !error && (!isAdmin || !pending.length)) return null;
    return <section className="queue-card self-registration-panel" aria-label="Player self-registration">
        <h2>Player self-registration</h2>
        {loading && <p role="status">Loading registrations…</p>}
        {error && !formOpen && !review && <p role="alert">{error} <Button variant="secondary" onClick={() => load()}>Retry</Button></p>}
        {!linkedPlayer && own?.status === 'pending' && <p>Your profile “{own.name}” is awaiting admin approval.</p>}
        {!linkedPlayer && !loading && !error && own?.status !== 'pending' && <>
            <p>Register your own player profile. If you already appear in the roster, claim that profile instead. Club starting ratings apply after approval.</p>
            <Button onClick={() => { setFormOpen(true); setError(''); }}>Register myself</Button>
        </>}
        {isAdmin && pending.length > 0 && <div>
            <h3>Self-registrations awaiting approval ({pending.length})</h3>
            {pending.map(request => <div className="queue-item" key={request.id}>
                <div><strong>{request.name}</strong><p>Requested by {request.applicant_name}</p>{request.bio && <p>{request.bio}</p>}{request.federation_id && <p>Federation ID: {request.federation_id}</p>}</div>
                <div className="queue-actions">{['approved', 'rejected'].map(decision => <Button key={decision} disabled={busy} variant={decision === 'approved' ? 'primary' : 'secondary'} onClick={() => { setReview({ request, decision }); setReason(''); setError(''); }}>{decision === 'approved' ? 'Approve registration' : 'Reject registration'}</Button>)}</div>
            </div>)}
        </div>}
        {formOpen && <Dialog title="Register my player profile" busy={busy} onClose={() => setFormOpen(false)}>
            <form className="modal-body" onSubmit={submit}>
                {error && <p role="alert">{error}</p>}
                <p>This request will create a profile for your account only, after club approval. You can upload a photo after approval.</p>
                <label>Your player name<input className="input" required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} disabled={busy} /></label>
                <label>About you<textarea className="input" maxLength={500} value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} disabled={busy} /></label>
                <label>Federation ID (optional)<input className="input" maxLength={100} value={form.federationId} onChange={e => setForm({ ...form, federationId: e.target.value })} disabled={busy} /></label>
                <Button type="submit" disabled={busy || !form.name.trim()}>Submit for approval</Button>
            </form>
        </Dialog>}
        {review && <Dialog title={review.decision === 'approved' ? 'Approve self-registration?' : 'Reject self-registration?'} busy={busy} onClose={() => setReview(null)}>
            <form className="modal-body" onSubmit={decide}>
                {error && <p role="alert">{error}</p>}
                <p>{review.decision === 'approved' ? `Create ${review.request.name} using club starting ratings and link it to the requester?` : `Reject ${review.request.name}’s request? No player will be created.`}</p>
                <label>Review note (optional)<textarea className="input" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} /></label>
                <Button type="submit" disabled={busy}>Confirm {review.decision === 'approved' ? 'approval' : 'rejection'}</Button>
            </form>
        </Dialog>}
    </section>;
}
