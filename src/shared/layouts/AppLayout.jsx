import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useClub, useTheme } from '../../app/contextHooks.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';
import NotificationTray from '../../features/notifications/components/NotificationTray.jsx';
import BrandLogo from '../common/BrandLogo.jsx';
import '../../styles/layout.css';

const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', end: true },
    { to: '/leaderboard', label: 'Leaderboard', icon: 'leaderboard' },
    { to: '/players', label: 'Players', icon: 'players' },
    { to: '/matches', label: 'Matches', icon: 'matches' },
    { to: '/clubs', label: 'Clubs', icon: 'clubs' },
    { to: '/tournaments', label: 'Tournaments', icon: 'tournaments' },
    { to: '/announcements', label: 'Announcements', icon: 'announcements' },
];

const iconPaths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    leaderboard: <><path d="M5 21V11h4v10" /><path d="M10 21V3h4v18" /><path d="M15 21v-6h4v6" /></>,
    players: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6" /><path d="M14 15c3.8-.7 7 1 7 5" /></>,
    matches: <><path d="M7 3l10 18" /><path d="M17 3L7 21" /><circle cx="12" cy="12" r="2" /></>,
    clubs: <><path d="M4 21V7l8-4 8 4v14" /><path d="M8 10h2M14 10h2M8 14h2M14 14h2" /><path d="M10 21v-4h4v4" /></>,
    tournaments: <><path d="M8 4h8v4a4 4 0 01-8 0V4z" /><path d="M8 6H4v1a5 5 0 005 5M16 6h4v1a5 5 0 01-5 5" /><path d="M12 12v5M8 21h8M9 17h6" /></>,
    announcements: <><path d="M4 13V8l13-4v13L4 13z" /><path d="M7 14l2 6h4l-2-7" /><path d="M20 8v5" /></>,
};

