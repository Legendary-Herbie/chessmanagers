import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useClub, useTheme } from '../../app/contextHooks.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';
import NotificationTray from '../../features/notifications/components/NotificationTray.jsx';
import '../../styles/layout.css';

const navItems = [
    { to: '/dashboard', label: 'Dashboard', end: true },
    { to: '/leaderboard', label: 'Leaderboard' },
    { to: '/players', label: 'Players' },
    { to: '/matches', label: 'Matches' },
    { to: '/clubs', label: 'Clubs' },
    { to: '/tournaments', label: 'Tournaments' },
    { to: '/announcements', label: 'Announcements' },
];

function navLinkClass({ isActive }) {
    return `app-nav__link${isActive ? ' app-nav__link--active' : ''}`;
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

    const displayName = user?.name || user?.email || 'Member';
    const initial = displayName.trim().charAt(0).toUpperCase() || 'M';
    const clubName = clubLoading ? 'Loading club...' : club?.name || 'No club selected';

    useEffect(() => {
        setMenuOpen(false);
    }, [location.pathname]);

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
        <div className="app-shell">
            <header className="app-nav">
                <div className="app-nav__inner">
                    <NavLink className="app-nav__brand" to="/dashboard" aria-label="Chess Managers dashboard">
                        <span className="app-nav__brand-mark" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </span>
                        <span className="app-nav__brand-name">Chess Managers</span>
                    </NavLink>

                    <label className="app-nav__club-switcher">
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

                    <nav className="app-nav__links" aria-label="Primary navigation">
                        {navItems.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={navLinkClass}
                            >
                                {item.label}
                            </NavLink>
                        ))}
                    </nav>

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
            </header>

            <main className="app-main">
                <Outlet />
            </main>
        </div>
    );
}
