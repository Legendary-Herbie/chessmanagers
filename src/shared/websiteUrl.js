// Older club records may predate validation requiring an explicit HTTP(S) scheme.
export function websiteUrl(value) {
    if (typeof value !== 'string') return null;
    const input = value.trim();
    if (!input || /[\s\\]/.test(input) || input.startsWith('/')) return null;
    try {
        const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
            ? url.href : null;
    } catch {
        return null;
    }
}
