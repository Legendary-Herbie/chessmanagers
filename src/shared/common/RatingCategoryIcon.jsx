import React from 'react';
import './ratingCategoryIcon.css';

export default function RatingCategoryIcon({ category }) {
    if (!['blitz', 'rapid', 'classical'].includes(category)) return null;
    if (category === 'classical') return <span className="rating-category-icon rating-category-icon--classical" aria-hidden="true" />;
    return <svg className={`rating-category-icon rating-category-icon--${category}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {category === 'blitz' ? <path fill="currentColor" d="M9 2h10l-5 8h6L8 23l3-10H5z" /> : <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2h4M12 2v3M18 6l2-2M12 9v5" />
            <circle cx="12" cy="14" r="8" />
        </g>}
    </svg>;
}
