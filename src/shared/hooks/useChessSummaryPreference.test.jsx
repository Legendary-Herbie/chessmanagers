import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthContext } from '../../app/contextHooks.js';
import { useChessSummaryPreference } from './useChessSummaryPreference.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('persists the preference across remounts and isolates accounts', () => {
    const stored = new Map();
    vi.stubGlobal('localStorage', { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) });
    const wrapper = ({ children }) => <AuthContext.Provider value={{ user: { id: 'account-a' } }}>{children}</AuthContext.Provider>;
    const first = renderHook(useChessSummaryPreference, { wrapper });
    expect(first.result.current[0]).toBe(true);
    act(() => first.result.current[1](false));
    first.unmount();
    const second = renderHook(useChessSummaryPreference, { wrapper });
    expect(second.result.current[0]).toBe(false);
    const other = renderHook(useChessSummaryPreference, { wrapper: ({ children }) => <AuthContext.Provider value={{ user: { id: 'account-b' } }}>{children}</AuthContext.Provider> });
    expect(other.result.current[0]).toBe(true);
    act(() => second.result.current[1](true));
    expect(second.result.current[0]).toBe(true);
});
