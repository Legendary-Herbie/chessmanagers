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

    if (loading) return <section className="public-panel public-state" role="status">
        <h1>Loading club…</h1><p>Retrieving the club’s public information.</p>
    </section>;
    if (error) return <section className="public-panel public-state public-state--error" role="alert">
        <h1>Club could not be loaded</h1><p>{error}</p><Link className="public-back-link" to="/clubs">Back to clubs</Link>
    </section>;
    if (!club) return <section className="public-panel public-state">
        <h1>Club not found</h1><p>This club is unavailable or is not public.</p><Link className="public-back-link" to="/clubs">Back to clubs</Link>
    </section>;

    const isMember = club.is_member || false; // server may include this flag via ClubModel.findById
    const membershipStatus = club.membership?.status || null;
    const cooldownEndsAt = club.membership?.cooldownEndsAt;
    const returnTo = `/clubs/${clubId}`;
    const authQuery = `?returnTo=${encodeURIComponent(returnTo)}`;

    return (
        <div className="public-page">
            <header className="public-card public-club-hero">
                {club.logo ? (
                    <img className="public-club-hero__logo" src={resolveAssetUrl(club.logo)} alt={`${club.name} badge`} />
                ) : (
                    <div className="public-club-hero__placeholder" aria-hidden="true" />
                )}

                <div>
                    <h1>{club.name}</h1>
                    <p>{club.federation || 'Independent club'}</p>
                    <p>
                        {membersCount !== null ? `${membersCount} members` : null}
                        {stats ? ` · ${stats.rosterPlayers} players · ${stats.totalGames} games` : null}
                    </p>
                </div>

                <div className="public-club-hero__actions">
                    {isMember ? (
                        <span className="public-membership-state public-membership-state--success">You are a member</span>
                    ) : membershipStatus === 'PENDING_APPROVAL' ? (
                        <span className="public-membership-state">Join request pending</span>
                    ) : membershipStatus === 'REJECTED' && !club.can_request_join ? (
                        <span className="public-membership-state">
                            Reapply after {cooldownEndsAt ? new Date(cooldownEndsAt).toLocaleString() : 'the cooldown'}
                        </span>
                    ) : user ? (
                        <button className="public-button" type="button" disabled={joining || !club.can_request_join} onClick={handleRequestJoin}>
                            {joining ? 'Requesting…' : membershipStatus === 'REVOKED' || membershipStatus === 'REJECTED' ? 'Request to rejoin' : 'Request to join'}
                        </button>
                    ) : (
                        <><Link className="public-link-button public-button--secondary" to={`/auth/login${authQuery}`}>Sign in</Link>
                            <Link className="public-link-button" to={`/auth/register${authQuery}`}>Register to join</Link></>
                    )}
                </div>
            </header>

            <div className="public-content-grid">
                <section className="public-card public-section">
                    <h2>About</h2>
                    <p>{club.description || 'This club has not added a description yet.'}</p>

                    {club.contact_info && <div><h3>Contact</h3><p>{club.contact_info}</p></div>}

                    <Link className="public-back-link" to="/clubs">← Back to clubs</Link>
                </section>

                <section className="public-card public-section">
                    <h2>Top Blitz players</h2>
                    {topPlayers.length > 0 ? <ol className="public-leaderboard">{topPlayers.map(player => <li key={player.publicPlayerId}>
                        <Link to={`/clubs/${clubId}/players/${player.publicPlayerId}`}>{player.playerName}</Link>
                        <strong>{player.selectedRating}</strong>
                    </li>)}</ol> : <p>No eligible players yet.</p>}
                </section>
            </div>

            {/* Admin area: invites and join requests */}
            {(club.member_role === 'owner' || club.member_role === 'admin') && (
                <section className="public-card public-section">
                    <h2>Administration</h2>

                    <div>
                        <button className="public-button" type="button" disabled={creatingInvite} onClick={createInvite}>
                            {creatingInvite ? 'Creating…' : 'Create invite'}
                        </button>
                    </div>

                    <div><h3>Active invites</h3>
                        {invites.length === 0 ? (
                            <p>No active invites.</p>
                        ) : (
                            <ul className="public-admin-list">
                                {invites.map(i => (
                                    <li key={i.id}>
                                        <code>{i.token}</code>
                                        <div className="public-admin-actions">
                                            <button className="public-button public-button--secondary" type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/clubs/join?token=${i.token}`)}>Copy</button>
                                            <button className="public-button public-button--danger" type="button" onClick={() => revokeInvite(i.id)}>Revoke</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div><h3>Join requests</h3>
                        {joinRequests.length === 0 ? (
                            <p>No pending requests.</p>
                        ) : (
                            <ul className="public-admin-list">
                                {joinRequests.map(r => (
                                    <li key={r.id}>
                                        <div>
                                            <div><strong>{r.name || r.email}</strong></div>
                                            <div>{r.message || ''}</div>
                                        </div>
                                        <div className="public-admin-actions">
                                            <button className="public-button" type="button" onClick={() => approveRequest(r.id)}>Approve</button>
                                            <button className="public-button public-button--secondary" type="button" onClick={() => rejectRequest(r.id)}>Reject</button>
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
