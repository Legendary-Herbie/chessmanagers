import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readQueue, setQueueAccount, submitMatch, syncQueue } from './matchQueue.js';
import { matchApi } from '../api/matchApi.js';
vi.mock('../api/matchApi.js', () => ({ matchApi: { create:vi.fn() } }));
const payload = { whitePlayerId:'a', blackPlayerId:'b', result:'white', ratingCategory:'rapid', isRated:true, playedAt:'2026-09-01T10:00:00.000Z' };
beforeEach(() => { const store = new Map(); vi.stubGlobal('localStorage', { get length() { return store.size; }, key:index => [...store.keys()][index], getItem:key => store.get(key) || null, setItem:(key,value) => store.set(key,value), removeItem:key => store.delete(key) }); vi.clearAllMocks(); setQueueAccount('owner'); });
afterEach(() => { setQueueAccount(null); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('retains ten offline games and syncs them with their original submission IDs and chronology', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    for (let index = 0; index < 10; index++) await submitMatch('club_a', { ...payload, playedAt:`2026-09-01T10:${String(index).padStart(2,'0')}:00.000Z` });
    expect(readQueue()).toHaveLength(10); expect(matchApi.create).not.toHaveBeenCalled();
    const ids = readQueue().map(record => record.id);
    online.mockReturnValue(true); matchApi.create.mockResolvedValue({});
    await syncQueue('owner','club_a');
    expect(readQueue()).toHaveLength(0);
    expect(matchApi.create.mock.calls.map(call => call[1].clientRequestId)).toEqual(ids);
});
it('preserves ambiguous network failures for safe replay and pauses duplicate conflicts for review', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    matchApi.create.mockRejectedValueOnce({ type:'network' });
    await submitMatch('club_a', payload);
    const id = matchApi.create.mock.calls[0][1].clientRequestId;
    expect(readQueue()[0].id).toBe(id);
    matchApi.create.mockRejectedValueOnce({ status:409, code:'POSSIBLE_DUPLICATE_MATCH', message:'Review duplicate' });
    await syncQueue('owner','club_a');
    expect(readQueue()[0].error).toBe('Review duplicate');
    await syncQueue('owner','club_a'); expect(matchApi.create).toHaveBeenCalledTimes(2);
});
it('never syncs another account or club and does not queue server validation errors', async () => {
    const online = vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
    await submitMatch('club_a',payload); online.mockReturnValue(true);
    await syncQueue('owner','club_b'); setQueueAccount('other'); await syncQueue('owner','club_a');
    expect(matchApi.create).not.toHaveBeenCalled(); expect(readQueue()).toEqual([]);
    setQueueAccount('owner'); expect(readQueue()).toHaveLength(1);
    matchApi.create.mockRejectedValueOnce({ status:400, message:'Invalid result' });
    await expect(submitMatch('club_a',payload)).rejects.toMatchObject({ status:400 });
    expect(readQueue()).toHaveLength(1);
});
it('does not claim offline saving succeeded when storage is unavailable', async () => {
    vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
    vi.spyOn(localStorage,'setItem').mockImplementation(() => { throw new Error('Storage full'); });
    await expect(submitMatch('club_a',payload)).rejects.toThrow('Storage full');
});
