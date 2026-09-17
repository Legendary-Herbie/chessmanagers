import { useContext, useSyncExternalStore } from 'react';
import { AuthContext } from '../../app/contextHooks.js';

const eventName = 'account-display-preference';
const fallback = new Map();
function subscribe(listener) {
    window.addEventListener('storage', listener);
    window.addEventListener(eventName, listener);
    return () => { window.removeEventListener('storage', listener); window.removeEventListener(eventName, listener); };
}
export function useChessSummaryPreference() {
    const auth = useContext(AuthContext);
    const key = auth?.user?.id ? `1chessclub:${auth.user.id}:show-chess-summary` : null;
    const showSummary = useSyncExternalStore(subscribe, () => {
        if (!key) return true;
        if (fallback.has(key)) return fallback.get(key) !== 'false';
        try { return window.localStorage.getItem(key) !== 'false'; }
        catch { return fallback.get(key) !== 'false'; }
    }, () => true);
    function setShowSummary(value) {
        if (!key) return;
        try { window.localStorage.setItem(key, String(value)); fallback.delete(key); }
        catch { fallback.set(key, String(value)); }
        window.dispatchEvent(new Event(eventName));
    }
    return [showSummary, setShowSummary];
}
