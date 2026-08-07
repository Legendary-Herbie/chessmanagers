import React, { useEffect, useState, useRef } from 'react';
import Button from '../../shared/common/Button.jsx';
import Icon from '../../shared/common/Icon.jsx';
import { api, endpoints } from '../../config/api.js';
import { useNotifications } from '../../app/providers.jsx';
import { useConfirm } from '../../app/ConfirmProvider.jsx';

export default function InviteModal({ clubId, onClose }) {
    const [invites, setInvites] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const modalRef = useRef(null);

    const { notify } = useNotifications();
    const confirm = useConfirm();

    useEffect(() => {
        loadInvites();
        const onKey = (e) => { if (e.key === 'Escape') onClose(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    async function loadInvites() {
        setLoading(true);
        try {
            const res = await api.get(endpoints.clubs.listInvites(clubId));
            setInvites(res.invites || []);
        } catch (err) {
            console.error('Failed to load invites', err);
            notify('Failed to load invites', 'error');
        } finally { setLoading(false); }
    }

    async function createInvite() {
        setBusy(true);
        try {
            const res = await api.post(endpoints.clubs.createInvite(clubId));
            const inv = res.invite;
            if (inv) {
                // show the link via navigator clipboard
                const link = `${window.location.origin}/clubs/join?token=${inv.token}`;
                try { await navigator.clipboard.writeText(link); } catch (e) { /* ignore */ }
                await loadInvites();
                notify('Invite created and link copied to clipboard', 'success');
            }
        } catch (err) {
            notify(err.message || 'Failed to create invite', 'error');
        } finally { setBusy(false); }
    }

    async function revoke(invite) {
        const ok = await confirm({ title: 'Revoke invite', message: `Revoke invite ${invite.token}?` });
        if (!ok) return;
        setBusy(true);
        try {
            await api.delete(endpoints.clubs.revokeInvite(clubId, invite.id));
            await loadInvites();
            notify('Invite revoked', 'success');
        } catch (err) {
            notify(err.message || 'Failed to revoke invite', 'error');
        } finally { setBusy(false); }
    }

    return (
        <div className="modal-backdrop" role="presentation" onClick={() => onClose(false)}>
            <div className="modal-content" ref={modalRef} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="modal-header">
                    <h3 className="text-xl">Invite links</h3>
                    <Button aria-label="Close" variant="secondary" onClick={() => onClose(false)}>
                        <Icon name="x" />
                    </Button>
                </div>

                <div className="modal-body">
                    <div className="mb-4">
                        <Button onClick={createInvite} loading={busy}>Generate invite and copy link</Button>
                    </div>

                    {loading ? (
                        <div className="muted">Loading…</div>
                    ) : (
                        <table className="members-table w-full">
                            <thead>
                                <tr><th>Token</th><th>Created</th><th>Expires</th><th>Revoked</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {invites.map(i => (
                                    <tr key={i.id}>
                                        <td className="mono">{i.token}</td>
                                        <td>{new Date(i.created_at).toLocaleString()}</td>
                                        <td>{i.expires_at ? new Date(i.expires_at).toLocaleString() : '—'}</td>
                                        <td>{i.revoked ? 'Yes' : 'No'}</td>
                                        <td>
                                            {!i.revoked && <Button onClick={() => revoke(i)} variant="danger">Revoke</Button>}
                                        </td>
                                    </tr>
                                ))}
                                {invites.length === 0 && <tr><td colSpan={5} className="muted">No active invites</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="modal-footer">
                    <Button variant="secondary" onClick={() => onClose(false)}>Close</Button>
                </div>
            </div>
        </div>
    );
}
