import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    api,
    clearToken,
    ERROR_TYPES,
    normaliseError,
} from './api.js';

describe('API request lifecycle', () => {
    beforeEach(() => {
        clearToken();
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('normalizes caller cancellation separately from network failures', () => {
        expect(normaliseError(new DOMException('Stopped', 'AbortError'))).toMatchObject({
            type: ERROR_TYPES.CANCELLED,
            status: 0,
        });
    });

    it('aborts and labels requests that exceed their configured timeout', async () => {
        vi.useFakeTimers();
        fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        }));

        const request = api.get('/slow-resource', { timeoutMs: 25 });
        const assertion = expect(request).rejects.toMatchObject({
            type: ERROR_TYPES.TIMEOUT,
            status: 0,
        });
        await vi.advanceTimersByTimeAsync(25);
        await assertion;
    });

    it('honors an external abort signal for obsolete requests', async () => {
        const controller = new AbortController();
        fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        }));

        const request = api.get('/old-club-context', { signal: controller.signal });
        controller.abort(new DOMException('Obsolete', 'AbortError'));
        await expect(request).rejects.toMatchObject({ type: ERROR_TYPES.CANCELLED });
    });

    it('cleans up timeout handling after a successful JSON response', async () => {
        fetch.mockResolvedValue(new Response(JSON.stringify({ value: 42 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        await expect(api.get('/fast-resource', { timeoutMs: 5 })).resolves.toEqual({ value: 42 });
    });
});
