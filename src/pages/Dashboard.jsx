import React, { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useClub } from '../app/contextHooks.js';
import PendingLinksList from '../features/players/admin/PendingLinksList.jsx';
import JoinRequestsPanel from '../features/clubs/membership/JoinRequestsPanel.jsx';
import { leaderboardApi } from '../features/leaderboard/api/leaderboardApi.js';
import ClubDashboard from './club/ClubDashboard.jsx';
import NoClubState from '../shared/common/NoClubState.jsx';

const CATEGORIES = ['blitz', 'rapid', 'classical'];

export default function Dashboard() {
    const { club, capabilities } = useClub();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedCategory = searchParams.get('category');
    const category = CATEGORIES.includes(requestedCategory) ? requestedCategory : 'blitz';
    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (!club?.id) {
            setDashboard(null);
            setLoading(false);
            return;
        }
        let active = true;
        setLoading(true);
        setError('');
        leaderboardApi.fetchDashboard(club.id, category)
            .then(data => active && setDashboard(data))
            .catch(fetchError => active && setError(fetchError.message || 'Unable to load the dashboard.'))
            .finally(() => active && setLoading(false));
        return () => { active = false; };
    }, [club?.id, category, refreshKey]);

    function changeCategory(nextCategory) {
        const next = new URLSearchParams(searchParams);
        next.set('category', nextCategory);
        setSearchParams(next, { replace: true });
    }

    if (!club) {
        return <NoClubState title="Build your club dashboard"
            feature="Once you join or create a club, this dashboard brings pending requests, recent matches, active players, and rating leaders together."
            description="Choose how you want to begin." />;
    }

    return <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {location.state?.joinMessage && <div className="success-banner" role="status">{location.state.joinMessage}</div>}
        <div><h1 style={{ margin: 0 }}>Dashboard</h1><p className="muted">{club?.name || 'Your club'}</p></div>
        {capabilities.canManageMemberships && club?.id && (
            <JoinRequestsPanel clubId={club.id} onQueueChanged={() => setRefreshKey(current => current + 1)} />
        )}
        {loading && <div className="muted">Loading dashboard...</div>}
        {error && <div className="error-banner" role="alert"><p>Couldn’t load dashboard. Try again. {error}</p><button type="button" className="btn-secondary" disabled={loading} onClick={() => setRefreshKey(current => current + 1)}>Retry</button></div>}
        {!loading && dashboard && <ClubDashboard data={dashboard} onCategoryChange={changeCategory} canManageMemberships={Boolean(capabilities.canManageMemberships)} />}
        {capabilities.canManagePlayers && club?.id && (
            <PendingLinksList
                clubId={club.id}
                onActionComplete={() => setRefreshKey(current => current + 1)}
            />
        )}
    </div>;
}
