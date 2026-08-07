import React, { useState, useEffect } from 'react';
import { api, endpoints } from '../../config/api.js';
import Button from '../../shared/common/Button.jsx';
import '../../styles/club.css';
import { useNotifications } from '../../app/providers.jsx';
import { useConfirm } from '../../app/ConfirmProvider.jsx';

export default function FindClubsPage() {
    const [clubs, setClubs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState(null);

    const { notify } = useNotifications();
    const confirm = useConfirm();

    useEffect(() => {
        loadClubs();
    }, []);

    async function loadClubs() {
        setLoading(true);
        try {
            // Request all clubs (include private/hidden ones) to make FindClubs useful for discovery
            const res = await api.get(`${endpoints.clubs.list()}?all=1`);
            const list = res?.clubs || res?.data || res || [];
            setClubs(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error('Failed to load clubs', err);
            notify('Failed to load clubs', 'error');
        } finally {
            setLoading(false);
        }
    }

    async function joinClub(clubId) {
        const ok = await confirm({ title: 'Join club', message: 'Send a request to join this club?' });
        if (!ok) return;
        setBusyId(clubId);
        try {
            await api.post(endpoints.clubs.join(clubId));
            notify('Join request sent (or you have been added if this was an invite).', 'success');
            window.location.href = '/club';
        } catch (err) {
            notify(err.message || 'Failed to request to join club', 'error');
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="find-clubs-page">
            <div className="page-header"><h1>Find clubs</h1></div>

            {loading ? (
                <div className="muted">Loading…</div>
            ) : (
                <div className="clubs-grid">
                    {clubs.length === 0 && <div className="muted">No clubs found.</div>}
                    {clubs.map(c => (
                        <div key={c.id} className="club-card">
                            <div className="club-card-header">
                                <div className="club-name">{c.name}</div>
                                <div className="club-fed muted">{c.federation || '—'}</div>
                            </div>
                            <div className="club-desc">{c.description || 'No description'}</div>
                            <div className="club-actions">
                                <Button onClick={() => (window.location.href = `/clubs/${c.id}`)}>View</Button>
                                <Button onClick={() => joinClub(c.id)} loading={busyId === c.id} className="ml-2">Join</Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
