import { afterEach, expect, it, vi } from 'vitest';
import { analyticsBeforeSend, startAnalytics, trackEvent } from './analytics.js';

afterEach(() => {
    document.querySelectorAll('script[data-website-id]').forEach(script => script.remove());
    vi.unstubAllEnvs();
    delete window.umami;
    delete window.cmAnalyticsBeforeSend;
});

it('loads analytics only on the configured domain and drops URL query and hash values', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_UMAMI_SCRIPT_URL', 'https://cloud.umami.is/script.js');
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', '11111111-1111-4111-8111-111111111111');
    vi.stubEnv('VITE_UMAMI_DOMAIN', 'production.example.test');
    startAnalytics();
    expect(document.querySelector('script[data-website-id]')).toBeNull();

    vi.stubEnv('VITE_UMAMI_DOMAIN', window.location.hostname);

    startAnalytics();
    const script = document.querySelector('script[data-website-id]');
    expect(script?.src).toBe('https://cloud.umami.is/script.js');
    expect(script?.dataset.excludeSearch).toBe('true');
    expect(script?.dataset.excludeHash).toBe('true');
    expect(script?.dataset.doNotTrack).toBe('true');
    expect(script?.dataset.beforeSend).toBe('cmAnalyticsBeforeSend');
});

it('removes tokens and custom fields from outgoing analytics payloads', () => {
    expect(analyticsBeforeSend('event', {
        name: 'account_created',
        url: '/auth/verify?token=secret#fragment',
        referrer: 'https://mail.example.test/message?access=secret',
        data: { email: 'person@example.test' },
    })).toEqual({
        name: 'account_created',
        url: '/auth/verify',
        referrer: 'https://mail.example.test',
        data: undefined,
    });
    expect(analyticsBeforeSend('event', { name: 'email@example.test' })).toBe(false);
});

it('rejects an unsafe script URL and sends only named milestone events', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_UMAMI_SCRIPT_URL', 'javascript:alert(1)');
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', '11111111-1111-4111-8111-111111111111');
    vi.stubEnv('VITE_UMAMI_DOMAIN', window.location.hostname);
    startAnalytics();
    expect(document.querySelector('script[data-website-id]')).toBeNull();

    window.umami = { track: vi.fn() };
    trackEvent('account_created');
    trackEvent('email_verified');
    trackEvent('club_created');
    trackEvent('email@example.com');
    expect(window.umami.track.mock.calls).toEqual([
        ['account_created'], ['email_verified'], ['club_created'],
    ]);
});
