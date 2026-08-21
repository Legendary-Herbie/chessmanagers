import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { resolveAssetUrl } from '../../config/api.js';
import { useAuth, useNotifications } from '../../app/contextHooks.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';
import { leaderboardApi } from '../../features/leaderboard/api/leaderboardApi.js';

export default function PublicClubPage() {
    const { clubId } = useParams();
    const [club, setClub] = useState(null);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState(null);

    // admin-only pieces
    const [membersCount, setMembersCount] = useState(null);
    const [invites, setInvites] = useState([]);
    const [joinRequests, setJoinRequests] = useState([]);
    const [stats, setStats] = useState(null);
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [topPlayers, setTopPlayers] = useState([]);

    const { user } = useAuth();
    const { notify } = useNotifications();

    const navigate = useNavigate();

    useEffect(() => {
        // If the route param is accidentally the literal 'join', redirect to the invite handler
        if (clubId === 'join') {
            navigate('/clubs/join' + window.location.search, { replace: true });
            return;
        }

        async function load() {
            setLoading(true);
            try {
                const c = await clubApi.fetchPresentation(clubId);
                setClub(c);

                if (c?.visibility === 'public' && c.public_leaderboard) {
                    try {
                        const leaderboard = await leaderboardApi.fetchPublicLeaderboard(
                            clubId, { category: 'blitz', limit: 5 }
                        );
                        setTopPlayers(leaderboard.entries);
                    } catch {
                        setTopPlayers([]);
                    }
                }

                // Try to fetch admin-only pieces; if they fail (403), ignore silently
                if (user) {
                    // members list (admin only)
                    try {
                        setMembersCount((await clubApi.fetchMembers(clubId)).length);
                    } catch {
                        // not admin — skip
                    }

                    // invites (admin only)
                    try {
                        setInvites(await clubApi.fetchInvites(clubId));
                    } catch {
                        // skip
                    }

                    // join-requests (admin only)
                    try {
                        setJoinRequests(await clubApi.fetchJoinRequests(clubId));
                    } catch {
                        // skip
                    }

                    // stats (admin only)
                    try {
                        setStats(await leaderboardApi.fetchStats(clubId));
                    } catch {
                        // skip
                    }
                }
            } catch (err) {
                setError(err?.message || 'Failed to load club');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [clubId, user, navigate]);

    async function handleRequestJoin() {
        if (!user) return; // UI should not show for guests
        setJoining(true);
        try {
            const result = await clubApi.requestJoin(clubId);
            setClub(current => current ? {
                ...current,
                membership: result.membership,
                join_request_pending: true,
                can_request_join: false,
            } : current);
            notify('Join request submitted — club admins will review.', 'success');
        } catch (err) {
            notify(err?.message || 'Failed to request to join', 'error');
        } finally {
            setJoining(false);
        }
    }

    async function createInvite() {
        setCreatingInvite(true);
        try {
            const inv = await clubApi.createInvite(clubId);
            if (inv?.token) {
                setInvites(prev => [inv, ...prev]);
                // Copy link to clipboard
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

    async function revokeInvite(inviteId) {
        try {
            await clubApi.revokeInvite(clubId, inviteId);
            setInvites(prev => prev.filter(i => i.id !== inviteId));
            notify('Invite revoked', 'info');
        } catch (err) {
            notify(err?.message || 'Failed to revoke invite', 'error');
        }
    }

    async function approveRequest(requestId) {
        try {
            await clubApi.approveJoinRequest(clubId, requestId);
            setJoinRequests(prev => prev.filter(r => r.id !== requestId));
            notify('Join request approved', 'success');
        } catch (err) {
            notify(err?.message || 'Failed to approve', 'error');
        }
    }

    async function rejectRequest(requestId) {
        try {
            await clubApi.rejectJoinRequest(clubId, requestId);
            setJoinRequests(prev => prev.filter(r => r.id !== requestId));
            notify('Join request rejected', 'info');
        } catch (err) {
            notify(err?.message || 'Failed to reject', 'error');
        }
    }

    if (loading) return <p>Loading club…</p>;
    if (error) return <p style={{ color: 'var(--danger)' }}>Error: {error}</p>;
    if (!club) return <p>Club not found.</p>;

    const isMember = club.is_member || false; // server may include this flag via ClubModel.findById
    const membershipStatus = club.membership?.status || null;
    const cooldownEndsAt = club.membership?.cooldownEndsAt;

    return (
        <div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                {club.logo ? (
                    <img src={resolveAssetUrl(club.logo)} alt={`${club.name} badge`} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8 }} />
                ) : (
                    <div style={{ width: 96, height: 96, background: 'var(--bg-muted)', borderRadius: 8 }} />
                )}

                <div>
                    <h1 style={{ margin: 0 }}>{club.name}</h1>
                    <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{club.federation || ''}</div>
                    <div style={{ color: 'var(--text-muted)', marginTop: 6 }}>
                        {membersCount !== null ? `${membersCount} members` : null}
                        {stats ? ` · ${stats.rosterPlayers} players · ${stats.totalGames} games` : null}
                    </div>
                </div>

                <div style={{ marginLeft: 'auto' }}>
                    {isMember ? (
                        <span style={{ color: 'var(--success)' }}>You are a member</span>
                    ) : membershipStatus === 'PENDING_APPROVAL' ? (
                        <span className="muted">Join request pending</span>
                    ) : membershipStatus === 'REJECTED' && !club.can_request_join ? (
                        <span className="muted">
                            Reapply after {cooldownEndsAt ? new Date(cooldownEndsAt).toLocaleString() : 'the cooldown'}
                        </span>
                    ) : user ? (
                        <button type="button" disabled={joining || !club.can_request_join} onClick={handleRequestJoin} style={{ padding: '8px 12px' }}>
                            {joining ? 'Requesting…' : membershipStatus === 'REVOKED' || membershipStatus === 'REJECTED' ? 'Request to rejoin' : 'Request to join'}
                        </button>
                    ) : (
                        <div>
                            <Link to={`/auth/login`}>Sign in</Link>
                            {' '}or{' '}
                            <Link to={`/auth/register`}>Register to join</Link>
                        </div>
                    )}
                </div>
            </div>

            <section style={{ marginTop: 18 }}>
                <h2>About</h2>
                <p>{club.description || 'No description provided.'}</p>

                {club.contact_info && (
                    <div>
                        <h3>Contact</h3>
                        <div>{club.contact_info}</div>
                    </div>
                )}

                <div style={{ marginTop: 12 }}>
                    <Link to="/clubs">← Back to clubs</Link>
                </div>
            </section>

            {topPlayers.length > 0 && <section style={{ marginTop: 18 }}>
                <h2>Top Blitz Players</h2>
                <ol>{topPlayers.map(player => <li key={player.publicPlayerId}>
                    <Link to={`/clubs/${clubId}/players/${player.publicPlayerId}`}>{player.playerName}</Link>
                    {' '}— {player.selectedRating}
                </li>)}</ol>
            </section>}

            {/* Admin area: invites and join requests */}
            {(club.member_role === 'owner' || club.member_role === 'admin') && (
                <section style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <h3>Administration</h3>

                    <div style={{ marginBottom: 12 }}>
                        <button type="button" disabled={creatingInvite} onClick={createInvite} style={{ padding: '6px 10px' }}>
                            {creatingInvite ? 'Creating…' : 'Create invite'}
                        </button>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <strong>Active invites</strong>
                        {invites.length === 0 ? (
                            <div>No active invites.</div>
                        ) : (
                            <ul>
                                {invites.map(i => (
                                    <li key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <div style={{ fontSize: 12 }}>{i.token}</div>
                                        <div style={{ marginLeft: 'auto' }}>
                                            <button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/clubs/join?token=${i.token}`)}>Copy</button>
                                            <button type="button" onClick={() => revokeInvite(i.id)} style={{ marginLeft: 8 }}>Revoke</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div>
                        <strong>Join requests</strong>
                        {joinRequests.length === 0 ? (
                            <div>No pending requests.</div>
                        ) : (
                            <ul>
                                {joinRequests.map(r => (
                                    <li key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <div>
                                            <div><strong>{r.name || r.email}</strong></div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.message || ''}</div>
                                        </div>
                                        <div style={{ marginLeft: 'auto' }}>
                                            <button onClick={() => approveRequest(r.id)}>Approve</button>
                                            <button onClick={() => rejectRequest(r.id)} style={{ marginLeft: 8 }}>Reject</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                </section>
            )}
        </div>
    );
}
