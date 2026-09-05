import { describe, expect, it } from 'vitest';
import { websiteUrl } from './websiteUrl.js';

describe('public website URLs', () => {
    it('normalizes legacy bare domains while preserving HTTP(S) destinations', () => {
        expect(websiteUrl(' example.com/club ')).toBe('https://example.com/club');
        expect(websiteUrl('http://example.com')).toBe('http://example.com/');
        expect(websiteUrl('https://example.com')).toBe('https://example.com/');
    });
    it.each(['javascript:alert(1)', 'data:text/html,test', 'ftp://example.com', '/club', '//example.com', 'https://user:pass@example.com', 'bad url'])('rejects unsafe destination %s', value => {
        expect(websiteUrl(value)).toBeNull();
    });
});
