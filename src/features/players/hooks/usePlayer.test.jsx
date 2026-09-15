import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePlayer } from './usePlayer.js';
import { playerApi } from '../api/playerApi.js';
vi.mock('../api/playerApi.js', () => ({ playerApi: {
    fetchPlayer: vi.fn().mockResolvedValue({ id: 'a' }), fetchMatches: vi.fn().mockResolvedValue([]),
    fetchStatistics: vi.fn().mockResolvedValue({}), fetchRatingHistory: vi.fn().mockResolvedValue([]),
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('fetches only history on category changes and reuses cached categories', async () => {
    const { result, rerender } = renderHook(({ category }) => usePlayer('c', 'a', category), { initialProps: { category: 'rapid' } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ category: 'blitz' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ category: 'rapid' });
    expect(playerApi.fetchPlayer).toHaveBeenCalledTimes(1);
    expect(playerApi.fetchMatches).toHaveBeenCalledTimes(1);
    expect(playerApi.fetchRatingHistory).toHaveBeenCalledTimes(2);
    await act(async () => result.current.refetch());
    await waitFor(() => expect(playerApi.fetchRatingHistory).toHaveBeenCalledTimes(3));
});
