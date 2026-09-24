const EVENTS = new Set(['account_created', 'email_verified', 'club_created']);

function pathOnly(value) {
    if (typeof value !== 'string' || !value) return '/';
    try {
        return new URL(value, window.location.origin).pathname;
    } catch {
        return '/';
    }
}

function referrerOrigin(value) {
    try {
        return value ? new URL(value).origin : undefined;
    } catch {
        return undefined;
    }
}

export function analyticsBeforeSend(type, payload) {
    if (!payload || (type === 'event' && !EVENTS.has(payload.name))) return false;
    return {
        ...payload,
        url: pathOnly(payload.url),
        referrer: referrerOrigin(payload.referrer),
        data: undefined,
    };
}

export function startAnalytics() {
    const scriptUrl = import.meta.env.VITE_UMAMI_SCRIPT_URL;
    const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID;
    const domain = import.meta.env.VITE_UMAMI_DOMAIN;
    if (!import.meta.env.PROD || !scriptUrl || !websiteId || !domain) return;
    if (window.location.hostname !== domain) return;

    let url;
    try {
        url = new URL(scriptUrl);
    } catch {
        return;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return;

    const script = document.createElement('script');
    script.src = url.href;
    script.defer = true;
    script.dataset.websiteId = websiteId;
    script.dataset.domains = domain;
    script.dataset.excludeSearch = 'true';
    script.dataset.excludeHash = 'true';
    script.dataset.doNotTrack = 'true';
    window.cmAnalyticsBeforeSend = analyticsBeforeSend;
    script.dataset.beforeSend = 'cmAnalyticsBeforeSend';
    document.head.append(script);
}

export function trackEvent(name) {
    if (!EVENTS.has(name)) return;
    window.umami?.track?.(name);
}
