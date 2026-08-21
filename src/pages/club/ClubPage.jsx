import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../../styles/club.css';
import Button from '../../shared/common/Button.jsx';
import ClubDashboard from './ClubDashboard.jsx';
import { resolveAssetUrl } from '../../config/api.js';
import { useClub, useAuth } from '../../app/contextHooks.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';
import { leaderboardApi } from '../../features/leaderboard/api/leaderboardApi.js';
import DataExportPanel from '../../features/exports/components/DataExportPanel.jsx';

export default function ClubPage() {
    const { club, capabilities, refreshClub } = useClub();
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    // Read active tab from URL params, default to 'profile'
    const activeTab = searchParams.get('tab') || 'profile';
    const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });

    const [profile, setProfile] = useState(null);
    const [badgeFile, setBadgeFile] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [invites, setInvites] = useState([]);
    const [joinRequests, setJoinRequests] = useState([]);
    const [savingSettings, setSavingSettings] = useState(false);
    const [managementError, setManagementError] = useState(null);
    const [transferTarget, setTransferTarget] = useState('');
    const [previousOwnerRole, setPreviousOwnerRole] = useState('member');
    const [joinCodeStatus, setJoinCodeStatus] = useState({ active: false });
    const [revealedJoinCode, setRevealedJoinCode] = useState(null);
    const [joinCodeLoading, setJoinCodeLoading] = useState(false);

    // Dashboard payload — lazy-loaded only when tab is 'dashboard' (see useEffect below)
    const [dashboard, setDashboard] = useState(null);
    const [dashboardCategory, setDashboardCategory] = useState('blitz');
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [dashboardError, setDashboardError] = useState(null);

    const loadMembers = useCallback(async () => {
        if (!club || !capabilities.canManageMemberships) return;
        setLoading(true);
        try {
            setMembers(await clubApi.fetchMembers(club.id));
        } catch (err) {
            console.error('Failed to load members', err);
        } finally {
            setLoading(false);
        }
    }, [club, capabilities.canManageMemberships]);

    // NOTE: all hooks below are declared unconditionally, before any early
    // `return`. The original component called `useEffect` for join-request
    // loading *after* an `if (!club) return ...` guard — that violates the
    // Rules of Hooks and would throw "Rendered fewer hooks than expected"
    // the first time `club` transitions from null to a value.

    useEffect(() => {
        if (!club) return;
        setProfile(club);
        if (capabilities.canManageMemberships) loadMembers();
    }, [club, capabilities.canManageMemberships, loadMembers]);

    // Load invites whenever club changes (for admin tab access)
    useEffect(() => {
        if (!club || !capabilities.canManageMemberships) return;
        async function loadInvites() {
            try {
                setInvites(await clubApi.fetchInvites(club.id));
            } catch {
                // ignore — non-admins won't be able to fetch
            }
        }
        loadInvites();
    }, [club, capabilities.canManageMemberships]);

    useEffect(() => {
        if (!club || !capabilities.canManageMemberships) return;
        let cancelled = false;
        clubApi.getJoinCode(club.id)
            .then(result => {
                if (!cancelled) setJoinCodeStatus(result.joinCode || { active: false });
            })
            .catch(() => {
                if (!cancelled) setJoinCodeStatus({ active: false });
            });
        return () => { cancelled = true; };
    }, [club, capabilities.canManageMemberships]);

    // Determine club-level admin (owner/admin) for the current user
    // This check is now done early so we can gate other logic on it
    const isClubAdmin = Boolean(capabilities.canManageMemberships);
    const isOwner = Boolean(capabilities.canManageClubSettings);
    const canExportData = Boolean(capabilities.canExportData);

    // Lazy-load dashboard stats only when:
    // 1. dashboard tab is active
    // 2. user is a club admin (prevents URL manipulation bypass)
    useEffect(() => {
        if (!club || activeTab !== 'dashboard' || !isClubAdmin) return;

        async function loadDashboard() {
            setDashboardLoading(true);
            setDashboardError(null);
            try {
                setDashboard(await leaderboardApi.fetchDashboard(club.id, dashboardCategory));
            } catch (err) {
                setDashboardError(err?.message || 'Failed to load dashboard stats');
            } finally {
                setDashboardLoading(false);
            }
        }
        loadDashboard();
    }, [club, activeTab, isClubAdmin, dashboardCategory]);

    const loadJoinRequests = useCallback(async () => {
        if (!club) return;
        try {
            setJoinRequests(await clubApi.fetchJoinRequests(club.id));
        } catch {
            setJoinRequests([]);
        }
    }, [club]);

    useEffect(() => {
        if (isClubAdmin) loadJoinRequests();
    }, [isClubAdmin, loadJoinRequests]);

    async function saveProfile() {
        if (!club || !isOwner) return;
        setSavingSettings(true);
        setManagementError(null);
        try {
            await clubApi.update(club.id, {
                name: profile.name,
                federation: profile.federation,
                description: profile.description || null,
                contactInfo: profile.contact_info || null,
                visibility: profile.visibility,
                publicLeaderboard: Boolean(profile.public_leaderboard),
                settings: {
                    contacts: profile.settings_json?.contacts || {},
                    affiliation: profile.settings_json?.affiliation || null,
                    presentation: profile.settings_json?.presentation || {},
                    notifications: profile.settings_json?.notifications || {},
                },
                ratingSettings: profile.rating_settings,
            });
            if (badgeFile) {
                await clubApi.uploadBadge(club.id, badgeFile);
                setBadgeFile(null);
            }
            await refreshClub();
        } catch (err) {
            setManagementError(err.message || 'Failed to update club');
        } finally {
            setSavingSettings(false);
        }
    }

    function updateStructuredSetting(section, key, value) {
        setProfile(current => ({
            ...current,
            settings_json: {
                ...(current?.settings_json || {}),
                [section]: {
                    ...(current?.settings_json?.[section] || {}),
                    [key]: value,
                },
            },
        }));
    }

    function updateRatingSetting(category, key, value) {
        setProfile(current => ({
            ...current,
            rating_settings: {
                ...current.rating_settings,
                [category]: {
                    ...current.rating_settings?.[category],
                    [key]: Number(value),
                },
            },
        }));
    }

    async function changeMemberRole(member, role) {
        setManagementError(null);
        try {
            await clubApi.setMemberRole(club.id, member.userId, role);
            await loadMembers();
        } catch (err) {
            setManagementError(err.message || 'Failed to update member role');
        }
    }

    async function transferOwnership() {
        if (!transferTarget) return;
        setManagementError(null);
        try {
            await clubApi.transferOwnership(club.id, {
                newOwnerUserId: transferTarget,
                previousOwnerRole,
            });
            await refreshClub();
            await loadMembers();
            setTransferTarget('');
        } catch (err) {
            setManagementError(err.message || 'Failed to transfer ownership');
        }
    }

    async function archiveClub() {
        if (!confirm('Archive this club? It will become read-only until restored.')) return;
        setManagementError(null);
        try {
            await clubApi.archive(club.id);
            await refreshClub();
        } catch (err) {
            setManagementError(err.message || 'Failed to archive club');
        }
    }

    async function deleteClub() {
        if (!confirm('Delete this club? Historical chess records will be retained, but the club cannot be restored.')) return;
        setManagementError(null);
        try {
            await clubApi.delete(club.id);
            await refreshClub();
        } catch (err) {
            setManagementError(err.message || 'Failed to delete club');
        }
    }

    async function createInvite() {
        if (!club) return;
        setCreatingInvite(true);
        try {
            const inv = await clubApi.createInvite(club.id);
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

    async function reviewJoinRequest(requestId, action) {
        if (!club) return;
        try {
            let body = {};
            if (action === 'reject') {
                const reason = prompt('Optional rejection reason:');
                if (reason === null) return;
                body = reason.trim() ? { reason: reason.trim() } : {};
            }
            if (action === 'approve') await clubApi.approveJoinRequest(club.id, requestId);
            else await clubApi.rejectJoinRequest(club.id, requestId, body.reason);
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
        const reason = prompt('Optional revocation reason:');
        if (reason === null) return;
        try {
            await clubApi.revokeMember(club.id, member.userId, reason.trim() || undefined);
            await loadMembers();
        } catch (err) {
            alert(err.message || 'Failed to remove member');
        }
    }

    async function rotateJoinCode() {
        setJoinCodeLoading(true);
        setManagementError(null);
        try {
            const result = await clubApi.rotateJoinCode(club.id);
            setJoinCodeStatus(result.joinCode);
            setRevealedJoinCode(result.joinCode.code);
        } catch (err) {
            setManagementError(err.message || 'Failed to rotate join code');
        } finally {
            setJoinCodeLoading(false);
        }
    }

    async function revokeJoinCode() {
        if (!confirm('Disable the active join code?')) return;
        setJoinCodeLoading(true);
        setManagementError(null);
        try {
            await clubApi.revokeJoinCode(club.id);
            setJoinCodeStatus({ active: false });
            setRevealedJoinCode(null);
        } catch (err) {
            setManagementError(err.message || 'Failed to disable join code');
        } finally {
            setJoinCodeLoading(false);
        }
    }

    if (!club) return <div className="muted">No active club selected.</div>;

    return (
        <div className="club-page">
            <div className="page-header">
                <h1>Club: {club.name}</h1>
                <div className="club-stats">
                    {dashboard ? (
                        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                            Players: {dashboard.metrics?.rosterPlayers ?? 0} · Games: {dashboard.metrics?.totalGames ?? 0} · Rated: {dashboard.metrics?.ratedGames ?? 0}
                        </div>
                    ) : null}
                </div>
            </div>

            {managementError && <div className="error" role="alert">{managementError}</div>}

            {/* Tab buttons — Dashboard only visible to admins */}
            <div className="tabs">
                <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>Profile</button>
                <button className={activeTab === 'members' ? 'active' : ''} onClick={() => setActiveTab('members')}>Members</button>
                {isClubAdmin && (
                    <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
                )}
                {canExportData && (
                    <button className={activeTab === 'exports' ? 'active' : ''} onClick={() => setActiveTab('exports')}>Data exports</button>
                )}
            </div>

            {/* Profile tab — club info editing (name, federation, description, logo) */}
            {activeTab === 'profile' && (
                <div className="tab-panel profile-panel">
                    <label className="form-row">
                        <div className="label">Name</div>
                        <input className="input" disabled={!isOwner} value={profile?.name || ''} onChange={e => setProfile({ ...profile, name: e.target.value })} />
                    </label>

                    <label className="form-row">
                        <div className="label">Federation</div>
                        <input className="input" disabled={!isOwner} value={profile?.federation || ''} onChange={e => setProfile({ ...profile, federation: e.target.value })} />
                    </label>

                    <label className="form-row">
                        <div className="label">Description</div>
                        <textarea className="input" disabled={!isOwner} value={profile?.description || ''} onChange={e => setProfile({ ...profile, description: e.target.value })} />
                    </label>

                    <label className="form-row">
                        <div className="label">Club badge</div>
                        <input className="input" type="file" accept="image/jpeg,image/png,image/webp" disabled={!isOwner} onChange={e => setBadgeFile(e.target.files?.[0] || null)} />
                    </label>

                    <label className="form-row">
                        <div className="label">Contact information</div>
                        <input className="input" disabled={!isOwner} value={profile?.contact_info || ''} onChange={e => setProfile({ ...profile, contact_info: e.target.value })} />
                    </label>

                    <label className="form-row">
                        <div className="label">Visibility</div>
                        <select className="input" disabled={!isOwner} value={profile?.visibility || 'private'} onChange={e => setProfile({ ...profile, visibility: e.target.value })}>
                            <option value="public">Public</option>
                            <option value="private">Private</option>
                        </select>
                    </label>

                    <label className="form-row">
                        <div className="label">Public leaderboard</div>
                        <input type="checkbox" disabled={!isOwner} checked={Boolean(profile?.public_leaderboard)} onChange={e => setProfile({ ...profile, public_leaderboard: e.target.checked })} />
                    </label>

                    <label className="form-row">
                        <div className="label">Website</div>
                        <input className="input" disabled={!isOwner} value={profile?.settings_json?.contacts?.website || ''} onChange={e => updateStructuredSetting('contacts', 'website', e.target.value || null)} />
                    </label>

                    <label className="form-row">
                        <div className="label">Affiliation</div>
                        <input className="input" disabled={!isOwner} value={profile?.settings_json?.affiliation || ''} onChange={e => setProfile(current => ({ ...current, settings_json: { ...(current.settings_json || {}), affiliation: e.target.value || null } }))} />
                    </label>

                    <label className="form-row">
                        <div className="label">Presentation color</div>
                        <input type="color" disabled={!isOwner} value={profile?.settings_json?.presentation?.primaryColor || '#2563eb'} onChange={e => updateStructuredSetting('presentation', 'primaryColor', e.target.value)} />
                    </label>

                    <label className="form-row">
                        <div className="label">Allow notification email delivery</div>
                        <input type="checkbox" disabled={!isOwner} checked={Boolean(profile?.settings_json?.notifications?.emailEnabled)} onChange={e => updateStructuredSetting('notifications', 'emailEnabled', e.target.checked)} />
                    </label>

                    <label className="form-row">
                        <div className="label">Membership decision notifications</div>
                        <input type="checkbox" disabled={!isOwner} checked={profile?.settings_json?.notifications?.membershipEvents !== false} onChange={e => updateStructuredSetting('notifications', 'membershipEvents', e.target.checked)} />
                    </label>

                    <label className="form-row">
                        <div className="label">Player claim notifications</div>
                        <input type="checkbox" disabled={!isOwner} checked={profile?.settings_json?.notifications?.playerClaimEvents !== false} onChange={e => updateStructuredSetting('notifications', 'playerClaimEvents', e.target.checked)} />
                    </label>

                    <label className="form-row">
                        <div className="label">Match notifications</div>
                        <input type="checkbox" disabled={!isOwner} checked={profile?.settings_json?.notifications?.matchEvents !== false} onChange={e => updateStructuredSetting('notifications', 'matchEvents', e.target.checked)} />
                    </label>

                    <label className="form-row">
                        <div className="label">Tournament notifications</div>
                        <input type="checkbox" disabled={!isOwner} checked={profile?.settings_json?.notifications?.tournamentEvents !== false} onChange={e => updateStructuredSetting('notifications', 'tournamentEvents', e.target.checked)} />
                    </label>

                    <label className="form-row">
                        <div className="label">Announcement notifications</div>
                        <input type="checkbox" disabled={!isOwner} checked={profile?.settings_json?.notifications?.announcementEvents !== false} onChange={e => updateStructuredSetting('notifications', 'announcementEvents', e.target.checked)} />
                    </label>

                    {['blitz', 'rapid', 'classical'].map(category => (
                        <fieldset key={category} className="form-row" disabled={!isOwner}>
                            <legend>{category[0].toUpperCase() + category.slice(1)} Elo settings</legend>
                            <label>Initial rating <input type="number" value={profile?.rating_settings?.[category]?.initialRating ?? 1500} onChange={e => updateRatingSetting(category, 'initialRating', e.target.value)} /></label>
                            <label>Rating floor <input type="number" value={profile?.rating_settings?.[category]?.ratingFloor ?? 500} onChange={e => updateRatingSetting(category, 'ratingFloor', e.target.value)} /></label>
                            <label>Established K <input type="number" value={profile?.rating_settings?.[category]?.establishedKFactor ?? 32} onChange={e => updateRatingSetting(category, 'establishedKFactor', e.target.value)} /></label>
                            <label>Provisional K <input type="number" value={profile?.rating_settings?.[category]?.provisionalKFactor ?? 40} onChange={e => updateRatingSetting(category, 'provisionalKFactor', e.target.value)} /></label>
                            <label>Provisional games <input type="number" value={profile?.rating_settings?.[category]?.provisionalGames ?? 10} onChange={e => updateRatingSetting(category, 'provisionalGames', e.target.value)} /></label>
                        </fieldset>
                    ))}

                    {profile?.logo && <div className="logo-preview"><img src={resolveAssetUrl(profile.logo)} alt="Club badge" /></div>}

                    <div className="form-actions">
                        {isOwner ? (
                            <>
                                <Button onClick={saveProfile} disabled={savingSettings} className="mr-2">{savingSettings ? 'Saving...' : 'Save'}</Button>
                                <Button variant="secondary" onClick={() => setProfile(club)}>Reset</Button>
                            </>
                        ) : (
                            <div className="muted">Only the club owner can edit club settings.</div>
                        )}
                    </div>

                    {isOwner && (
                        <div className="dashboard-settings-card">
                            <h3>Ownership and lifecycle</h3>
                            <label className="form-row">
                                <div className="label">New owner</div>
                                <select className="input" value={transferTarget} onChange={e => setTransferTarget(e.target.value)}>
                                    <option value="">Select an active member</option>
                                    {members.filter(member => member.userId !== user?.id).map(member => (
                                        <option key={member.userId} value={member.userId}>{member.name || member.email} ({member.role})</option>
                                    ))}
                                </select>
                            </label>
                            <label className="form-row">
                                <div className="label">Your role after transfer</div>
                                <select className="input" value={previousOwnerRole} onChange={e => setPreviousOwnerRole(e.target.value)}>
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </label>
                            <div className="form-actions">
                                <Button onClick={transferOwnership} disabled={!transferTarget}>Transfer ownership</Button>
                                <Button variant="secondary" onClick={archiveClub}>Archive club</Button>
                                <Button variant="danger" onClick={deleteClub}>Delete club</Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Members tab — list of club members, remove option for admins */}
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
                                                {isOwner && m.role !== 'owner' && (
                                                    <Button
                                                        variant="secondary"
                                                        onClick={() => changeMemberRole(m, m.role === 'admin' ? 'member' : 'admin')}
                                                    >
                                                        {m.role === 'admin' ? 'Revoke admin' : 'Make admin'}
                                                    </Button>
                                                )}
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

            {activeTab === 'exports' && canExportData ? (
                <div className="tab-panel">
                    <DataExportPanel clubId={club.id} />
                </div>
            ) : activeTab === 'exports' ? (
                <div className="tab-panel">
                    <div style={{ padding: 'var(--gap-lg)', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Only club owners and admins can export club data.
                    </div>
                </div>
            ) : null}

            {/* Dashboard tab — admin only, includes stats + settings + admin actions */}
            {activeTab === 'dashboard' && isClubAdmin ? (
                <div className="tab-panel dashboard-panel">
                    {/* Club settings card (admin only) — same fields as Profile tab */}
                    <div className="dashboard-settings-card">
                        <h3>Club Settings (owner only)</h3>
                        <label className="form-row">
                            <div className="label">Name</div>
                            <input className="input" disabled={!isOwner} value={profile?.name || ''} onChange={e => setProfile({ ...profile, name: e.target.value })} />
                        </label>

                        <label className="form-row">
                            <div className="label">Federation</div>
                            <input className="input" disabled={!isOwner} value={profile?.federation || ''} onChange={e => setProfile({ ...profile, federation: e.target.value })} />
                        </label>

                        <label className="form-row">
                            <div className="label">Description</div>
                            <textarea className="input" disabled={!isOwner} value={profile?.description || ''} onChange={e => setProfile({ ...profile, description: e.target.value })} />
                        </label>

                        <label className="form-row">
                            <div className="label">Club badge</div>
                            <input className="input" type="file" accept="image/jpeg,image/png,image/webp" disabled={!isOwner} onChange={e => setBadgeFile(e.target.files?.[0] || null)} />
                        </label>

                        {profile?.logo && <div className="logo-preview"><img src={resolveAssetUrl(profile.logo)} alt="Club badge" /></div>}

                        <div className="form-actions">
                            <Button onClick={saveProfile} disabled={!isOwner || savingSettings} className="mr-2">Save</Button>
                            <Button variant="secondary" onClick={() => setProfile(club)}>Reset</Button>
                        </div>
                    </div>

                    {/* Dashboard stats — top players, recent matches, games by category */}
                    {dashboardLoading && <div className="muted">Loading stats…</div>}
                    {dashboardError && <div style={{ color: 'var(--danger)' }}>{dashboardError}</div>}
                    {!dashboardLoading && dashboard && (
                        <ClubDashboard data={dashboard} onCategoryChange={setDashboardCategory} />
                    )}

                    {/* Admin actions — invites & join requests */}
                    <div className="invite-section">
                        <div className="invite-label">Six-digit join code</div>
                        <div className="muted">
                            {joinCodeStatus.active
                                ? `Active since ${new Date(joinCodeStatus.createdAt).toLocaleString()}`
                                : 'No active join code'}
                        </div>
                        {revealedJoinCode && (
                            <div style={{ marginTop: 8 }}>
                                <code style={{ fontSize: 20, letterSpacing: 4 }}>{revealedJoinCode}</code>
                                <div className="muted">Copy this code now. It is stored securely and cannot be shown again.</div>
                            </div>
                        )}
                        <div className="invite-row" style={{ margin: '8px 0 20px' }}>
                            <Button onClick={rotateJoinCode} disabled={joinCodeLoading}>
                                {joinCodeLoading ? 'Updating…' : joinCodeStatus.active ? 'Rotate code' : 'Create code'}
                            </Button>
                            {joinCodeStatus.active && (
                                <Button variant="danger" style={{ marginLeft: 8 }} onClick={revokeJoinCode} disabled={joinCodeLoading}>Disable code</Button>
                            )}
                        </div>

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
                                                    await clubApi.revokeInvite(club.id, i.id);
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
                                        <div>
                                            <strong>{request.name || request.email}</strong>
                                            {request.message ? <div className="muted">{request.message}</div> : null}
                                            {request.createdAt ? <div className="muted">Requested {new Date(request.createdAt).toLocaleString()}</div> : null}
                                        </div>
                                        <div style={{ marginLeft: 'auto' }}>
                                            <Button onClick={() => reviewJoinRequest(request.id, 'approve')}>Approve</Button>
                                            <Button variant="danger" style={{ marginLeft: 8 }} onClick={() => reviewJoinRequest(request.id, 'reject')}>Reject</Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            ) : activeTab === 'dashboard' ? (
                <div className="tab-panel">
                    <div style={{ padding: 'var(--gap-lg)', textAlign: 'center', color: 'var(--text-muted)' }}>
                        You do not have permission to view the dashboard. Only club admins can access this page.
                    </div>
                </div>
            ) : null}
        </div>
    );
}
