import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, endpoints } from '../../config/api.js';
import Button from '../../shared/common/Button.jsx';
import '../../styles/club.css';
import { useNotifications } from '../../app/providers.jsx';
import { useConfirm } from '../../app/ConfirmProvider.jsx';

export default function PublicClubPage() {
    const { clubId } = useParams();
    const [club, setClub] = useState(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);

    const { notify } = useNotifications();
    const confirm = useConfirm();

    useEffect(() => {
        if (!clubId) return;
        loadClub();
    }, [clubId]);

    async function loadClub() {
        setLoading(true);
        try {
            const res = await api.get(endpoints.clubs.byId(clubId));
            setClub(res.club || res);
        } catch (err) {
            console.error('Failed to load club', err);
            notify('Failed to load club', 'error');
        } finally {
            setLoading(false);
        }
    }

    async function join() {
        const ok = await confirm({ title: 'Join club', message: 'Request to join this club?' });
        if (!ok) return;
        setBusy(true);
        try {
            await api.post(endpoints.clubs.join(clubId));
            notify('Join request sent (or you have been added if this was an invite).', 'success');
            window.location.href = '/club';
        } catch (err) {
            notify(err.message || 'Failed to send join request', 'error');
        } finally {
            setBusy(false);
        }
    }

    if (loading) return <div className="muted">Loading…</div>;
    if (!club) return <div className="muted">Club not found.</div>;

    return (
        <div className="public-club-page">
            <div className="page-header"><h1>{club.name}</h1></div>
            <div className="club-detail">
                {club.logo && <img src={club.logo} alt={`${club.name} logo`} className="club-detail-logo" />}
                <div className="club-detail-meta">
                    <div><strong>Federation:</strong> {club.federation || '—'}</div>
                    <div><strong>Contact:</strong> {club.contactInfo || '—'}</div>
                </div>
                <div className="club-detail-desc">{club.description || 'No description'}</div>
                <div className="club-actions">
                    <Button onClick={join} loading={busy}>Request to join</Button>
                </div>
            </div>
        </div>
    );
}
