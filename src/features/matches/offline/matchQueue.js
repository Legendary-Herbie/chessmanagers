import { setOfflineRosterOwner, cachedPlayerName } from '../../players/api/playerApi.js';
import { matchApi } from '../api/matchApi.js';
let account = null;
export function setQueueAccount(id) { account = id || null; setOfflineRosterOwner(account); }
const prefix = id => `1chessclub:pending-match:${id}:`;
export function readQueue(id = account) {
    if (!id) return [];
    const records = [];
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(prefix(id))) {
            const record = JSON.parse(localStorage.getItem(key));
            if (!record?.id || !record.payload || !record.clubId) throw new Error('Saved offline matches could not be read. Do not clear browser storage.');
            records.push(record);
        }
    }
    return records.sort((a, b) => a.payload.playedAt.localeCompare(b.payload.playedAt) || a.id.localeCompare(b.id));
}
export function updateQueue(id, transform) {
    if (!id) throw new Error('Sign in to manage queued matches.');
    const previous = readQueue(id);
    const next = transform(previous);
    // Each match has its own key so two tabs adding different games cannot overwrite each other.
    for (const record of next) localStorage.setItem(`${prefix(id)}${record.id}`, JSON.stringify(record));
    for (const record of previous) if (!next.some(item => item.id === record.id)) localStorage.removeItem(`${prefix(id)}${record.id}`);
    window.dispatchEvent(new Event('match-queue-changed'));
}
export async function submitMatch(clubId, payload) {
    const owner = account;
    const values = { ...payload, clientRequestId: crypto.randomUUID() };
    try {
        if (navigator.onLine === false) throw { type: 'NETWORK' };
        return await matchApi.create(clubId, values);
    } catch (error) {
        if (navigator.onLine !== false && !['NETWORK', 'TIMEOUT', 'network', 'timeout'].includes(error.type)) throw error;
        if (!owner) throw new Error('Sign in before saving offline matches.');
        updateQueue(owner, entries => [...entries, { id: values.clientRequestId, clubId, payload: values, label: `${cachedPlayerName(clubId, values.whitePlayerId) || 'White player'} vs. ${cachedPlayerName(clubId, values.blackPlayerId) || 'Black player'}`, savedAt: new Date().toISOString(), error: '' }]);
        return { queued: true };
    }
}
const syncing = new Map();
export async function syncQueue(owner, clubId, isCurrent = () => true) {
    const sync = async () => {
        for (const record of readQueue(owner).filter(item => item.clubId === clubId && !item.error)) {
            if (!isCurrent() || navigator.onLine === false || account !== owner) break;
            try {
                await matchApi.create(clubId, record.payload);
            } catch (error) {
                if (!error.status || error.status >= 500) break;
                updateQueue(owner, entries => entries.map(item => item.id === record.id ? { ...item, error: error.message || 'Review this match before retrying.', code: error.code } : item));
                break;
            }
            updateQueue(owner, entries => entries.filter(item => item.id !== record.id));
            window.dispatchEvent(new CustomEvent('offline-match-synced', { detail: { clubId } }));
        }
    };
    const lockKey = `match-sync:${owner}:${clubId}`;
    if (syncing.has(lockKey)) return syncing.get(lockKey);
    const task = (navigator.locks ? navigator.locks.request(lockKey, sync) : sync()).finally(() => syncing.delete(lockKey));
    syncing.set(lockKey, task);
    return task;
}
