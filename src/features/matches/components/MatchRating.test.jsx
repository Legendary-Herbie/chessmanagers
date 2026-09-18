import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import MatchRating from './MatchRating.jsx';

afterEach(cleanup);
it('shows each player’s historical category rating and signed change', () => {
    const match = { isRated: true, status: 'active', ratingCategory: 'rapid', ratings: {
        status: 'applied', white: { before: 1500, after: 1520, change: 20 }, black: { before: 1600, after: 1584, change: -16 },
    } };
    render(<><MatchRating match={match} color="white" /><MatchRating match={match} color="black" /></>);
    expect(screen.getByLabelText('Rapid Elo rating before game: 1500, change +20')).toBeTruthy();
    expect(screen.getByLabelText('Rapid Elo rating before game: 1600, change -16')).toBeTruthy();
    expect(screen.queryByText('1520')).toBeNull();
    expect(screen.queryByText('1584')).toBeNull();
});
it.each([['pending', 'Rating update pending'], ['unavailable', 'Rating unavailable']])('does not present stale ratings for %s history', (status, text) => {
    render(<MatchRating match={{ isRated: true, status: 'active', ratings: { status, white: { before: 1500, after: 1520, change: 20 } } }} color="white" />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByText('+20')).toBeNull();
});
it('does not show a rating change for unrated or voided games', () => {
    render(<><MatchRating match={{ isRated: false, status: 'active' }} color="white" />
        <MatchRating match={{ isRated: true, status: 'voided' }} color="black" /></>);
    expect(screen.getByText('No rating change')).toBeTruthy();
    expect(screen.getByText('Excluded from ratings')).toBeTruthy();
});
