export const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export function resolveAssetUrl(value) {
    if (!value || /^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) return value;
    if (!value.startsWith('/')) return value;
    if (!import.meta.env.VITE_API_URL) return value;
    try {
        return new URL(value, new URL(API_BASE, window.location.origin).origin).toString();
    } catch {
        return value;
    }
}

if (!import.meta.env.VITE_API_URL) {
    console.warn('[api] VITE_API_URL is not set; using fallback to /api/v1 for local proxying.');
}

// ─── Token helpers ─────────────────────────────────────────────────────────────

const browserStorage = typeof localStorage !== 'undefined'
    && typeof localStorage.getItem === 'function' ? localStorage : null;
let accessToken = browserStorage?.getItem('cm_token') ?? null;

export const getToken = () => accessToken;
export const setToken = (token) => {
    accessToken = token || null;
    browserStorage?.removeItem('cm_token');
};
export const clearToken = () => {
    accessToken = null;
    browserStorage?.removeItem('cm_token');
};

function cookieValue(name) {
    if (typeof document === 'undefined') return null;
    const prefix = `${encodeURIComponent(name)}=`;
    const entry = document.cookie.split('; ').find(value => value.startsWith(prefix));
    return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}

export const API_TIMEOUT_MS = 15_000;

function createRequestAbort(externalSignal, timeoutMs = API_TIMEOUT_MS) {
    const controller = new AbortController();
    let timedOut = false;
    let timeoutId = null;

    const abortFromCaller = () => controller.abort(
        externalSignal.reason || new DOMException('Request cancelled.', 'AbortError')
    );
    if (externalSignal?.aborted) abortFromCaller();
    else externalSignal?.addEventListener('abort', abortFromCaller, { once: true });

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort(new DOMException('Request timed out.', 'TimeoutError'));
        }, timeoutMs);
    }

    return {
        signal: controller.signal,
        didTimeout: () => timedOut,
        cleanup: () => {
            if (timeoutId !== null) clearTimeout(timeoutId);
            externalSignal?.removeEventListener('abort', abortFromCaller);
        },
    };
}

async function requestSessionRefresh() {
    const requestAbort = createRequestAbort();
    try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': cookieValue('cm_csrf') || '',
            },
            body: '{}',
            signal: requestAbort.signal,
        });
        if (!response.ok) throw new Error('Session refresh failed.');
        const data = await response.json();
        setToken(data.accessToken);
        return data;
    } catch (error) {
        if (requestAbort.didTimeout()) {
            throw normaliseError({ name: 'TimeoutError', message: 'Session refresh timed out.' });
        }
        throw error;
    } finally {
        requestAbort.cleanup();
    }
}

let refreshPromise = null;

