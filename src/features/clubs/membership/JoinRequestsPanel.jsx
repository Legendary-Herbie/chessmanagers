import React, { useCallback, useEffect, useState } from 'react';
import { clubApi } from '../api/clubApi.js';
import { useNotifications } from '../../../app/contextHooks.js';
import Button from '../../../shared/common/Button.jsx';
import ConfirmDialog from '../../../components/ConfirmDialog.jsx';
import { Link } from 'react-router-dom';

export default function JoinRequestsPanel({ clubId, onQueueChanged }) {
    const { notify } = useNotifications();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState(null);
    const [rejectTarget, setRejectTarget] = useState(null);
    const [rejectReason, setRejectReason] = useState('');

    const loadRequests = useCallback(async ({ showLoading = true } = {}) => {
        if (!clubId) {
            setRequests([]);
            setLoading(false);
            return;
        }
        if (showLoading) setLoading(true);
        setError('');
        try {
            setRequests(await clubApi.fetchJoinRequests(clubId));
        } catch (requestError) {
            setError(requestError.message || 'Unable to load membership requests.');
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [clubId]);

    useEffect(() => {
        void loadRequests();
        const refresh = () => void loadRequests({ showLoading: false });
        const timer = setInterval(refresh, 30_000);
        window.addEventListener('focus', refresh);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', refresh);
        };
    }, [loadRequests]);

    async function approve(request) {
        setBusyId(request.id);
        setError('');
        try {
            await clubApi.approveJoinRequest(clubId, request.id);
            setRequests(current => current.filter(item => item.id !== request.id));
            notify('Join request approved', 'success');
            onQueueChanged?.();
        } catch (requestError) {
            setError(requestError.message || 'Unable to approve the membership request.');
        } finally {
            setBusyId(null);
        }
    }

    async function reject() {
        if (!rejectTarget) return;
        setBusyId(rejectTarget.id);
        setError('');
        try {
            await clubApi.rejectJoinRequest(clubId, rejectTarget.id, rejectReason.trim() || undefined);
            setRequests(current => current.filter(item => item.id !== rejectTarget.id));
            notify('Join request rejected', 'success');
            setRejectTarget(null);
            setRejectReason('');
            onQueueChanged?.();
        } catch (requestError) {
            setError(requestError.message || 'Unable to reject the membership request.');
        } finally {
            setBusyId(null);
        }
    }

    return (
        <section className="invite-section" aria-labelledby="membership-requests-title">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <div>
                    <h2 id="membership-requests-title" style={{ marginBottom: 4 }}>Membership requests</h2>
                    <p className="muted" style={{ marginTop: 0 }}>Approve or reject people waiting to join this club.</p>
                </div>
                {!loading && <strong aria-label={`${requests.length} pending membership requests`}>{requests.length} pending</strong>}
            </div>

            <div className="membership-request-links">
                <Link to="/club?tab=members">Manage invites and member access →</Link>
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
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
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
