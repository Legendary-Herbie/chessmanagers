import {
    API_BASE,
    endpoints,
    getToken,
    normaliseError,
    refreshAccessToken,
} from '../../../config/api.js';

function withQuery(endpoint, values) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values || {})) {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    }
    const encoded = query.toString();
    return encoded ? `${endpoint}?${encoded}` : endpoint;
}

function responseFilename(response, fallback) {
    const disposition = response.headers.get('content-disposition') || '';
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (encoded) return decodeURIComponent(encoded);
    return disposition.match(/filename="?([^";]+)"?/i)?.[1] || fallback;
}

async function fetchCsv(endpoint, retried = false) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        credentials: 'include',
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    });
    if (response.status === 401 && !retried) {
        await refreshAccessToken();
        return fetchCsv(endpoint, true);
    }
    if (!response.ok) {
        let body;
        try {
            body = await response.json();
        } catch {
            body = { message: 'The export could not be downloaded.' };
        }
        throw normaliseError(body, response.status);
    }
    return response;
}

async function download(endpoint, fallbackFilename) {
    const response = await fetchCsv(endpoint);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = responseFilename(response, fallbackFilename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
}

export const exportApi = {
    downloadPackage: async clubId => {
        const { zipSync } = await import('fflate');
        const responses = await Promise.all([
            fetchCsv(withQuery(endpoints.exports.players(clubId), { includeInactive: true })),
            fetchCsv(endpoints.exports.matches(clubId)),
            fetchCsv(withQuery(endpoints.exports.ratings(clubId), { includeInactive: true })),
        ]);
        const names = ['players.csv', 'matches.csv', 'ratings.csv'];
        const contents = await Promise.all(responses.map(response => response.arrayBuffer()));
        const zipped = zipSync(Object.fromEntries(contents.map((buffer, index) => [names[index], new Uint8Array(buffer)])));
        const url = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `club-records-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    downloadPlayers: (clubId, { includeInactive = false } = {}) => download(
        withQuery(endpoints.exports.players(clubId), { includeInactive }),
        'players.csv'
    ),
    downloadMatches: (clubId, { category } = {}) => download(
        withQuery(endpoints.exports.matches(clubId), { category }),
        'matches.csv'
    ),
    downloadRatings: (clubId, { category, includeInactive = false } = {}) => download(
        withQuery(endpoints.exports.ratings(clubId), { category, includeInactive }),
        'ratings.csv'
    ),
};