export async function refreshAccessToken() {
    if (!refreshPromise) {
        refreshPromise = requestSessionRefresh().finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
}

// ─── Error normalisation ───────────────────────────────────────────────────────
//
// All errors thrown by api() conform to this shape, regardless of origin:
//
//   {
//     message:  string,          — human-readable summary, safe to show in UI
//     status:   number,          — HTTP status code (0 = network failure)
//     errors:   array | null,    — Zod field errors [{ field, message }] or null
//     type:     string,          — machine-readable category (see ERROR_TYPES)
//   }
//
// Consumers should check `type` for programmatic branching, `message` for display.

export const ERROR_TYPES = {
    NETWORK:     'network',      // fetch() threw — offline, DNS failure, CORS etc.
    TIMEOUT:     'timeout',      // request exceeded the timeout limit
    CANCELLED:   'cancelled',    // caller intentionally aborted an obsolete request
    AUTH:        'auth',         // 401 — session expired or token invalid
    FORBIDDEN:   'forbidden',    // 403 — authenticated but not allowed
    NOT_FOUND:   'not_found',    // 404
    CONFLICT:    'conflict',     // 409 — duplicate record
    VALIDATION:  'validation',   // 400 with Zod field errors
    SERVER:      'server',       // 500+
    UNKNOWN:     'unknown',      // anything else
};

/**
 * Builds a normalised error object from any thrown value.
 * Accepts raw HTTP responses, fetch errors, or plain objects.
 *
 * @param {any}    raw    - The raw error (Response body, fetch error, etc.)
 * @param {number} status - HTTP status code
 * @returns {{ message, status, errors, type }}
 */
export function normaliseError(raw, status = 0) {
    if (raw?.name === 'TimeoutError') {
        return {
            message: raw.message || 'The request took too long. Please try again.',
            status: 0,
            errors: null,
            type: ERROR_TYPES.TIMEOUT,
        };
    }
    if (raw?.name === 'AbortError') {
        return {
            message: 'The request was cancelled.',
            status: 0,
            errors: null,
            type: ERROR_TYPES.CANCELLED,
        };
    }
    // Network-level failure (fetch threw before a response arrived)
    if (raw instanceof TypeError) {
        return {
            message: 'Unable to reach the server. Check your connection.',
            status:  0,
            errors:  null,
            type:    ERROR_TYPES.NETWORK,
        };
    }

    // Already normalised (re-thrown from somewhere else)
    if (raw?.type && Object.values(ERROR_TYPES).includes(raw.type)) {
        return raw;
    }

    const resolvedStatus = status || raw?.status || 0;
    const message = raw?.error || raw?.message || 'Something went wrong.';
    const errors  = raw?.errors || null;

    let type;
    switch (resolvedStatus) {
        case 400: type = errors ? ERROR_TYPES.VALIDATION : ERROR_TYPES.UNKNOWN; break;
        case 401: type = ERROR_TYPES.AUTH;       break;
        case 403: type = ERROR_TYPES.FORBIDDEN;  break;
        case 404: type = ERROR_TYPES.NOT_FOUND;  break;
        case 409: type = ERROR_TYPES.CONFLICT;   break;
        default:
            type = resolvedStatus >= 500 ? ERROR_TYPES.SERVER : ERROR_TYPES.UNKNOWN;
    }

    return {
        message,
        status: resolvedStatus,
        errors,
        type,
        code: raw?.code || null,
        eligibleAt: raw?.eligibleAt || null,
    };
}

// ─── Core fetch wrapper ────────────────────────────────────────────────────────

/**
 * Wraps fetch with:
 *  - Automatic base URL prefixing
 *  - JSON Content-Type header
 *  - JWT Authorization header (if token exists)
 *  - Normalised error shape via normaliseError()
 *  - 401 auto-logout: clears token and dispatches 'auth:logout'
 *    which AuthLogoutListener in App.jsx picks up for session teardown
 *
 * @param {string}      endpoint - Path relative to API_BASE e.g. '/clubs/mine'
 * @param {RequestInit} options  - Standard fetch options
 * @returns {Promise<any>}       - Parsed JSON response body
 * @throws {{ message, status, errors, type }}
 */
export async function api(endpoint, options = {}) {
    const {
        timeoutMs = API_TIMEOUT_MS,
        signal: externalSignal,
        _authRetried = false,
        ...fetchOptions
    } = options;
    const token = getToken();
    const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;

    const headers = {
        ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookieValue('cm_csrf') && !['GET', 'HEAD'].includes(fetchOptions.method || 'GET')
            ? { 'x-csrf-token': cookieValue('cm_csrf') } : {}),
        ...fetchOptions.headers,
    };

    let res;
    let body;
    const requestAbort = createRequestAbort(externalSignal, timeoutMs);
    try {
        res = await fetch(`${API_BASE}${endpoint}`, {
            ...fetchOptions,
            headers,
            credentials: fetchOptions.credentials || 'include',
            signal: requestAbort.signal,
        });
        if (res.status !== 204) {
            try {
                body = await res.json();
            } catch {
                throw normaliseError({ message: 'Server returned an invalid response.' }, res.status);
            }
        }
    } catch (err) {
        if (requestAbort.didTimeout()) {
            throw normaliseError({
                name: 'TimeoutError',
                message: 'The request took too long. Please try again.',
            });
        }
        throw normaliseError(err, 0);
    } finally {
        requestAbort.cleanup();
    }

    // No-content responses (204 DELETE etc.)
    if (res.status === 204) return null;

    if (res.status === 401 && !endpoint.startsWith('/auth/') && !_authRetried) {
        if (externalSignal?.aborted) throw normaliseError(externalSignal.reason || { name: 'AbortError' });
        try {
            await refreshAccessToken();
            return api(endpoint, { ...options, _authRetried: true });
        } catch {
            clearToken();
            window.dispatchEvent(new Event('auth:logout'));
        }
    }

    if (!res.ok) {
        if (res.status === 401) {
            clearToken();
            window.dispatchEvent(new Event('auth:logout'));
        }
        throw normaliseError(body, res.status);
    }

    return body;
}

// ─── Convenience methods ───────────────────────────────────────────────────────

api.get = (endpoint, options = {}) =>
    api(endpoint, { ...options, method: 'GET' });

api.post = (endpoint, body, options = {}) =>
    api(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });

api.patch = (endpoint, body, options = {}) =>
    api(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) });

api.delete = (endpoint, payloadOrOptions = {}, options = {}) => {
    let opts = options;
    const requestOptionKeys = ['body', 'headers', 'signal', 'timeoutMs', 'credentials'];
    if (payloadOrOptions && requestOptionKeys.some(key => Object.hasOwn(payloadOrOptions, key))) {
        opts = { ...payloadOrOptions, ...options };
    } else if (payloadOrOptions && Object.keys(payloadOrOptions).length > 0) {
        opts = { body: JSON.stringify(payloadOrOptions), ...options };
    }
    return api(endpoint, { ...opts, method: 'DELETE' });
};

