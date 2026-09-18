import { Blob } from 'node:buffer';
import { unzipSync, strFromU8 } from 'fflate';
import { afterEach, expect, it, vi } from 'vitest';
import { exportApi } from './exportApi.js';

vi.mock('../../../config/api.js', () => ({
    API_BASE: '/api', getToken: () => 'token', refreshAccessToken: vi.fn(),
    normaliseError: body => new Error(body.message),
    endpoints: { exports: {
        players: id => `/clubs/${id}/players.csv`,
        matches: id => `/clubs/${id}/matches.csv`,
        ratings: id => `/clubs/${id}/ratings.csv`,
    } },
}));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('bundles three complete club-scoped CSVs into one ZIP download', async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:export');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    vi.stubGlobal('Blob', Blob);
    const encoder = new TextEncoder();
    vi.stubGlobal('fetch', vi.fn(async url => ({ ok: true, arrayBuffer: async () => encoder.encode(url).buffer })));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await exportApi.downloadPackage('club_1');
    expect(click).toHaveBeenCalledOnce();
    const archive = unzipSync(new Uint8Array(await createObjectURL.mock.calls[0][0].arrayBuffer()));
    expect(Object.keys(archive)).toEqual(['players.csv', 'matches.csv', 'ratings.csv']);
    expect(strFromU8(archive['players.csv'])).toBe('/api/clubs/club_1/players.csv?includeInactive=true');
    expect(strFromU8(archive['matches.csv'])).toBe('/api/clubs/club_1/matches.csv');
    expect(strFromU8(archive['ratings.csv'])).toBe('/api/clubs/club_1/ratings.csv?includeInactive=true');
    vi.runAllTimers();
});
