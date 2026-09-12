import ShareControls from '../../features/clubs/components/ShareControls.jsx';
import Disclosure from '../../shared/common/Disclosure.jsx';
import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import '../../styles/club.css';
import Button from '../../shared/common/Button.jsx';
import { resolveAssetUrl } from '../../config/api.js';
import { useClub, useAuth, useNotifications } from '../../app/contextHooks.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';
import {
    mapClubProfileApiErrors,
    validateClubProfile,
    validateClubRatingSettings,
} from '../../features/clubs/clubProfileValidation.js';
import DataExportPanel from '../../features/exports/components/DataExportPanel.jsx';
import { canRemoveClubMember } from '../../features/clubs/membership/memberActionPermissions.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import UnsavedChangesWarning from '../../shared/common/UnsavedChangesWarning.jsx';
import CopyPublicLink from '../../shared/common/CopyPublicLink.jsx';

const profileFieldId = field => `club-profile-${field.replaceAll('.', '-')}`;
const PROFILE_FIELD_LABELS = {
    name: 'Name',
    federation: 'Federation',
    description: 'Description',
    badgeFile: 'Club badge',
    contactInfo: 'Contact information',
    website: 'Website',
    email: 'Public email',
    phone: 'Public phone',
    address: 'Location / address',
    affiliation: 'Affiliation',
    primaryColor: 'Presentation color',
};
const RATING_FIELD_LABELS = {
    initialRating: 'initial rating',
    ratingFloor: 'rating floor',
    establishedKFactor: 'established K-factor',
    provisionalKFactor: 'provisional K-factor',
    provisionalGames: 'provisional games',
};

function profileFieldLabel(field) {
    if (PROFILE_FIELD_LABELS[field]) return PROFILE_FIELD_LABELS[field];
    const [, category, key] = field.split('.');
    if (category && RATING_FIELD_LABELS[key]) {
        return `${category[0].toUpperCase()}${category.slice(1)} ${RATING_FIELD_LABELS[key]}`;
    }
    return field;
}

function ProfileFieldError({ field, errors }) {
    const message = errors[field];
    if (!message) return null;
    return <div className="profile-field-error" id={`${profileFieldId(field)}-error`}>{message}</div>;
}