// ─── Error helpers ─────────────────────────────────────────────────────────────

/** Returns true if the error is a specific type */
export const isAuthError       = (e) => e?.type === ERROR_TYPES.AUTH;
export const isValidationError = (e) => e?.type === ERROR_TYPES.VALIDATION;
export const isNotFoundError   = (e) => e?.type === ERROR_TYPES.NOT_FOUND;
export const isConflictError   = (e) => e?.type === ERROR_TYPES.CONFLICT;
export const isNetworkError    = (e) => e?.type === ERROR_TYPES.NETWORK;
export const isServerError     = (e) => e?.type === ERROR_TYPES.SERVER;
export const isCancelledError  = (e) => e?.type === ERROR_TYPES.CANCELLED;
export const isTimeoutError    = (e) => e?.type === ERROR_TYPES.TIMEOUT;

/**
 * Extracts per-field error messages from a validation error.
 * Returns a flat { fieldName: 'message' } map for form libraries.
 *
 * Usage:
 *   } catch (err) {
 *     if (isValidationError(err)) setFieldErrors(getFieldErrors(err));
 *   }
 */
export function getFieldErrors(err) {
    if (!isValidationError(err) || !err.errors) return {};
    return err.errors.reduce((acc, { field, message }) => {
        acc[field] = message;
        return acc;
    }, {});
}

// ─── Resource URL builders ─────────────────────────────────────────────────────

