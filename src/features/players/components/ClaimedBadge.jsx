import React from 'react';
import './ClaimedBadge.css';

export default function ClaimedBadge({ status }) {
    if (status !== 'approved') return null;
    return <span className="claimed-badge" role="img" aria-label="Claimed" title="Claimed">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="m12 1 3 2 3.6.4.9 3.5L22 10l-1 3.5.2 3.6-3.2 1.7-2 3-3.5-.8-3.5.8-2-3-3.2-1.7.2-3.6L2 10l2.5-3.1.9-3.5L9 3z" />
            <path d="m7.5 12 3 3 6-6" fill="none" stroke="white" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="claimed-badge__tooltip" aria-hidden="true">Claimed</span>
    </span>;
}