export default function ClubPage() {
    const { club, capabilities, refreshClub } = useClub();
    const { user } = useAuth();
    const { notify } = useNotifications();
    const [searchParams, setSearchParams] = useSearchParams();

    // Read active tab from URL params, default to 'profile'
    const activeTab = searchParams.get('tab') || 'profile';
    const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });

    const [profile, setProfile] = useState(null);
    const [savedProfile, setSavedProfile] = useState(null);
    const [badgeFile, setBadgeFile] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [shareMode, setShareMode] = useState('code');
    const [invites, setInvites] = useState([]);
    const [savingSettings, setSavingSettings] = useState(false);
    const [managementError, setManagementError] = useState(null);
    const [profileErrors, setProfileErrors] = useState({});
    const [transferTarget, setTransferTarget] = useState('');
    const [previousOwnerRole, setPreviousOwnerRole] = useState('member');
    const [joinCodeStatus, setJoinCodeStatus] = useState({ active: false });
    const [revealedJoinCode, setRevealedJoinCode] = useState(null);
    const [joinCodeLoading, setJoinCodeLoading] = useState(false);
    const [dialogAction, setDialogAction] = useState(null);
    const [dialogReason, setDialogReason] = useState('');
    const [dialogBusy, setDialogBusy] = useState(false);

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
        setSavedProfile(club);
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

    function clearProfileError(field) {
        setProfileErrors(current => {
            if (!current[field]) return current;
            const next = { ...current };
            delete next[field];
            return next;
        });
    }

    function validationProps(field) {
        return {
            id: profileFieldId(field),
            'aria-label': profileFieldLabel(field),
            'aria-invalid': Boolean(profileErrors[field]),
            'aria-describedby': profileErrors[field] ? `${profileFieldId(field)}-error` : undefined,
        };
    }

    function focusFirstProfileError(errors) {
        const firstField = Object.keys(errors).find(field => field !== '_form');
        if (!firstField) return;
        requestAnimationFrame(() => document.getElementById(profileFieldId(firstField))?.focus());
    }

    async function saveProfile(event) {
        event?.preventDefault();
        if (!club || !isClubAdmin) return;
        const validation = activeTab === 'ratings' ? validateClubRatingSettings(profile.rating_settings)
            : activeTab === 'notifications' ? { success: true, data: {} }
                : validateClubProfile(profile, { isOwner: false, badgeFile });
        if (!validation.success) {
            setProfileErrors(validation.errors);
            setManagementError('Please correct the highlighted club profile fields.');
            focusFirstProfileError(validation.errors);
            return;
        }

        setSavingSettings(true);
        setManagementError(null);
        setProfileErrors({});
        try {
            const values = validation.data;
            if (activeTab === 'notifications') {
                await clubApi.update(club.id, { settings: { notifications: profile.settings_json?.notifications || {} } });
            } else if (activeTab === 'ratings') {
                await clubApi.update(club.id, { ratingSettings: validation.data });
            } else {
                const presentation = {
                    federation: values.federation,
                    description: values.description,
                    contactInfo: values.contactInfo,
                    settings: {
                        contacts: values.contacts,
                        affiliation: values.affiliation,
                        presentation: {
                            ...(profile.settings_json?.presentation || {}),
                            primaryColor: values.primaryColor,
                        },
                    },
                };
                if (isOwner) {
                    await clubApi.update(club.id, {
                        name: values.name,
                        ...presentation,
                        visibility: profile.visibility,
                        publicLeaderboard: Boolean(profile.public_leaderboard),
                    });
                } else {
                    await clubApi.updatePresentation(club.id, presentation);
                }
                if (badgeFile) {
                    await clubApi.uploadBadge(club.id, badgeFile);
                    setBadgeFile(null);
                }
            }
            setSavedProfile(profile);
            await refreshClub();
            notify(`${activeTab === 'ratings' ? 'Rating rules' : activeTab === 'notifications' ? 'Notifications' : 'Club profile'} saved.`, 'success');
        } catch (err) {
            const fieldErrors = mapClubProfileApiErrors(err?.errors);
            if (Object.keys(fieldErrors).length > 0) {
                setProfileErrors(fieldErrors);
                setManagementError('Please correct the highlighted club profile fields.');
                focusFirstProfileError(fieldErrors);
            } else {
                setManagementError(err.message || 'Failed to update club');
            }
        } finally {
            setSavingSettings(false);
        }
    }

    function updateStructuredSetting(section, key, value) {
        clearProfileError(key === 'primaryColor' ? 'primaryColor' : key);
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
        clearProfileError(`ratingSettings.${category}.${key}`);
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

    function openDialog(action) {
        setDialogReason('');
        setDialogAction(action);
    }

    function archiveClub() {
        openDialog({
            kind: 'archiveClub', title: 'Archive club', confirmLabel: 'Archive club', variant: 'warning',
            message: 'Archive this club? It will become read-only until restored.',
        });
    }

    function deleteClub() {
        openDialog({
            kind: 'deleteClub', title: 'Delete club', confirmLabel: 'Delete club', variant: 'danger',
            message: 'Permanently delete this club and all its players, matches, ratings, tournaments, announcements, and uploaded files? User accounts and other clubs will remain. This cannot be undone.',
        });
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
                notify('Invite created and copied to clipboard', 'success');
            } else {
                notify('Invite created', 'success');
            }
        } catch (err) {
            notify(err?.message || 'Failed to create invite', 'error');
        } finally {
            setCreatingInvite(false);
        }
    }

    function removeMember(member) {
        if (member.role === 'owner') { notify('The club owner cannot be removed.', 'error'); return; }
        if (member.userId === user?.id) { notify('You cannot remove yourself from this screen.', 'error'); return; }
        openDialog({
            kind: 'removeMember', member, title: 'Remove club member', confirmLabel: 'Remove member',
            variant: 'danger', message: `Remove ${member.email} from the club?`, reasonLabel: 'Reason (optional)',
        });
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

    function revokeJoinCode() {
        openDialog({
            kind: 'revokeJoinCode', title: 'Disable join code', confirmLabel: 'Disable code', variant: 'danger',
            message: 'Disable the active join code? Members will no longer be able to use it.',
        });
    }

    function revokeInvite(invite) {
        openDialog({
            kind: 'revokeInvite', invite, title: 'Revoke invite', confirmLabel: 'Revoke invite', variant: 'danger',
            message: 'Revoke this invite? Anyone with its link will no longer be able to use it.',
        });
    }

    async function confirmDialogAction() {
        if (!dialogAction || !club) return;
        const action = dialogAction;
        const reason = dialogReason.trim() || undefined;
        setDialogBusy(true);
        setManagementError(null);
        try {
            if (action.kind === 'archiveClub') {
                await clubApi.archive(club.id);
                await refreshClub();
                notify('Club archived', 'success');
            } else if (action.kind === 'deleteClub') {
                await clubApi.delete(club.id);
                await refreshClub();
                notify('Club deleted', 'success');
            } else if (action.kind === 'removeMember') {
                await clubApi.revokeMember(club.id, action.member.userId, reason);
                await loadMembers();
                notify('Member removed', 'success');
            } else if (action.kind === 'revokeJoinCode') {
                setJoinCodeLoading(true);
                await clubApi.revokeJoinCode(club.id);
                setJoinCodeStatus({ active: false });
                setRevealedJoinCode(null);
                notify('Join code disabled', 'success');
            } else if (action.kind === 'revokeInvite') {
                await clubApi.revokeInvite(club.id, action.invite.id);
                setInvites(current => current.filter(invite => invite.id !== action.invite.id));
                notify('Invite revoked', 'success');
            }
            setDialogAction(null);
            setDialogReason('');
        } catch (err) {
            notify(err?.message || 'The club action could not be completed.', 'error');
        } finally {
            setDialogBusy(false);
            setJoinCodeLoading(false);
        }
    }

    if (!club) return <div className="muted">No active club selected.</div>;
    if (activeTab === 'dashboard') return <Navigate to="/dashboard" replace />;

    return (
        <div className="club-page">
            <div className="page-header">
                <h1>Club: {club.name}</h1>
            </div>

            {managementError && <div className="error" role="alert">{managementError}</div>}

            {/* Club profile and administration tabs. Operational work lives on the main dashboard. */}
            <div className="tabs">
                <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>Club profile</button>
                {isOwner && ['notifications', 'ratings', 'ownership'].map(tab => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab === 'ratings' ? 'Rating rules' : tab === 'ownership' ? 'Ownership' : 'Notifications'}</button>)}
                {isClubAdmin && (
                    <button className={activeTab === 'members' ? 'active' : ''} onClick={() => setActiveTab('members')}>Members &amp; access</button>
                )}
                {canExportData && (
                    <button className={activeTab === 'exports' ? 'active' : ''} onClick={() => setActiveTab('exports')}>Data exports</button>
                )}
            </div>

            {/* Profile tab — club info editing (name, federation, description, logo) */}
            {(activeTab === 'profile' || isOwner && ['notifications', 'ratings', 'ownership'].includes(activeTab)) && (
                <div className="tab-panel profile-panel">
                    {activeTab !== 'ownership' && <form noValidate onSubmit={saveProfile}>
                    <fieldset disabled={savingSettings} className="form-fieldset">
                    {activeTab === 'profile' && <>
                    <label className="form-row">
                        <div className="label">Name</div>
                        <input {...validationProps('name')} className="input" maxLength={150} disabled={!isOwner} value={profile?.name || ''} onChange={e => { clearProfileError('name'); setProfile({ ...profile, name: e.target.value }); }} />
                        <ProfileFieldError field="name" errors={profileErrors} />
                    </label>

                    <label className="form-row">
                        <div className="label">Federation</div>
                        <input {...validationProps('federation')} className="input" maxLength={100} disabled={!isClubAdmin} value={profile?.federation || ''} onChange={e => { clearProfileError('federation'); setProfile({ ...profile, federation: e.target.value }); }} />
                        <ProfileFieldError field="federation" errors={profileErrors} />
                    </label>

                    <label className="form-row">
                        <div className="label">Description</div>
                        <textarea {...validationProps('description')} className="input" maxLength={1000} disabled={!isClubAdmin} value={profile?.description || ''} onChange={e => { clearProfileError('description'); setProfile({ ...profile, description: e.target.value }); }} />
                        <ProfileFieldError field="description" errors={profileErrors} />
                    </label>

                    <label className="form-row">
                        <div className="label">Club badge</div>
                        <input {...validationProps('badgeFile')} className="input" type="file" accept="image/jpeg,image/png,image/webp" disabled={!isClubAdmin} onChange={e => { clearProfileError('badgeFile'); setBadgeFile(e.target.files?.[0] || null); }} />
                        <div className="form-helper">JPEG, PNG, or WebP; maximum 5 MB.</div>
                        <ProfileFieldError field="badgeFile" errors={profileErrors} />
                    </label>

                    <label className="form-row">
                        <div className="label">Contact information</div>
                        <input {...validationProps('contactInfo')} className="input" maxLength={500} disabled={!isClubAdmin} value={profile?.contact_info || ''} onChange={e => { clearProfileError('contactInfo'); setProfile({ ...profile, contact_info: e.target.value }); }} />
                        <ProfileFieldError field="contactInfo" errors={profileErrors} />
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
                        <input {...validationProps('website')} className="input" type="url" maxLength={500} placeholder="https://example.org" disabled={!isClubAdmin} value={profile?.settings_json?.contacts?.website || ''} onChange={e => updateStructuredSetting('contacts', 'website', e.target.value || null)} />
                        <ProfileFieldError field="website" errors={profileErrors} />
                    </label>

                    <label className="form-row">
                        <div className="label">Public email</div>
                        <input {...validationProps('email')} className="input" type="email" maxLength={320} disabled={!isClubAdmin} value={profile?.settings_json?.contacts?.email || ''} onChange={e => updateStructuredSetting('contacts', 'email', e.target.value || null)} />
                        <ProfileFieldError field="email" errors={profileErrors} />
                    </label>

                    <label className="form-row">
                        <div className="label">Public phone</div>
                        <input {...validationProps('phone')} className="input" type="tel" maxLength={50} disabled={!isClubAdmin} value={profile?.settings_json?.contacts?.phone || ''} onChange={e => updateStructuredSetting('contacts', 'phone', e.target.value || null)} />
                        <ProfileFieldError field="phone" errors={profileErrors} />
                    </label>

                    <label className="form-row">
                        <div className="label">Location / address</div>
                        <input {...validationProps('address')} className="input" maxLength={500} disabled={!isClubAdmin} value={profile?.settings_json?.contacts?.address || ''} onChange={e => updateStructuredSetting('contacts', 'address', e.target.value || null)} />
                        <ProfileFieldError field="address" errors={profileErrors} />
                    </label>

                    <label className="form-row">
                        <div className="label">Affiliation</div>
                        <input {...validationProps('affiliation')} className="input" maxLength={200} disabled={!isClubAdmin} value={profile?.settings_json?.affiliation || ''} onChange={e => { clearProfileError('affiliation'); setProfile(current => ({ ...current, settings_json: { ...(current.settings_json || {}), affiliation: e.target.value || null } })); }} />
                        <ProfileFieldError field="affiliation" errors={profileErrors} />
                    </label>

                    <label className="form-row">
                        <div className="label">Presentation color</div>
                        <input {...validationProps('primaryColor')} type="color" disabled={!isClubAdmin} value={profile?.settings_json?.presentation?.primaryColor || '#2563eb'} onChange={e => updateStructuredSetting('presentation', 'primaryColor', e.target.value)} />
                        <ProfileFieldError field="primaryColor" errors={profileErrors} />
                    </label>

                    </>}
                    {activeTab === 'notifications' && <>
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

                    </>}
                    {activeTab === 'ratings' && <>
                    <h2>Rating rules</h2><p className="muted">Blitz, Rapid, and Classical use independent Elo ratings.</p>
                    <Disclosure forceOpen={Object.keys(profileErrors).some(field => field.startsWith('ratingSettings.'))} title="Advanced rating controls">
                    {['blitz', 'rapid', 'classical'].map(category => {
                        const field = key => `ratingSettings.${category}.${key}`;
                        return (
                            <fieldset key={category} className="form-row rating-settings" disabled={!isOwner}>
                                <legend>{category[0].toUpperCase() + category.slice(1)} Elo settings</legend>
                                <label>Initial rating
                                    <input {...validationProps(field('initialRating'))} type="number" min="100" max="4000" step="1" value={profile?.rating_settings?.[category]?.initialRating ?? 1500} onChange={e => updateRatingSetting(category, 'initialRating', e.target.value)} />
                                    <ProfileFieldError field={field('initialRating')} errors={profileErrors} />
                                </label>
                                <label>Rating floor
                                    <input {...validationProps(field('ratingFloor'))} type="number" min="0" max="4000" step="1" value={profile?.rating_settings?.[category]?.ratingFloor ?? 500} onChange={e => updateRatingSetting(category, 'ratingFloor', e.target.value)} />
                                    <ProfileFieldError field={field('ratingFloor')} errors={profileErrors} />
                                </label>
                                <label>Established K
                                    <input {...validationProps(field('establishedKFactor'))} type="number" min="1" max="100" step="1" value={profile?.rating_settings?.[category]?.establishedKFactor ?? 32} onChange={e => updateRatingSetting(category, 'establishedKFactor', e.target.value)} />
                                    <ProfileFieldError field={field('establishedKFactor')} errors={profileErrors} />
                                </label>
                                <label>Provisional K
                                    <input {...validationProps(field('provisionalKFactor'))} type="number" min="1" max="100" step="1" value={profile?.rating_settings?.[category]?.provisionalKFactor ?? 40} onChange={e => updateRatingSetting(category, 'provisionalKFactor', e.target.value)} />
                                    <ProfileFieldError field={field('provisionalKFactor')} errors={profileErrors} />
                                </label>
                                <label>Provisional games
                                    <input {...validationProps(field('provisionalGames'))} type="number" min="1" max="100" step="1" value={profile?.rating_settings?.[category]?.provisionalGames ?? 10} onChange={e => updateRatingSetting(category, 'provisionalGames', e.target.value)} />
                                    <ProfileFieldError field={field('provisionalGames')} errors={profileErrors} />
                                </label>
                            </fieldset>
                        );
                    })}

                    </Disclosure></>}
                    {activeTab === 'profile' && profile?.logo && <div className="logo-preview"><img src={resolveAssetUrl(profile.logo)} alt="Club badge" /></div>}

                    <div className="form-actions">
                        {isClubAdmin ? (
                            <>
                                <Button type="submit" disabled={savingSettings} className="mr-2">{savingSettings ? 'Saving...' : activeTab === 'ratings' ? 'Save rating rules' : activeTab === 'notifications' ? 'Save notifications' : 'Save'}</Button>
                                <Button variant="secondary" disabled={savingSettings} onClick={() => { setProfile(savedProfile); setBadgeFile(null); setProfileErrors({}); setManagementError(null); }}>Reset</Button>
                            </>
                        ) : (
                            <div className="muted">Only club owners and admins can edit the public club presentation.</div>
                        )}
                    </div>
                    </fieldset>
                    </form>}
                    {activeTab === 'profile' && club.visibility === 'public' && <CopyPublicLink path={`/clubs/${club.id}`} />}
                    <UnsavedChangesWarning dirty={Boolean(profile && savedProfile && (badgeFile || JSON.stringify(profile) !== JSON.stringify(savedProfile)))} saving={savingSettings}
                        onDiscard={() => { setProfile(savedProfile); setBadgeFile(null); setProfileErrors({}); }} />

                    {isOwner && activeTab === 'ownership' && (
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

            {/* Member roster and access methods are restricted to owners/admins. */}
            {activeTab === 'members' && isClubAdmin ? (
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
                                                {canRemoveClubMember(m, user?.id) && (
                                                    <Button variant="danger" onClick={() => removeMember(m)}>Remove</Button>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {members.length === 0 && <tr><td colSpan={isClubAdmin ? 4 : 3} className="muted">No members</td></tr>}
                            </tbody>
                        </table>
                    )}

                    <section className="invite-section invite-share-hub">
                        <h2>Invite & share</h2>
                        <p className="muted">Share a code or invite link to bring people into your club.</p>
                        <div className="discovery-switch" role="group" aria-label="Share club using">
                            <Button variant={shareMode === 'code' ? 'primary' : 'secondary'} aria-pressed={shareMode === 'code'} onClick={() => setShareMode('code')}>Join code</Button>
                            <Button variant={shareMode === 'link' ? 'primary' : 'secondary'} aria-pressed={shareMode === 'link'} onClick={() => setShareMode('link')}>Invite link</Button>
                        </div>
                        <div hidden={shareMode !== 'code'} className="share-method">
                        <div className="invite-label">Six-digit join code</div>
                        <div className="muted">
                            {joinCodeStatus.active
                                ? `Active since ${new Date(joinCodeStatus.createdAt).toLocaleString()}`
                                : 'No active join code'}
                        </div>
                        {revealedJoinCode && (
                            <div className="share-code">
                                <code>{revealedJoinCode}</code>
                                <ShareControls value={revealedJoinCode} label="Code" qrValue={`${window.location.origin}/clubs?joinCode=${encodeURIComponent(revealedJoinCode)}`} />
                                <div className="muted">Copy this code now. It is stored securely and cannot be shown again.</div>
                            </div>
                        )}
                        <div className="invite-row share-actions">
                            <Button onClick={rotateJoinCode} disabled={joinCodeLoading}>
                                {joinCodeLoading ? 'Updating…' : joinCodeStatus.active ? 'Rotate code' : 'Create code'}
                            </Button>
                            {joinCodeStatus.active && (
                                <Button variant="danger" onClick={revokeJoinCode} disabled={joinCodeLoading}>Disable code</Button>
                            )}
                        </div>

                        </div>
                        <div hidden={shareMode !== 'link'} className="share-method">
                        <div className="invite-label">Invite links</div>
                        <div className="invite-row share-actions">
                            <Button onClick={createInvite} disabled={creatingInvite}>{creatingInvite ? 'Creating…' : 'Create invite'}</Button>
                        </div>

                        {invites.length === 0 ? (
                            <div className="muted">No active invites</div>
                        ) : (
                            <ul className="invite-list">
                                {invites.map(invite => (
                                    <li key={invite.id} className="invite-item">
                                        <span className="muted">Club invite</span>
                                        <div className="share-invite-actions">
                                            <ShareControls value={`${window.location.origin}/clubs/join?token=${encodeURIComponent(invite.token)}`} />
                                            <Button variant="danger" onClick={() => revokeInvite(invite)}>Revoke</Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        </div>
                    </section>
                </div>
            ) : activeTab === 'members' ? (
                <div className="tab-panel">
                    <div className="muted">Only club owners and admins can manage members and club access.</div>
                </div>
            ) : null}

            {activeTab === 'exports' && canExportData ? (
                <div className="tab-panel">
                    <DataExportPanel clubId={club.id} />
                </div>
            ) : activeTab === 'exports' ? (
                <div className="tab-panel">
                    <div className="page-empty">
                        Only club owners and admins can export club data.
                    </div>
                </div>
            ) : null}

            <ConfirmDialog isOpen={Boolean(dialogAction)} title={dialogAction?.title}
                message={dialogAction?.message} confirmLabel={dialogAction?.confirmLabel}
                variant={dialogAction?.variant} loading={dialogBusy}
                onClose={() => {
                    if (!dialogBusy) {
                        setDialogAction(null);
                        setDialogReason('');
                    }
                }}
                onConfirm={confirmDialogAction}>
                {dialogAction?.reasonLabel && <label className="form-row">
                    <span className="label">{dialogAction.reasonLabel}</span>
                    <textarea className="input" maxLength={500} value={dialogReason}
                        onChange={event => setDialogReason(event.target.value)} />
                </label>}
            </ConfirmDialog>
        </div>
    );
}
