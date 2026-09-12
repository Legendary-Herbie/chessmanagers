import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import ClaimedBadge from './ClaimedBadge.jsx';

afterEach(cleanup);
it('only marks approved claims and provides the Claimed tooltip and accessible name', () => {
    const { rerender } = render(<ClaimedBadge status="approved" />);
    expect(screen.getByRole('img', { name: 'Claimed' }).title).toBe('Claimed');
    for (const status of ['pending', 'rejected', undefined]) {
        rerender(<ClaimedBadge status={status} />);
        expect(screen.queryByRole('img')).toBeNull();
    }
});
