export const DEFAULT_CONTINUATION = '/dashboard';

export function safeContinuation(value, fallback = DEFAULT_CONTINUATION) {
    if (typeof value !== 'string') return fallback;
    const continuation = value.trim();
    if (!continuation || continuation.length > 1000) return fallback;
    if (!continuation.startsWith('/') || continuation.startsWith('//') || continuation.includes('\\')) {
        return fallback;
    }
    return continuation;
}

export function continuationFromParams(params) {
    const inviteToken = params.get('inviteToken');
    if (inviteToken) return `/clubs/join?token=${encodeURIComponent(inviteToken)}`;

    const joinCode = params.get('joinCode');
    if (joinCode) return `/clubs/join?code=${encodeURIComponent(joinCode)}`;

    return safeContinuation(params.get('returnTo') || params.get('continue'));
}

export function continuationQuery(continuation) {
    const destination = safeContinuation(continuation);
    return destination === DEFAULT_CONTINUATION
        ? ''
        : `?returnTo=${encodeURIComponent(destination)}`;
}