export const endpoints = {
    auth: {
        register: ()      => '/auth/register',
        login:    ()      => '/auth/login',
        me:       ()      => '/auth/me',
        password: ()      => '/auth/password',
        refresh: ()       => '/auth/refresh',
        logout: ()        => '/auth/logout',
        logoutAll: ()     => '/auth/logout-all',
        verify: ()        => '/auth/verify-email',
        resend: ()        => '/auth/resend-verification',
        forgotPassword: () => '/auth/forgot-password',
        resetPassword: () => '/auth/reset-password',
        account: ()       => '/auth/account',
        googleStart: continuation => `/auth/google/start?continuation=${encodeURIComponent(continuation || '/dashboard')}`,
    },
    notifications: {
        list: () => '/notifications',
        unreadCount: () => '/notifications/unread-count',
        markRead: notificationId => `/notifications/${notificationId}/read`,
        markAllRead: () => '/notifications/read',
    },
    announcements: {
        list: clubId => `/clubs/${clubId}/announcements`,
        byId: (clubId, announcementId) => `/clubs/${clubId}/announcements/${announcementId}`,
        publish: (clubId, announcementId) => `/clubs/${clubId}/announcements/${announcementId}/publish`,
        archive: (clubId, announcementId) => `/clubs/${clubId}/announcements/${announcementId}/archive`,
        attachments: (clubId, announcementId) => `/clubs/${clubId}/announcements/${announcementId}/attachments`,
        attachment: (clubId, announcementId, attachmentId) => `/clubs/${clubId}/announcements/${announcementId}/attachments/${attachmentId}`,
    },
    exports: {
        players: clubId => `/clubs/${clubId}/exports/players.csv`,
        matches: clubId => `/clubs/${clubId}/exports/matches.csv`,
        ratings: clubId => `/clubs/${clubId}/exports/ratings.csv`,
    },
    clubs: {
        // Same URL as create() (GET vs POST /clubs) but named separately so
        // callers reach for the right verb's intent — mixing the two up is
        // exactly how FindClubsPage.jsx ended up calling create() + '?all=1'
        // for what was really a listing request.
        list:        ()                  => '/clubs',
        mine:        ()                  => '/clubs/mine',
        context:     (clubId)            => `/clubs/${clubId}/context`,
        create:      ()                  => '/clubs',
        byId:        (clubId)            => `/clubs/${clubId}`,
        members:     (clubId)            => `/clubs/${clubId}/members`,
        member:      (clubId, userId)    => `/clubs/${clubId}/members/${userId}`,
        memberRole:  (clubId, userId)    => `/clubs/${clubId}/members/${userId}/role`,
        ownership:   (clubId)            => `/clubs/${clubId}/ownership`,
        archive:     (clubId)            => `/clubs/${clubId}/archive`,
        restore:     (clubId)            => `/clubs/${clubId}/restore`,
        badge:       (clubId)            => `/clubs/${clubId}/badge`,
        leave:       (clubId)            => `/clubs/${clubId}/leave`,
        join:        (clubId)            => `/clubs/${clubId}/join`,
        joinCode:    (clubId)            => `/clubs/${clubId}/join-code`,
        rotateJoinCode: (clubId)         => `/clubs/${clubId}/join-code/rotate`,
        invites:     (clubId)            => `/clubs/${clubId}/invites`,
        invite:      (clubId, inviteId)  => `/clubs/${clubId}/invites/${inviteId}`,
        joinRequests: (clubId)            => `/clubs/${clubId}/join-requests`,
        joinRequest:  (clubId, requestId, action) => `/clubs/${clubId}/join-requests/${requestId}/${action}`,
        joinByToken: ()                  => '/clubs/join-by-token',
        joinByCode:  ()                  => '/clubs/join-by-code',
    },
    players: {
        list:          (clubId)            => `/clubs/${clubId}/players`,
        bulk:          (clubId)            => `/clubs/${clubId}/players/bulk`,
        inactive:      (clubId)            => `/clubs/${clubId}/players/inactive`,
        byId:          (clubId, playerId)  => `/clubs/${clubId}/players/${playerId}`,
        profile:       (clubId, playerId)  => `/clubs/${clubId}/players/${playerId}/profile`,
        archive:       (clubId, playerId)  => `/clubs/${clubId}/players/${playerId}/archive`,
        restore:       (clubId, playerId)  => `/clubs/${clubId}/players/${playerId}/restore`,
        claim:         (clubId, playerId)  => `/clubs/${clubId}/players/${playerId}/claim`,
        photo:         (clubId, playerId)  => `/clubs/${clubId}/players/${playerId}/photo`,
        unlink:        (clubId, playerId)  => `/clubs/${clubId}/players/${playerId}/unlink`,
        matches:       (clubId, playerId)  => `/clubs/${clubId}/players/${playerId}/matches`,
        headToHead:    (clubId, aId, bId)  => `/clubs/${clubId}/players/${aId}/vs/${bId}`,
        ratingHistory: (clubId, playerId)  => `/clubs/${clubId}/players/${playerId}/rating-history`,
        statistics:    (clubId, playerId)  => `/clubs/${clubId}/players/${playerId}/statistics`,
        headToHeadSummary: (clubId, aId, bId) => `/clubs/${clubId}/players/${aId}/vs/${bId}/summary`,
    },
    links: {
        pending: (clubId)         => `/clubs/${clubId}/player-links/pending`,
        approve: (clubId, linkId) => `/clubs/${clubId}/player-links/${linkId}/approve`,
        reject:  (clubId, linkId) => `/clubs/${clubId}/player-links/${linkId}/reject`,
    },
    matches: {
        list: (clubId)           => `/clubs/${clubId}/matches`,
        byId: (clubId, matchId)  => `/clubs/${clubId}/matches/${matchId}`,
        void: (clubId, matchId)  => `/clubs/${clubId}/matches/${matchId}/void`,
    },
    tournaments: {
        list:      (clubId)                        => `/clubs/${clubId}/tournaments`,
        byId:      (clubId, tournamentId)          => `/clubs/${clubId}/tournaments/${tournamentId}`,
        status:    (clubId, tournamentId)          => `/clubs/${clubId}/tournaments/${tournamentId}/status`,
        standings: (clubId, tournamentId)          => `/clubs/${clubId}/tournaments/${tournamentId}/standings`,
        players:   (clubId, tournamentId)          => `/clubs/${clubId}/tournaments/${tournamentId}/players`,
        player:    (clubId, tournamentId, playerId)=> `/clubs/${clubId}/tournaments/${tournamentId}/players/${playerId}`,
        withdraw:  (clubId, tournamentId, playerId)=> `/clubs/${clubId}/tournaments/${tournamentId}/players/${playerId}/withdraw`,
        rounds:    (clubId, tournamentId)          => `/clubs/${clubId}/tournaments/${tournamentId}/rounds`,
        result:    (clubId, tournamentId, pairingId) => `/clubs/${clubId}/tournaments/${tournamentId}/pairings/${pairingId}/result`,
    },
    leaderboard: {
        list:       (clubId)           => `/clubs/${clubId}/leaderboard`,
        stats:      (clubId)           => `/clubs/${clubId}/leaderboard/stats`,
        // Full dashboard payload: summary counters, games-by-time-control,
        // top players, recent matches, pending admin-action counts.
        dashboard:  (clubId)           => `/clubs/${clubId}/leaderboard/dashboard`,
        headToHead: (clubId, aId, bId) => `/clubs/${clubId}/leaderboard/players/${aId}/vs/${bId}/summary`,
    },
    public: {
        leaderboard: (clubId)          => `/public/clubs/${clubId}/leaderboard`,
        tournament:  (clubId, tId)     => `/public/clubs/${clubId}/tournaments/${tId}`,
        player:      (clubId, playerId)=> `/public/clubs/${clubId}/players/${playerId}`,
    },
};

api.upload = (endpoint, formData, options = {}) =>
    api(endpoint, { ...options, method: 'POST', body: formData });
