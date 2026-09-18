import React from 'react';
import './skeletonCards.css';
export default function SkeletonCards({ label, kind = 'roster', count = 3 }) {
    return <div role="status" aria-label={label} className={`skeleton-cards skeleton-cards--${kind}`}>
        {Array.from({ length: count }, (_, index) => <div className="skeleton-card" aria-hidden="true" key={index}>
            <div className="skeleton-line skeleton-heading" />{kind === 'feed' && <div className="skeleton-image" />}<div className="skeleton-line" /><div className="skeleton-line skeleton-short" />
        </div>)}
    </div>;
}
