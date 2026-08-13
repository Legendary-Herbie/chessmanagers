import React, { useState, useEffect, useCallback } from 'react';
import '../../styles/club.css';
import Button from '../../shared/common/Button.jsx';
import ClubDashboard from './ClubDashboard.jsx';
import { api, endpoints } from '../../config/api.js';
import { useClub, useAuth } from '../../app/contextHooks.js';

export default function ClubPage() {
    const { club, refreshClub } = useClub();
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);
    const [members, setMembers] = useState([]);
    const [activeTab, setActiveTab] = useState('profile');
    const [loading, setLoading] = useState(false);
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [invites, setInvites] = useState([]);
    const [joinRequests, setJoinRequests] = useState([]);

    const loadMembers = useCallback(async () => {
        if (!club) return;
        setLoading(true);
        try {
            const res = await api.get(endpoints.clubs.members(club.id));
            const list = Array.isArray(res.members) ? res.members : (res.members ?? []);
            setMembers(list);
        } catch (err) {
            console.error('Failed to load members', err);
        } finally {
            setLoading(false);
        }
    }, [club]);

    const [stats, setStats] = useState(null);

    useEffect(() => {
        if (!club) return;
        setProfile(club);
        loadMembers();

        // load existing invites (if admin)
        async function loadAdminData() {
            try {
                const res = await api.get(endpoints.clubs.invites(club.id));
                setInvites(res?.invites || []);
            } catch {
                // ignore — non-admins won't be able to fetch
            }

            try {
                const s = await api.get(endpoints.leaderboard.stats(club.id));
                setStats(s?.stats || null);
            } catch {
                // ignore
            }
        }
        loadAdminData();
    }, [club, loadMembers]);

    async function saveProfile() {
        if (!club) return;
        try {
            await api.patch(endpoints.clubs.byId(club.id), profile);
            await refreshClub();
            alert('Club updated');
        } catch (err) {
            alert(err.message || 'Failed to update club');
        }
    }

    async function createInvite() {
        if (!club) return;
        setCreatingInvite(true);
        try {
            const res = await api.post(endpoints.clubs.invites(club.id), {});
            const inv = res?.invite;
            if (inv?.token) {
                setInvites(prev => [inv, ...prev]);
                const url = `${window.location.origin}/clubs/join?token=${inv.token}`;
                await navigator.clipboard.writeText(url);
                alert('Invite created and copied to clipboard');
            } else {
                alert('Invite created');
            }
        } catch (err) {
            alert(err?.message || 'Failed to create invite');
        } finally {
            setCreatingInvite(false);
        }
    }

    async function loadJoinRequests() {
        if (!club) return;
        try {
            const result = await api.get(`/clubs/${club.id}/join-requests`);
            setJoinRequests(result.requests || []);
        } catch {
            setJoinRequests([]);
        }
    }

    async function reviewJoinRequest(requestId, action) {
        if (!club) return;
        try {
            await api.patch(`/clubs/${club.id}/join-requests/${requestId}/${action}`);
            setJoinRequests(current => current.filter(request => request.id !== requestId));
            if (action === 'approve') await loadMembers();
        } catch (err) {
            alert(err?.message || `Failed to ${action} join request`);
        }
    }

    async function removeMember(member) {
        if (!confirm(`Remove ${member.email} from the club?`)) return;
        if (member.role === 'owner') { alert('Cannot remove owner'); return; }
        if (member.userId === user?.id) { alert('Cannot remove yourself'); return; }
        try {
            await api.delete(endpoints.clubs.member(club.id, member.userId));
            await loadMembers();
        } catch (err) {
            alert(err.message || 'Failed to remove member');
        }
    }

    if (!club) return <div className="muted">No active club selected.</div>;

    // determine club-level admin (owner/admin) for the current user
    const currentMember = members.find(m => m.userId === user?.id);
    const isClubAdmin = currentMember && (currentMember.role === 'owner' || currentMember.role === 'admin');

    useEffect(() => {
        if (isClubAdmin) loadJoinRequests();
    }, [isClubAdmin, club]);

    return (
        <div className="club-page">
            <div className="page-header">
                <h1>Club: {club.name}</h1>
                <div className="club-stats">
                    {stats ? (
                        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                            Players: {stats.total_players} · Matches: {stats.total_matches} · Avg rating: {stats.average_rating ?? '—'}
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="tabs">
                <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>Profile</button>
                <button className={activeTab === 'members' ? 'active' : ''} onClick={() => setActiveTab('members')}>Members</button>
                <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
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
                        {isClubAdmin ? (
                            <>
                                <Button onClick={saveProfile} className="mr-2">Save</Button>
                                <Button variant="secondary" onClick={() => setProfile(club)}>Reset</Button>
                            </>
                        ) : (
                            <div className="muted">Only club admins can edit club settings.</div>
                        )}
                    </div>

                    {isClubAdmin && (
                        <div className="invite-section">
                            <div className="invite-label">Invites</div>
                            <div className="invite-row" style={{ marginBottom: 8 }}>
                                <Button onClick={createInvite} disabled={creatingInvite}>{creatingInvite ? 'Creating…' : 'Create invite'}</Button>
                            </div>

                            {invites.length === 0 ? (
                                <div className="muted">No active invites</div>
                            ) : (
                                <ul className="invite-list">
                                    {invites.map(i => (
                                        <li key={i.id} className="invite-item">
                                            <code style={{ fontSize: 12 }}>{i.token}</code>
                                            <div style={{ marginLeft: 'auto' }}>
                                                <Button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/clubs/join?token=${i.token}`)}>Copy</Button>
                                                <Button variant="danger" style={{ marginLeft: 8 }} onClick={async () => {
                                                    if (!confirm('Revoke this invite?')) return;
                                                    try {
                                                        await api.delete(endpoints.clubs.invite(club.id, i.id));
                                                        setInvites(prev => prev.filter(x => x.id !== i.id));
                                                    } catch (err) {
                                                        alert(err?.message || 'Failed to revoke invite');
                                                    }
                                                }}>Revoke</Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <div className="invite-label" style={{ marginTop: 20 }}>Join requests</div>
                            {joinRequests.length === 0 ? (
                                <div className="muted">No pending join requests</div>
                            ) : (
                                <ul className="invite-list">
                                    {joinRequests.map(request => (
                                        <li key={request.id} className="invite-item">
                                            <div><strong>{request.name || request.email}</strong>{request.message ? <div className="muted">{request.message}</div> : null}</div>
                                            <div style={{ marginLeft: 'auto' }}>
                                                <Button onClick={() => reviewJoinRequest(request.id, 'approve')}>Approve</Button>
                                                <Button variant="danger" style={{ marginLeft: 8 }} onClick={() => reviewJoinRequest(request.id, 'reject')}>Reject</Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'members' && (
                <div className="tab-panel members-panel">
                    {loading ? <div className="muted">Loading…</div> : (
                        <table className="members-table">
                            <thead>
                                <tr><th>Email</th><th>Role</th><th>Joined</th>{isClubAdmin && <th>Actions</th>}</tr>
                            </thead>
                            <tbody>
                                {members.map(m => (
                                    <tr key={m.userId}>
                                        <td>{m.email}</td>
                                        <td>{m.role}</td>
                                        <td>{m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '—'}</td>
                                        {isClubAdmin && (
                                            <td>
                                                <Button variant="danger" onClick={() => removeMember(m)}>Remove</Button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {members.length === 0 && <tr><td colSpan={isClubAdmin ? 4 : 3} className="muted">No members</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {activeTab === 'dashboard' && <ClubDashboard stats={stats} />}
        </div>
    );
}
