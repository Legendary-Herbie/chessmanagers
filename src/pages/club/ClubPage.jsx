import React, { useState, useEffect } from 'react';
import '../../styles/club.css';
import { api, endpoints } from '../../config/api.js';
import { useClub } from '../../app/ClubProvider.jsx';
import { useAuth } from '../../app/AuthProvider.jsx';
import Button from '../../shared/common/Button.jsx';

export default function ClubPage() {
    const { club, refreshClub } = useClub();
    const { user, isAdmin } = useAuth();

    const [profile, setProfile] = useState(null);
    const [members, setMembers] = useState([]);
    const [activeTab, setActiveTab] = useState('profile');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!club) return;
        setProfile(club);
        loadMembers();
    }, [club]);

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

    async function saveProfile() {
        try {
            await api.patch(endpoints.clubs.byId(club.id), profile);
            await refreshClub();
            alert('Club updated');
        } catch (err) {
            alert(err.message || 'Failed to update club');
        }
    }

    function inviteLink() {
        return `${window.location.origin}/clubs/${club.id}/join`;
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

    return (
        <div className="club-page">
            <div className="page-header">
                <h1>Club: {club.name}</h1>
            </div>

            <div className="tabs">
                <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>Profile</button>
                <button className={activeTab === 'members' ? 'active' : ''} onClick={() => setActiveTab('members')}>Members</button>
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
                                <div className="invite-label">Invite link</div>
                                <div className="invite-row">
                                    <input className="input mono" readOnly value={inviteLink()} />
                                    <Button onClick={() => navigator.clipboard.writeText(inviteLink())}>Copy</Button>
                                </div>
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
        </div>
    );
}
