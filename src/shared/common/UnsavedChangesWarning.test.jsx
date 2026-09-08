import React from 'react';
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { transferableAbortController } from 'node:util';
import UnsavedChangesWarning from './UnsavedChangesWarning.jsx';

// Router navigation constructs Node's Request; its signal must be from the same realm.
beforeEach(() => vi.stubGlobal('AbortController', class {
    constructor() { return transferableAbortController(); }
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('can cancel navigation, protects reload, and proceeds only after discard', async () => {
    const onDiscard = vi.fn();
    const router = createMemoryRouter([{ path: '*', element: <><Link to="/next">Next</Link><UnsavedChangesWarning dirty onDiscard={onDiscard} /></> }]);
    render(<RouterProvider router={router} />);
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
    expect(router.state.location.pathname).toBe('/');
    expect(onDiscard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes and leave' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/next'));
    expect(onDiscard).toHaveBeenCalledOnce();
});

it('blocks browser history navigation too', async () => {
    const router = createMemoryRouter([{ path: '*', element: <UnsavedChangesWarning dirty onDiscard={() => {}} /> }], { initialEntries: ['/previous', '/settings'], initialIndex: 1 });
    render(<RouterProvider router={router} />);
    await router.navigate(-1);
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/settings');
});

it('protects club switching and signing out before their context changes', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onDiscard = vi.fn();
    render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <UnsavedChangesWarning dirty onDiscard={onDiscard} /> }])} />);
    expect(window.dispatchEvent(new Event('app:before-context-change', { cancelable: true }))).toBe(false);
    expect(onDiscard).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    expect(window.dispatchEvent(new Event('app:before-context-change', { cancelable: true }))).toBe(true);
    expect(onDiscard).toHaveBeenCalledOnce();
    confirm.mockRestore();
});
