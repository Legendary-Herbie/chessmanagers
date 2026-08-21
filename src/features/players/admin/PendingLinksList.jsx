import React, { useState } from 'react';
import { usePlayerLinks } from '../hooks/usePlayerLinks.js';

export default function PendingLinksList({ clubId, onActionComplete }) {
    const { pendingLinks, loading, error, approveLink, rejectLink } = usePlayerLinks(clubId);
    const [actionId, setActionId] = useState(null);
    const [actionError, setActionError] = useState(null);

    const handleApprove = async (linkId) => {
        setActionId(linkId);
        setActionError(null);
        try {
            await approveLink(linkId);
            if (onActionComplete) onActionComplete();
        } catch (err) {
            setActionError(err.message || 'This claim could not be approved. Refresh the queue and try again.');
        } finally {
            setActionId(null);
        }
    };

    const handleReject = async (linkId) => {
        setActionId(linkId);
        setActionError(null);
        try {
            await rejectLink(linkId);
            if (onActionComplete) onActionComplete();
        } catch (err) {
            setActionError(err.message || 'This claim could not be rejected. Refresh the queue and try again.');
        } finally {
            setActionId(null);
        }
    };

    if (loading) {
        return <div style={{ padding: '16px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Loading pending claim requests...</div>;
    }

    if (error) {
        return <div className="error-box">{error}</div>;
    }

    if (!pendingLinks || pendingLinks.length === 0) {
        return null;
    }

    return (
        <div className="pending-banner">
            {actionError && <div className="error-box" style={{ width: '100%' }}>{actionError}</div>}
            <div className="pending-banner__info">
                <span className="pending-badge">{pendingLinks.length}</span>
                <div>
                    <strong style={{ color: 'var(--text-strong)', display: 'block', fontSize: '0.95rem' }}>
                        Pending Account Claim Requests
                    </strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        Members requesting to link their login to player profiles.
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '420px' }}>
                {pendingLinks.map((link) => (
                    <div
                        key={link.id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: 'var(--bg-surface)',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                        }}
                    >
                        <div style={{ fontSize: '0.85rem' }}>
                            <strong style={{ color: 'var(--text-strong)' }}>{link.player_name}</strong>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                Requested by: {link.user_email}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                                type="button"
                                className="btn-primary btn-sm"
                                style={{ backgroundColor: 'var(--accent)' }}
                                disabled={actionId === link.id}
                                onClick={() => handleApprove(link.id)}
                            >
                                {actionId === link.id ? '...' : 'Approve'}
                            </button>
                            <button
                                type="button"
                                className="btn-danger btn-sm"
                                disabled={actionId === link.id}
                                onClick={() => handleReject(link.id)}
                            >
                                {actionId === link.id ? '...' : 'Reject'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
