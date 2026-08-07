export const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

if (!import.meta.env.VITE_API_URL) {
    console.warn('[api] VITE_API_URL is not set; using fallback to /api/v1 for local proxying.');
}

// ─── Token helpers ─────────────────────────────────────────────────────────────

export const getToken  = ()      => localStorage.getItem('cm_token');
export const setToken  = (token) => localStorage.setItem('cm_token', token);
export const clearToken = ()     => localStorage.removeItem('cm_token');

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

    return { message, status: resolvedStatus, errors, type };
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
    const token = getToken();

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
    };

    let res;
    try {
        res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    } catch (err) {
        // fetch() threw — network failure, CORS, DNS etc.
        throw normaliseError(err, 0);
    }

    // No-content responses (204 DELETE etc.)
    if (res.status === 204) return null;

    let body;
    try {
        body = await res.json();
    } catch {
        throw normaliseError({ message: 'Server returned an invalid response.' }, res.status);
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
    if (payloadOrOptions && (payloadOrOptions.body || payloadOrOptions.headers || payloadOrOptions.signal)) {
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
    },
    clubs: {
        mine:    ()                  => '/clubs/mine',
        create:  ()                  => '/clubs',
        byId:    (clubId)            => `/clubs/${clubId}`,
        members: (clubId)            => `/clubs/${clubId}/members`,
        member:  (clubId, userId)    => `/clubs/${clubId}/members/${userId}`,
    },
    players: {
        list:          (clubId)            => `/clubs/${clubId}/players`,
        bulk:          (clubId)            => `/clubs/${clubId}/players/bulk`,
        byId:          (clubId, playerId)  => `/clubs/${clubId}/players/${playerId}`,
        claim:         (clubId, playerId)  => `/clubs/${clubId}/players/${playerId}/claim`,
        unlink:        (clubId, playerId)  => `/clubs/${clubId}/players/${playerId}/unlink`,
        matches:       (clubId, playerId)  => `/clubs/${clubId}/players/${playerId}/matches`,
        headToHead:    (clubId, aId, bId)  => `/clubs/${clubId}/players/${aId}/vs/${bId}`,
        ratingHistory: (clubId, playerId)  => `/clubs/${clubId}/leaderboard/players/${playerId}/rating-history`,
    },
    links: {
        pending: (clubId)         => `/clubs/${clubId}/player-links/pending`,
        approve: (clubId, linkId) => `/clubs/${clubId}/player-links/${linkId}/approve`,
        reject:  (clubId, linkId) => `/clubs/${clubId}/player-links/${linkId}/reject`,
    },
    matches: {
        list: (clubId)           => `/clubs/${clubId}/matches`,
        byId: (clubId, matchId)  => `/clubs/${clubId}/matches/${matchId}`,
    },
    tournaments: {
        list:      (clubId)                        => `/clubs/${clubId}/tournaments`,
        byId:      (clubId, tournamentId)          => `/clubs/${clubId}/tournaments/${tournamentId}`,
        status:    (clubId, tournamentId)          => `/clubs/${clubId}/tournaments/${tournamentId}/status`,
        standings: (clubId, tournamentId)          => `/clubs/${clubId}/tournaments/${tournamentId}/standings`,
        players:   (clubId, tournamentId)          => `/clubs/${clubId}/tournaments/${tournamentId}/players`,
        player:    (clubId, tournamentId, playerId)=> `/clubs/${clubId}/tournaments/${tournamentId}/players/${playerId}`,
    },
    leaderboard: {
        list:       (clubId)           => `/clubs/${clubId}/leaderboard`,
        stats:      (clubId)           => `/clubs/${clubId}/leaderboard/stats`,
        headToHead: (clubId, aId, bId) => `/clubs/${clubId}/leaderboard/players/${aId}/vs/${bId}/summary`,
    },
    public: {
        leaderboard: (clubId)          => `/public/clubs/${clubId}/leaderboard`,
        tournament:  (clubId, tId)     => `/public/clubs/${clubId}/tournaments/${tId}`,
        player:      (clubId, playerId)=> `/public/clubs/${clubId}/players/${playerId}`,
    },
};