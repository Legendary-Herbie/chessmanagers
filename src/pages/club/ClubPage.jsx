import React, { useState, useEffect } from 'react';
import '../../styles/club.css';
import { api, endpoints } from '../../config/api.js';
import { useClub } from '../../app/ClubProvider.jsx';
import { useAuth } from '../../app/AuthProvider.jsx';
import Button from '../../shared/common/Button.jsx';
import InviteModal from './InviteModal.jsx';
import { useNotifications } from '../../app/providers.jsx';
import { useConfirm } from '../../app/ConfirmProvider.jsx';

export default function ClubPage() {
    const { club, refreshClub } = useClub();
    const { user, isAdmin } = useAuth();

    const [profile, setProfile] = useState(null);
    const [members, setMembers] = useState([]);
    const [joinRequests, setJoinRequests] = useState([]);
    const [activeTab, setActiveTab] = useState('profile');
    const [loading, setLoading] = useState(false);
    const [loadingRequests, setLoadingRequests] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);

    const { notify } = useNotifications();
    const confirm = useConfirm();

    useEffect(() => {
        if (!club) return;
        setProfile(club);
        loadMembers();
        if (isAdmin) loadJoinRequests();
    }, [club, isAdmin]);

    async function loadMembers() {
        setLoading(true);
        try {
            const res = await api.get(endpoints.clubs.members(club.id));
            setMembers(Array.isArray(res.members) ? res.members : (res.members ?? []));
        } catch (err) {
            console.error('Failed to load members', err);
        } finally {
            setLoading(false);
        }
    }

    async function loadJoinRequests() {
        setLoadingRequests(true);
        try {
            const res = await api.get(endpoints.clubs.joinRequests(club.id));
            setJoinRequests(Array.isArray(res.requests) ? res.requests : (res.requests ?? []));
        } catch (err) {
            console.error('Failed to load join requests', err);
        } finally {
            setLoadingRequests(false);
        }
    }

    async function saveProfile() {
        try {
            await api.patch(endpoints.clubs.byId(club.id), profile);
            await refreshClub();
            notify('Club updated', 'success');
        } catch (err) {
            notify(err.message || 'Failed to update club', 'error');
        }
    }

    function inviteLink() {
        return `${window.location.origin}/clubs/${club.id}/join`;
    }

    async function removeMember(member) {
        const ok = await confirm({ title: 'Remove member', message: `Remove ${member.email} from the club?` });
        if (!ok) return;
        if (member.role === 'owner') { notify('Cannot remove owner', 'error'); return; }
        if (member.userId === user?.id) { notify('Cannot remove yourself', 'error'); return; }
        try {
            await api.delete(endpoints.clubs.member(club.id, member.userId));
            await loadMembers();
            notify('Member removed', 'success');
        } catch (err) {
            notify(err.message || 'Failed to remove member', 'error');
        }
    }

    async function approveRequest(reqRow) {
        const ok = await confirm({ title: 'Approve request', message: `Approve join request from ${reqRow.email}?` });
        if (!ok) return;
        try {
            await api.patch(endpoints.clubs.approveJoin(club.id, reqRow.id));
            await loadJoinRequests();
            await loadMembers();
            notify('Approved', 'success');
        } catch (err) {
            notify(err.message || 'Failed to approve request', 'error');
        }
    }

    async function rejectRequest(reqRow) {
        const ok = await confirm({ title: 'Reject request', message: `Reject join request from ${reqRow.email}?` });
        if (!ok) return;
        try {
            await api.patch(endpoints.clubs.rejectJoin(club.id, reqRow.id));
            await loadJoinRequests();
            notify('Rejected', 'success');
        } catch (err) {
            notify(err.message || 'Failed to reject request', 'error');
        }
    }

    if (!club) return <div className="muted">No active club selected.</div>;

    return (
        <div className="club-page">
            <div className="page-header">
                <h1>Club: {club.name}</h1>
            </div>

            <div className="tabs">
                <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>Profile</button>
                <button className={activeTab === 'members' ? 'active' : ''} onClick={() => setActiveTab('members')}>Members</button>
                {isAdmin && <button className={activeTab === 'requests' ? 'active' : ''} onClick={() => setActiveTab('requests')}>Join Requests</button>}
            </div>

            {activeTab === 'profile' && (
                <div className="tab-panel profile-panel">
                    <label className="form-row">
                        <div className="label">Name</div>
                        <input className="input" value={profile?.name || ''} onChange={e => setProfile({ ...profile, name: e.target.value })} />
                    </label>

                    <label className="form-row">
                        <div className="label">Federation</div>
                        <input className="input" value={profile?.federation || ''} onChange={e => setProfile({ ...profile, federation: e.target.value })} />
                    </label>

                    <label className="form-row">
                        <div className="label">Description</div>
                        <textarea className="input" value={profile?.description || ''} onChange={e => setProfile({ ...profile, description: e.target.value })} />
                    </label>

                    <label className="form-row">
                        <div className="label">Logo URL</div>
                        <input className="input" value={profile?.logo || ''} onChange={e => setProfile({ ...profile, logo: e.target.value })} />
                    </label>

                    {profile?.logo && <div className="logo-preview"><img src={profile.logo} alt="Club logo" /></div>}

                    <div className="form-actions">
                        {isAdmin ? (
                            <>
                                <Button onClick={saveProfile} className="mr-2">Save</Button>
                                <Button variant="secondary" onClick={() => { setProfile(club); }}>Reset</Button>
                            </>
                        ) : (
                            <div className="muted">Only admins can edit club settings.</div>
                        )}
                    </div>

                    <div className="invite-section">
                        {isAdmin ? (
                            <>
                                <div className="invite-label">Invite links</div>
                                <div className="invite-row">
                                    <Button onClick={() => setShowInviteModal(true)}>Manage Invites</Button>
                                </div>
                                {showInviteModal && (
                                    <InviteModal clubId={club.id} onClose={() => setShowInviteModal(false)} />
                                )}
                            </>
                        ) : null}
                    </div>
                </div>
            )}

            {activeTab === 'members' && (
                <div className="tab-panel members-panel">
                    {loading ? <div className="muted">Loading…</div> : (
                        <table className="members-table">
                            <thead>
                                <tr><th>Email</th><th>Role</th><th>Joined</th>{isAdmin && <th>Actions</th>}</tr>
                            </thead>
                            <tbody>
                                {members.map(m => (
                                    <tr key={m.userId}>
                                        <td>{m.email}</td>
                                        <td>{m.role}</td>
                                        <td>{m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '—'}</td>
                                        {isAdmin && (
                                            <td>
                                                <Button variant="danger" onClick={() => removeMember(m)}>Remove</Button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {members.length === 0 && <tr><td colSpan={isAdmin ? 4 : 3} className="muted">No members</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {isAdmin && activeTab === 'requests' && (
                <div className="tab-panel requests-panel">
                    {loadingRequests ? <div className="muted">Loading…</div> : (
                        <table className="members-table">
                            <thead>
                                <tr><th>Email</th><th>Message</th><th>Requested At</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {joinRequests.map(r => (
                                    <tr key={r.id}>
                                        <td>{r.email}</td>
                                        <td>{r.message || '—'}</td>
                                        <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                                        <td>
                                            <Button onClick={() => approveRequest(r)} className="mr-2">Approve</Button>
                                            <Button variant="secondary" onClick={() => rejectRequest(r)}>Reject</Button>
                                        </td>
                                    </tr>
                                ))}
                                {joinRequests.length === 0 && <tr><td colSpan={4} className="muted">No pending requests</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}
