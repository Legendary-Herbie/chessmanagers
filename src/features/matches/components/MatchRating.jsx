import React from 'react';
import '../../../styles/match-rating.css';

export default function MatchRating({ match, color }) {
    const status = !match.isRated ? 'unrated' : match.status !== 'active' ? 'excluded' : match.ratings?.status;
    const rating = match.ratings?.[color];
    const category = match.ratingCategory ? match.ratingCategory[0].toUpperCase() + match.ratingCategory.slice(1) : '';
    if (status !== 'applied' || !rating) return <span className="match-rating match-rating--muted">{
        status === 'unrated' ? 'No rating change' : status === 'excluded' ? 'Excluded from ratings'
            : status === 'pending' ? 'Rating update pending' : 'Rating unavailable'
    }</span>;
    const change = rating.change > 0 ? `+${rating.change}` : String(rating.change);
    return <span className="match-rating" aria-label={`${category} Elo rating before game: ${rating.before}, change ${change}`}>
        <span>{rating.before}</span>
        <span className={`match-rating__change ${rating.change > 0 ? 'gain' : rating.change < 0 ? 'loss' : 'unchanged'}`}>{change}</span>
    </span>;
}
