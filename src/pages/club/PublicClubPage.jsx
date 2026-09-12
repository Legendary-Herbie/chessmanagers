import ClaimedBadge from '../../features/players/components/ClaimedBadge.jsx';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth, useClub, useNotifications } from '../../app/contextHooks.js';
import { resolveAssetUrl } from '../../config/api.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';
import { leaderboardApi } from '../../features/leaderboard/api/leaderboardApi.js';
import { websiteUrl } from '../../shared/websiteUrl.js';

const CATEGORIES = ['blitz', 'rapid', 'classical'];

export default function PublicClubPage() {
    const { clubId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { selectClub } = useClub();
    const [opening, setOpening] = useState(false);
    const [openError, setOpenError] = useState('');
    const { notify } = useNotifications();
    const [club, setClub] = useState(null);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState(null);
    const [category, setCategory] = useState('rapid');
    const [topPlayers, setTopPlayers] = useState([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);

    useEffect(() => {
        if (clubId === 'join') {
            navigate(`/clubs/join${window.location.search}`, { replace: true });
            return;
        }
        let active = true;
        setLoading(true);
        setError(null);
        clubApi.fetchPresentation(clubId)
            .then(result => active && setClub(result))
            .catch(loadError => active && setError(loadError?.message || 'Failed to load club'))
            .finally(() => active && setLoading(false));
        return () => { active = false; };
    }, [clubId, navigate]);

    useEffect(() => {
        if (club?.visibility !== 'public' || !club.public_leaderboard) {
            setTopPlayers([]);
            return;
        }
        let active = true;
        setLeaderboardLoading(true);
        leaderboardApi.fetchPublicLeaderboard(clubId, { category, limit: 5 })
            .then(result => active && setTopPlayers(result.entries))
            .catch(() => active && setTopPlayers([]))
            .finally(() => active && setLeaderboardLoading(false));
        return () => { active = false; };
    }, [club, clubId, category]);

    async function openDashboard() {
        setOpening(true);
        setOpenError('');
        try {
            if (!await selectClub(clubId)) throw new Error('Couldn’t open this club. Try again.');
            navigate('/dashboard');
        } catch (error) {
            setOpenError(error.message || 'Couldn’t open this club. Try again.');
        } finally {
            setOpening(false);
        }
    }

    async function handleRequestJoin() {
        if (!user) return;
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
        } catch (joinError) {
            notify(joinError?.message || 'Failed to request to join', 'error');
        } finally {
            setJoining(false);
        }
    }

    if (loading) return <section className="public-panel public-state" role="status">
        <h1>Loading club…</h1><p>Retrieving the club’s public information.</p>
    </section>;
    if (error) return <section className="public-panel public-state public-state--error" role="alert">
        <h1>Club could not be loaded</h1><p>{error}</p><Link className="public-back-link text-link" to="/clubs">Back to clubs</Link>
    </section>;
    if (!club) return <section className="public-panel public-state">
        <h1>Club not found</h1><p>This club is unavailable.</p><Link className="public-back-link text-link" to="/clubs">Back to clubs</Link>
    </section>;

    const isMember = Boolean(club.is_member);
    const membershipStatus = club.membership?.status || null;
    const cooldownEndsAt = club.membership?.cooldownEndsAt;
    const authQuery = `?returnTo=${encodeURIComponent(`/clubs/${clubId}`)}`;
    const metrics = club.metrics || {};
    const contacts = club.contacts || {};
    const website = websiteUrl(contacts.website);
    const hasMetrics = Boolean(metrics.memberCount || metrics.rosterPlayers || metrics.totalGames
        || CATEGORIES.some(item => metrics.averageRatings?.[item] != null));
    const hasAbout = Boolean(club.description || club.contact_info || contacts.email
        || contacts.phone || contacts.website || contacts.address);

    return (
        <div className="public-page">
            <header className="public-card public-club-hero" style={club.primaryColor ? { borderTop: `4px solid ${club.primaryColor}` } : undefined}>
                {club.logo ? (
                    <img className="public-club-hero__logo" src={resolveAssetUrl(club.logo)} alt={`${club.name} badge`} />
                ) : <div className="public-club-hero__placeholder" aria-hidden="true" />}
                <div>
                    <h1>{club.name}</h1>
                    <p>{club.affiliation || club.federation || 'Independent club'}</p>
                    {contacts.address && <p>{contacts.address}</p>}
                </div>
                <div className="public-club-hero__actions">
                    {isMember ? (
                        <><span className="public-membership-state public-membership-state--success">You are a member</span>
                        <button type="button" className="public-button" disabled={opening} onClick={openDashboard}>{opening ? 'Opening…' : 'Open dashboard'}</button>
                        {openError && <p role="alert">{openError}</p>}</>
                    ) : membershipStatus === 'PENDING_APPROVAL' ? (
                        <span className="public-membership-state">Join request pending</span>
                    ) : membershipStatus === 'REJECTED' && !club.can_request_join ? (
                        <span className="public-membership-state">Reapply after {cooldownEndsAt ? new Date(cooldownEndsAt).toLocaleString() : 'the cooldown'}</span>
                    ) : user ? (
                        <button className="public-button" type="button" disabled={joining || !club.can_request_join} onClick={handleRequestJoin}>
                            {joining ? 'Requesting…' : membershipStatus === 'REVOKED' || membershipStatus === 'REJECTED' ? 'Request to rejoin' : 'Request to join'}
                        </button>
                    ) : <>
                        <Link className="public-link-button public-button--secondary" to={`/auth/login${authQuery}`}>Sign in</Link>
                        <Link className="public-link-button" to={`/auth/register${authQuery}`}>Register to join</Link>
                    </>}
                </div>
            </header>

            {club.visibility === 'public' && hasMetrics && <section className="public-club-metrics" aria-label="Club statistics">
                <div><strong>{metrics.memberCount ?? 0}</strong><span>Members</span></div>
                <div><strong>{metrics.rosterPlayers ?? 0}</strong><span>Players</span></div>
                <div><strong>{metrics.totalGames ?? 0}</strong><span>Games recorded</span></div>
                {CATEGORIES.map(item => <div key={item}>
                    <strong>{metrics.averageRatings?.[item] ?? '—'}</strong>
                    <span>Average {item}</span>
                </div>)}
            </section>}

            {(hasAbout || leaderboardLoading || topPlayers.length > 0) && <div className="public-content-grid">
                {hasAbout && <section className="public-card public-section">
                    <h2>About</h2>
                    {club.description && <p>{club.description}</p>}
                    {(club.contact_info || contacts.email || contacts.phone || contacts.website || contacts.address) && <div>
                        <h3>Contact and location</h3>
                        {contacts.address && <p>{contacts.address}</p>}
                        {contacts.email && <p><a className="text-link" href={`mailto:${contacts.email}`}>{contacts.email}</a></p>}
                        {contacts.phone && <p><a className="text-link" href={`tel:${contacts.phone}`}>{contacts.phone}</a></p>}
                        {website && <p><a className="text-link" href={website} target="_blank" rel="noopener noreferrer">Visit club website</a></p>}
                        {club.contact_info && <p>{club.contact_info}</p>}
                    </div>}
                </section>}

                {club.visibility === 'public' && club.public_leaderboard && (leaderboardLoading || topPlayers.length > 0) && <section className="public-card public-section">
                    <h2>Top players</h2>
                    <div className="public-category-tabs" aria-label="Leaderboard category">
                        {CATEGORIES.map(item => <button key={item} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>
                            {item[0].toUpperCase() + item.slice(1)}
                        </button>)}
                    </div>
                    {leaderboardLoading ? <p>Loading players…</p> : topPlayers.length > 0 ? (
                        <ol className="public-leaderboard">{topPlayers.map(player => <li key={player.publicPlayerId}>
                            <Link className="name-link" to={`/clubs/${clubId}/players/${player.publicPlayerId}`}>{player.playerName} <ClaimedBadge status={player.isClaimed ? 'approved' : null} /></Link>
                            <strong>{player.selectedRating}</strong>
                        </li>)}</ol>
                    ) : null}
                </section>}
            </div>}
            <Link className="public-back-link public-club-back text-link" to="/clubs">← Back to clubs</Link>
        </div>
    );
}
