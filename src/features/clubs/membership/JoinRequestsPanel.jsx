import { useVisiblePolling } from '../../../shared/hooks/useVisiblePolling.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { clubApi } from '../api/clubApi.js';
import { useNotifications } from '../../../app/contextHooks.js';
import Button from '../../../shared/common/Button.jsx';
import ConfirmDialog from '../../../components/ConfirmDialog.jsx';
import { Link } from 'react-router-dom';

export default function JoinRequestsPanel({ clubId, onQueueChanged, compact = false }) {
    const { notify } = useNotifications();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState(null);
    const [rejectTarget, setRejectTarget] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const version = useRef(0);
    const mutation = useRef(false);
    useEffect(() => () => { version.current++; }, [clubId]);

    const loadRequests = useCallback(async ({ showLoading = true } = {}) => {
        if (!clubId) {
            setRequests([]);
            setLoading(false);
            return;
        }
        if (mutation.current) return;
        const token = ++version.current;
        if (showLoading) setLoading(true);
        setError('');
        try {
            const rows = await clubApi.fetchJoinRequests(clubId);
            if (token === version.current) setRequests(rows);
        } catch (requestError) {
            if (token === version.current) setError(requestError.message || 'Unable to load membership requests.');
        } finally {
            if (token === version.current) setLoading(false);
        }
    }, [clubId]);

    const refresh = useCallback(() => loadRequests({ showLoading: false }), [loadRequests]);
    useVisiblePolling(refresh, 30_000);

    async function approve(request) {
        if (mutation.current) return;
        mutation.current = true;
        const token = ++version.current;
        const before = requests;
        setRequests(current => current.filter(item => item.id !== request.id));
        setBusyId(request.id);
        setError('');
        try {
            await clubApi.approveJoinRequest(clubId, request.id);
            if (token !== version.current) return;
            notify('Join request approved', 'success');
            onQueueChanged?.();
        } catch (requestError) {
            if (token !== version.current) return;
            setRequests(before);
            setError(requestError.message || 'Unable to approve the membership request.');
        } finally {
            mutation.current = false;
            setBusyId(null);
        }
    }

    async function reject() {
        if (!rejectTarget || mutation.current) return;
        mutation.current = true;
        const token = ++version.current;
        const before = requests;
        setRequests(current => current.filter(item => item.id !== rejectTarget.id));
        setBusyId(rejectTarget.id);
        setError('');
        try {
            await clubApi.rejectJoinRequest(clubId, rejectTarget.id, rejectReason.trim() || undefined);
            if (token !== version.current) return;
            notify('Join request rejected', 'success');
            setRejectTarget(null);
            setRejectReason('');
            onQueueChanged?.();
        } catch (requestError) {
            if (token !== version.current) return;
            setRequests(before);
            setError(requestError.message || 'Unable to reject the membership request.');
        } finally {
            mutation.current = false;
            setBusyId(null);
        }
    }

    if (compact && !loading && !error && requests.length === 0) return <div className="queue-caught-up" role="status">
        <span>All caught up · No pending join requests.</span><Link className="text-link" to="/club?tab=members">Manage members</Link>
    </div>;

    return (
        <section className="invite-section" aria-labelledby="membership-requests-title">
            <div className="queue-heading">
                <div>
                    <h2 id="membership-requests-title">Membership requests</h2>
                    <p className="muted">Approve or reject people waiting to join this club.</p>
                </div>
                {!loading && <strong aria-label={`${requests.length} pending membership requests`}>{requests.length} pending</strong>}
            </div>

            <div className="membership-request-links">
                <Link className="text-link" to="/club?tab=members">Manage invites and member access →</Link>
                <span>Invite people directly or review the club join code.</span>
            </div>

            {error && <div className="error" role="alert">{error}</div>}
            {loading ? (
                <div className="muted">Loading membership requests…</div>
            ) : requests.length === 0 ? (
                <div className="muted">No pending join requests.</div>
            ) : (
                <ul className="invite-list">
                    {requests.map(request => (
                        <li key={request.id} className="invite-item">
                            <div>
                                <strong>{request.name || request.email}</strong>
                                {request.email && request.name ? <div className="muted">{request.email}</div> : null}
                                {request.message ? <div className="muted">{request.message}</div> : null}
                                {request.createdAt ? <div className="muted">Requested {new Date(request.createdAt).toLocaleString()}</div> : null}
                            </div>
                            <div className="queue-actions">
                                <Button onClick={() => approve(request)} disabled={Boolean(busyId)}>
                                    {busyId === request.id ? 'Working…' : 'Approve'}
                                </Button>
                                <Button variant="danger" onClick={() => setRejectTarget(request)} disabled={Boolean(busyId)}>
                                    Reject
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <ConfirmDialog
                isOpen={Boolean(rejectTarget)}
                title="Reject join request"
                message={`Reject the membership request from ${rejectTarget?.name || rejectTarget?.email || 'this person'}?`}
                confirmLabel="Reject request"
                variant="danger"
                loading={Boolean(rejectTarget && busyId === rejectTarget.id)}
                onClose={() => {
                    if (!busyId) {
                        setRejectTarget(null);
                        setRejectReason('');
                    }
                }}
                onConfirm={reject}
            >
                <label className="form-row">
                    <span className="label">Reason (optional)</span>
                    <textarea
                        className="input"
                        maxLength={500}
                        value={rejectReason}
                        onChange={event => setRejectReason(event.target.value)}
                    />
                </label>
            </ConfirmDialog>
        </section>
    );
}
