import React, { useEffect, useState } from 'react';
import { useAuth, useClub } from '../../../app/contextHooks.js';
import { readQueue, setQueueAccount, syncQueue, updateQueue } from './matchQueue.js';
import './offlineMatches.css';
import ConfirmDialog from '../../../components/ConfirmDialog.jsx';
export default function OfflineMatches() {
    const { user } = useAuth(); const { club, capabilities } = useClub();
    const [discard, setDiscard] = useState(null);
    const [online, setOnline] = useState(navigator.onLine);
    const [entries, setEntries] = useState([]); const [otherCount, setOtherCount] = useState(0); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
    useEffect(() => { setQueueAccount(user?.id); return () => setQueueAccount(null); }, [user?.id]);
    useEffect(() => {
        const read = () => { try { const all = readQueue(user?.id); setEntries(all.filter(item => item.clubId === club?.id)); setOtherCount(all.filter(item => item.clubId !== club?.id).length); setError(''); } catch (err) { setError(err.message); } };
        const connection = () => { setOnline(navigator.onLine); read(); };
        read(); window.addEventListener('online', connection); window.addEventListener('offline', connection); window.addEventListener('match-queue-changed', read); window.addEventListener('storage', read);
        return () => { window.removeEventListener('online', connection); window.removeEventListener('offline', connection); window.removeEventListener('match-queue-changed', read); window.removeEventListener('storage', read); };
    }, [user?.id, club?.id]);
    useEffect(() => {
        if (!online || !user?.id) return;
        let current = true;
        const sync = async () => { try { for (const queuedClub of new Set(readQueue(user.id).map(item => item.clubId))) { if (!current) break; await syncQueue(user.id, queuedClub, () => current); } } catch (err) { if (current) setError(err.message); } };
        void sync(); const timer = setInterval(sync, 15000);
        return () => { current = false; clearInterval(timer); };
    }, [online, user?.id, club?.id, capabilities.canManageMatches, retry]);
    if (online && !entries.length && !otherCount && !error) return null;
    return <aside className="offline-matches" aria-label="Connection and offline matches"><p role="status">{online ? 'Connection restored.' : capabilities.canManageMatches ? 'You’re offline. New matches will be saved on this device.' : 'You’re offline. Changes need a connection.'} {entries.length > 0 && `${entries.length} match${entries.length === 1 ? '' : 'es'} waiting to sync for this club.`}</p>
        {otherCount > 0 && <p>{otherCount} pending matches in other clubs. Switch clubs to review them.</p>}
        {!online && capabilities.canManageMatches && <small>Use players already loaded in this session. Keep this page open; other changes need a connection.</small>}
        {error && <p role="alert">{error}</p>}
        {entries.length > 0 && <details><summary>Review queued matches</summary><ul>{entries.map(item => <li key={item.id}><strong>{item.label || 'Queued match'}</strong><span>{new Date(item.payload.playedAt).toLocaleString()} · {item.payload.ratingCategory[0].toUpperCase() + item.payload.ratingCategory.slice(1)} · {({ white:'1–0', draw:'½–½', black:'0–1' })[item.payload.result]}</span>{item.error && <p role="alert">{item.error}</p>}{item.code === 'POSSIBLE_DUPLICATE_MATCH' && <button className="btn btn-secondary" disabled={!online} onClick={() => { updateQueue(user.id, records => records.map(record => record.id === item.id ? { ...record, error: '', payload: { ...record.payload, confirmDuplicate: true } } : record)); setRetry(value => value + 1); }}>Confirm duplicate and save</button>}<button className="btn btn-secondary" disabled={online && !item.error} onClick={() => setDiscard(item.id)}>Remove from queue</button><button className="btn btn-secondary" disabled={!online} onClick={() => { updateQueue(user.id, records => records.map(record => record.id === item.id ? { ...record, error: '' } : record)); setRetry(value => value + 1); }}>Retry</button></li>)}</ul></details>}
        {discard && <ConfirmDialog isOpen title="Remove queued match?" message="This removes the local pending submission. It does not delete any match already saved to the server." confirmLabel="Remove from queue" onConfirm={() => { const record = readQueue(user.id).find(item => item.id === discard); if (navigator.onLine && record && !record.error) { setError('This match is syncing. Wait for it to finish before removing it.'); } else { updateQueue(user.id, records => records.filter(item => item.id !== discard)); } setDiscard(null); }} onClose={() => setDiscard(null)} />}
    </aside>;
}
