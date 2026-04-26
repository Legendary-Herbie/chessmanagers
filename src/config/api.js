export const API_BASE = import.meta.env.VITE_API_URL;

if (!API_BASE) {
    console.error('[api] VITE_API_URL is not set. Add it to your .env file.');
}

// ─── Token helpers ─────────────────────────────────────────────────────────────

export const getToken = () => localStorage.getItem('cm_token');
export const setToken = (token) => localStorage.setItem('cm_token', token);
export const clearToken = () => localStorage.removeItem('cm_token');

// ─── Core fetch wrapper ────────────────────────────────────────────────────────

/**
 * Wraps fetch with:
 *  - Automatic base URL prefixing
 *  - JSON Content-Type header
 *  - JWT Authorization header (if token exists)
 *  - Consistent error shape: { message, status, errors? }
 *  - 401 auto-logout: clears token and dispatches 'auth:logout' event
 *    which AuthProvider listens to for session teardown
 *
 * @param {string} endpoint   - Path relative to API_BASE e.g. '/clubs/mine'
 * @param {RequestInit} options - Standard fetch options
 * @returns {Promise<any>}    - Parsed JSON response body
 * @throws {{ message: string, status: number, errors?: array }}
 */
export async function api(endpoint, options = {}) {
    const token = getToken();

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

    // No content responses (204 DELETE etc.)
    if (res.status === 204) return null;

    let body;
    try {
        body = await res.json();
    } catch {
        throw { message: 'Server returned an invalid response.', status: res.status };
    }

    if (!res.ok) {
        // Session expired or invalid token — broadcast logout
        if (res.status === 401) {
            clearToken();
            window.dispatchEvent(new Event('auth:logout'));
        }

        throw {
            message: body?.error || 'Something went wrong.',
            status:  res.status,
            errors:  body?.errors || null, // Zod validation errors from validate middleware
        };
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

api.delete = (endpoint, options = {}) =>
    api(endpoint, { ...options, method: 'DELETE' });

// ─── Resource URL builders ─────────────────────────────────────────────────────
// Centralises URL construction so endpoint strings never get scattered across hooks.

export const endpoints = {
    // Auth
    auth: {
        register:       () => '/auth/register',
        login:          () => '/auth/login',
        me:             () => '/auth/me',
        password:       () => '/auth/password',
    },

    // Clubs
    clubs: {
        mine:           ()           => '/clubs/mine',
        byId:           (clubId)     => `/clubs/${clubId}`,
        members:        (clubId)     => `/clubs/${clubId}/members`,
        member:         (clubId, userId) => `/clubs/${clubId}/members/${userId}`,
    },

    // Players
    players: {
        list:           (clubId)             => `/clubs/${clubId}/players`,
        byId:           (clubId, playerId)   => `/clubs/${clubId}/players/${playerId}`,
        claim:          (clubId, playerId)   => `/clubs/${clubId}/players/${playerId}/claim`,
        unlink:         (clubId, playerId)   => `/clubs/${clubId}/players/${playerId}/unlink`,
        matches:        (clubId, playerId)   => `/clubs/${clubId}/players/${playerId}/matches`,
        headToHead:     (clubId, aId, bId)   => `/clubs/${clubId}/players/${aId}/vs/${bId}`,
        ratingHistory:  (clubId, playerId)   => `/clubs/${clubId}/leaderboard/players/${playerId}/rating-history`,
    },

    // Player links
    links: {
        pending:        (clubId)   => `/clubs/${clubId}/players/links/pending`,
        approve:        (clubId, linkId) => `/clubs/${clubId}/players/links/${linkId}/approve`,
        reject:         (clubId, linkId) => `/clubs/${clubId}/players/links/${linkId}/reject`,
    },

    // Matches
    matches: {
        list:           (clubId)           => `/clubs/${clubId}/matches`,
        byId:           (clubId, matchId)  => `/clubs/${clubId}/matches/${matchId}`,
    },

    // Tournaments
    tournaments: {
        list:           (clubId)                   => `/clubs/${clubId}/tournaments`,
        byId:           (clubId, tournamentId)     => `/clubs/${clubId}/tournaments/${tournamentId}`,
        status:         (clubId, tournamentId)     => `/clubs/${clubId}/tournaments/${tournamentId}/status`,
        standings:      (clubId, tournamentId)     => `/clubs/${clubId}/tournaments/${tournamentId}/standings`,
        players:        (clubId, tournamentId)     => `/clubs/${clubId}/tournaments/${tournamentId}/players`,
        player:         (clubId, tournamentId, playerId) => `/clubs/${clubId}/tournaments/${tournamentId}/players/${playerId}`,
    },

    // Leaderboard
    leaderboard: {
        list:           (clubId) => `/clubs/${clubId}/leaderboard`,
        stats:          (clubId) => `/clubs/${clubId}/leaderboard/stats`,
        headToHead:     (clubId, aId, bId) => `/clubs/${clubId}/leaderboard/players/${aId}/vs/${bId}/summary`,
    },

    // Public (unauthenticated)
    public: {
        leaderboard:    (clubId)           => `/public/clubs/${clubId}/leaderboard`,
        tournament:     (clubId, tId)      => `/public/clubs/${clubId}/tournaments/${tId}`,
        player:         (clubId, playerId) => `/public/clubs/${clubId}/players/${playerId}`,
    },
};