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
        return <div>Loading pending claim requests...</div>;
    }

    if (error) {
        return <div className="error-box" role="alert">{error}</div>;
    }

    if (!pendingLinks || pendingLinks.length === 0) {
        return null;
    }

    return (
        <div className="pending-banner queue-card">
            {actionError && <div className="error-box" role="alert" >{actionError}</div>}
            <div className="pending-banner__info">
                <span className="pending-badge">{pendingLinks.length}</span>
                <div>
                    <strong>
                        Pending Account Claim Requests
                    </strong>
                    <span>
                        Members requesting to link their login to player profiles.
                    </span>
                </div>
            </div>

            <div>
                {pendingLinks.map((link) => (
                    <div
                        key={link.id} className="queue-item"

                    >
                        <div>
                            <strong>{link.player_name}</strong>
                            <div>
                                Requested by: {link.user_email}
                            </div>
                        </div>
                        <div className="queue-actions">
                            <button
                                type="button"
                                className="btn-primary btn-sm"

                                disabled={Boolean(actionId)}
                                onClick={() => handleApprove(link.id)}
                            >
                                {actionId === link.id ? '...' : 'Approve'}
                            </button>
                            <button
                                type="button"
                                className="btn-danger btn-sm"
                                disabled={Boolean(actionId)}
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
