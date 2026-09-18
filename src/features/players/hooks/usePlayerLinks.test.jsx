import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePlayerLinks } from './usePlayerLinks.js';
import { playerApi } from '../api/playerApi.js';
vi.mock('../api/playerApi.js', () => ({ playerApi: { fetchPendingLinks: vi.fn(), approveLink: vi.fn(), rejectLink: vi.fn() } }));
afterEach(cleanup);
it('removes an approval immediately and restores it after a failed request', async () => {
    const links = [{ id: 'a', player_name: 'Ada' }];
    playerApi.fetchPendingLinks.mockResolvedValue(links);
    let reject;
    playerApi.approveLink.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    const { result } = renderHook(() => usePlayerLinks('club_1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let pending;
    act(() => { pending = result.current.approveLink('a').catch(err => err); });
    expect(result.current.pendingLinks).toEqual([]);
    await act(async () => { reject(new Error('Offline')); await pending; });
    expect(result.current.pendingLinks).toEqual(links);
});
