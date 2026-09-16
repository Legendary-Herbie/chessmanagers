import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary.jsx';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('isolates a broken panel, retries, and resets after navigation', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let broken = true;
    function Panel() { if (broken) throw new Error('Malformed cell'); return <p>Standings ready</p>; }
    const tree = key => <><nav>Navigation remains</nav><ErrorBoundary resetKey={key} message="Unable to display crosstable."><Panel /></ErrorBoundary></>;
    const view = render(tree('first'));
    expect(screen.getByRole('alert').textContent).toContain('Unable to display crosstable.');
    expect(screen.getByText('Navigation remains')).toBeTruthy();
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Standings ready')).toBeTruthy();
    broken = true; view.rerender(tree('first'));
    broken = false; view.rerender(tree('second'));
    expect(screen.getByText('Standings ready')).toBeTruthy();
});