function NavIcon({ name }) {
    return <svg className="app-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

function navLinkClass({ isActive }) {
    return `app-nav__link${isActive ? ' app-nav__link--active' : ''}`;
}

function storedSidebarPreference() {
    try {
        return window.localStorage?.getItem?.('chess-managers-sidebar') === 'collapsed';
    } catch {
        return false;
    }
}

export default function AppLayout() {
    const { user, logout } = useAuth();
    const {
        club,
        clubs,
        activeClubs,
        selectedClubId,
        membership,
        selectClub,
        refreshClubs,
        capabilities,
        loading: clubLoading,
    } = useClub();
    const { theme, toggleTheme } = useTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const dropdownRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [restoringClubId, setRestoringClubId] = useState(null);
    const [restoreError, setRestoreError] = useState(null);
    const [leavingClub, setLeavingClub] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(storedSidebarPreference);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    const displayName = user?.name || user?.email || 'Member';
    const initial = displayName.trim().charAt(0).toUpperCase() || 'M';
    const clubName = clubLoading ? 'Loading club...' : club?.name || 'No club selected';

    useEffect(() => {
        setMenuOpen(false);
        setMobileNavOpen(false);
    }, [location.pathname]);

    useLayoutEffect(() => {
        document.documentElement.scrollTop = 0;
        document.documentElement.scrollLeft = 0;
        document.body.scrollTop = 0;
        document.body.scrollLeft = 0;
    }, [location.pathname, location.search]);

    useEffect(() => {
        try {
            window.localStorage?.setItem?.('chess-managers-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded');
        } catch {
            // Storage may be unavailable in private browsing or restricted embeds.
        }
    }, [sidebarCollapsed]);

    useEffect(() => {
        if (!menuOpen) return;

        function handlePointerDown(event) {
            if (!dropdownRef.current?.contains(event.target)) {
                setMenuOpen(false);
            }
        }

        function handleKeyDown(event) {
            if (event.key === 'Escape') {
                setMenuOpen(false);
            }
        }

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('touchstart', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('touchstart', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [menuOpen]);

    const handleLogout = async () => {
        setMenuOpen(false);
        await logout();
        navigate('/auth/login', { replace: true });
    };

    const handleThemeToggle = () => {
        toggleTheme();
        setMenuOpen(false);
    };

    const handleClubChange = async (event) => {
        const selection = selectClub(event.target.value);
        navigate('/dashboard');
        await selection;
    };

    const handleRestoreClub = async (clubId) => {
        setRestoringClubId(clubId);
        setRestoreError(null);
        try {
            await clubApi.restore(clubId);
            await refreshClubs(clubId);
            setMenuOpen(false);
            navigate('/dashboard');
        } catch (err) {
            setRestoreError(err.message || 'Failed to restore club.');
        } finally {
            setRestoringClubId(null);
        }
    };

    const archivedOwnedClubs = clubs.filter(entry => (
        entry.club.status === 'archived' && entry.membership.role === 'owner'
    ));

    const handleLeaveClub = async () => {
        if (!club || membership?.role === 'owner') return;
        if (!confirm(`Leave ${club.name}? Your player and match history will be preserved.`)) return;
        setLeavingClub(true);
        setRestoreError(null);
        try {
            await clubApi.leave(club.id);
            const nextClubId = await refreshClubs();
            setMenuOpen(false);
            navigate(nextClubId ? '/dashboard' : '/clubs');
        } catch (err) {
            setRestoreError(err.message || 'Failed to leave club.');
        } finally {
            setLeavingClub(false);
        }
    };

    return (
        <div className={`app-shell${sidebarCollapsed ? ' app-shell--sidebar-collapsed' : ''}`}>
            <header className={`app-nav${sidebarCollapsed ? ' app-nav--collapsed' : ''}`}>
                <div className="app-nav__inner">
                    <div className="app-nav__top">
                        <NavLink className="app-nav__brand" to="/dashboard" aria-label="Chess Managers dashboard">
                            <BrandLogo className="app-nav__brand-logo" collapse="phone" />
                        </NavLink>
                        <button
                            type="button"
                            className="app-nav__collapse-button"
                            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            aria-expanded={!sidebarCollapsed}
                            onClick={() => setSidebarCollapsed(current => !current)}
                        >
                            <span aria-hidden="true">{sidebarCollapsed ? '›' : '‹'}</span>
                        </button>
                        <button
                            type="button"
                            className="app-nav__mobile-toggle"
                            aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
                            aria-expanded={mobileNavOpen}
                            onClick={() => setMobileNavOpen(current => !current)}
                        >
                            <span aria-hidden="true">{mobileNavOpen ? '✕' : '☰'}</span>
                        </button>
                    </div>

                    <label className={`app-nav__club-switcher${mobileNavOpen ? ' app-nav__club-switcher--mobile-open' : ''}`}>
                        <span className="app-nav__club-switcher-label">Active club</span>
                        <select
                            value={selectedClubId ?? ''}
                            onChange={handleClubChange}
                            disabled={clubLoading || activeClubs.length === 0}
                            aria-label="Switch active club"
                        >
                            {activeClubs.length === 0 ? (
                                <option value="">No active clubs</option>
                            ) : activeClubs.map(entry => (
                                <option key={entry.club.id} value={entry.club.id}>
                                    {entry.club.name} ({entry.membership.role})
                                </option>
                            ))}
                        </select>
                    </label>
                    <button
                        type="button"
                        className="app-nav__club-collapsed"
                        title={`Active club: ${clubName}`}
                        aria-label={`Expand sidebar. Active club: ${clubName}`}
                        onClick={() => setSidebarCollapsed(false)}
                    >
                        ♜
                    </button>

                    <nav className={`app-nav__links${mobileNavOpen ? ' app-nav__links--mobile-open' : ''}`} aria-label="Primary navigation">
                        {navItems.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={navLinkClass}
                            >
                                <NavIcon name={item.icon} />
                                <span className="app-nav__link-label">{item.label}</span>
                            </NavLink>
                        ))}
                    </nav>

                    <div className="app-nav__utilities">
                        <NotificationTray />
                        <div className="app-nav__account" ref={dropdownRef}>
                        <button
                            type="button"
                            className="app-nav__menu-button"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onClick={() => setMenuOpen(open => !open)}
                        >
                            <span className="app-nav__avatar" aria-hidden="true">{initial}</span>
                            <span className="app-nav__account-copy">
                                <span className="app-nav__account-name">{displayName}</span>
                                <span className="app-nav__account-club">{clubName}</span>
                            </span>
                            <span className="app-nav__chevron" aria-hidden="true" />
                        </button>

                        {menuOpen && (
                            <div className="app-nav__dropdown app-nav__dropdown--open" role="menu" aria-label="Account menu">
                                <div className="app-nav__dropdown-header">
                                    <strong>{displayName}</strong>
                                    <span>{clubName}</span>
                                </div>

                                <NavLink className="app-nav__dropdown-item" role="menuitem" to="/create-club">
                                    Create club
                                </NavLink>
                                <NavLink className="app-nav__dropdown-item" role="menuitem" to="/account">
                                    Account and sessions
                                </NavLink>

                                {archivedOwnedClubs.map(entry => (
                                    <button
                                        key={entry.club.id}
                                        type="button"
                                        className="app-nav__dropdown-item"
                                        role="menuitem"
                                        disabled={restoringClubId === entry.club.id}
                                        onClick={() => handleRestoreClub(entry.club.id)}
                                    >
                                        {restoringClubId === entry.club.id
                                            ? `Restoring ${entry.club.name}...`
                                            : `Restore ${entry.club.name}`}
                                    </button>
                                ))}

                                {restoreError && (
                                    <div className="app-nav__dropdown-error" role="alert">{restoreError}</div>
                                )}

                                {capabilities.canManageMemberships && (
                                    <NavLink className="app-nav__dropdown-item" role="menuitem" to="/club">
                                        {capabilities.canManageClubSettings ? 'Club settings' : 'Club administration'}
                                    </NavLink>
                                )}

                                {club && membership?.role !== 'owner' && (
                                    <button
                                        type="button"
                                        className="app-nav__dropdown-item app-nav__dropdown-item--danger"
                                        role="menuitem"
                                        disabled={leavingClub}
                                        onClick={handleLeaveClub}
                                    >
                                        {leavingClub ? 'Leaving club...' : 'Leave active club'}
                                    </button>
                                )}

                                <button
                                    type="button"
                                    className="app-nav__dropdown-item"
                                    role="menuitem"
                                    onClick={handleThemeToggle}
                                >
                                    {theme === 'dark' ? 'Use light mode' : 'Use dark mode'}
                                </button>

                                <button
                                    type="button"
                                    className="app-nav__dropdown-item app-nav__dropdown-item--danger"
                                    role="menuitem"
                                    onClick={handleLogout}
                                >
                                    Sign out
                                </button>
                            </div>
                        )}
                        </div>
                    </div>
                </div>
            </header>

            <main className="app-main">
                <div className="app-main__inner">
                    <Outlet key={`${location.pathname}${location.search}`} />
                </div>
            </main>
        </div>
    );
}
