import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useClubQuery } from './useClubQuery.js';
import { invalidateClubQueries, queryClient, setQueryAccount, clearQuerySession } from './queryClient.js';

afterEach(cleanup);
it('deduplicates requests and restores fresh data immediately on a return visit', async () => {
    const load = vi.fn().mockResolvedValue({ name: 'First club' });
    const first = renderHook(() => useClubQuery('one', ['roster'], load));
    const second = renderHook(() => useClubQuery('one', ['roster'], load));
    await waitFor(() => expect(first.result.current.data?.name).toBe('First club'));
    expect(load).toHaveBeenCalledTimes(1);
    first.unmount(); second.unmount();
    const revisit = renderHook(() => useClubQuery('one', ['roster'], load));
    expect(revisit.result.current.data.name).toBe('First club');
    expect(revisit.result.current.isLoading).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
});
it('keeps stale content visible while revalidating and isolates clubs and filters', async () => {
    queryClient.setQueryData(['club', 'one', 'leaderboard', 'rapid'], { name: 'Old' }, { updatedAt: Date.now() - 60_000 });
    let resolve;
    const load = () => new Promise(done => { resolve = done; });
    const view = renderHook(({ club, category }) => useClubQuery(club, ['leaderboard', category], load), {
        initialProps: { club: 'one', category: 'rapid' },
    });
    expect(view.result.current.data.name).toBe('Old');
    expect(view.result.current.isLoading).toBe(false);
    await act(async () => resolve({ name: 'New' }));
    await waitFor(() => expect(view.result.current.data.name).toBe('New'));
    view.rerender({ club: 'two', category: 'rapid' });
    expect(view.result.current.data).toBeUndefined();
    view.rerender({ club: 'one', category: 'blitz' });
    expect(view.result.current.data).toBeUndefined();
});
it('invalidates club views after a mutation and clears private data on account changes', async () => {
    setQueryAccount('alice');
    const load = vi.fn().mockResolvedValueOnce('before').mockResolvedValue('after');
    const view = renderHook(() => useClubQuery('one', ['roster'], load));
    await waitFor(() => expect(view.result.current.data).toBe('before'));
    await act(() => invalidateClubQueries('one'));
    await waitFor(() => expect(view.result.current.data).toBe('after'));
    view.unmount();
    setQueryAccount('alice');
    expect(queryClient.getQueryData(['club', 'one', 'roster'])).toBe('after');
    setQueryAccount('bob');
    expect(queryClient.getQueryData(['club', 'one', 'roster'])).toBeUndefined();
});
it('does not resurrect an old account response after logout', async () => {
    let resolve;
    const pending = queryClient.fetchQuery({ queryKey: ['club', 'one', 'roster'], queryFn: () => new Promise(done => { resolve = done; }) }).catch(() => {});
    clearQuerySession();
    resolve('private');
    await pending;
    expect(queryClient.getQueryData(['club', 'one', 'roster'])).toBeUndefined();
});
it('hides stale records when revalidation reports revoked access', async () => {
    queryClient.setQueryData(['club', 'one', 'roster'], 'private', { updatedAt: Date.now() - 60_000 });
    const view = renderHook(() => useClubQuery('one', ['roster'], () => Promise.reject({ status: 403, message: 'Access revoked' })));
    await waitFor(() => expect(view.result.current.error?.status).toBe(403));
    expect(view.result.current.data).toBeUndefined();
});
