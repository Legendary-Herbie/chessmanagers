import React from 'react';
import { render, cleanup, screen } from '@testing-library/react';
import { afterEach, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import RatingCategoryIcon from './RatingCategoryIcon.jsx';

afterEach(cleanup);
it.each(['blitz', 'rapid', 'classical'])('renders the %s symbol without changing the accessible label', category => {
    const { container } = render(<button><RatingCategoryIcon category={category} />{category}</button>);
    expect(screen.getByRole('button', { name: category })).toBeTruthy();
    expect(container.querySelector(`.rating-category-icon--${category}`).getAttribute('aria-hidden')).toBe('true');
});
it('ships the supplied classical PNG asset', () => {
    const bytes = readFileSync('public/icons/classical-clock-pawn.png');
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
});
