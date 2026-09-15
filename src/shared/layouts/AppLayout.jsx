import ActionMenu from '../common/ActionMenu.jsx';
import Icon from '../common/Icon.jsx';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useClub, useTheme } from '../../app/contextHooks.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';
import NotificationTray from '../../features/notifications/components/NotificationTray.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
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
        error: clubError,
    } = useClub();
    const { theme, toggleTheme } = useTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const dropdownRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [restoringClubId, setRestoringClubId] = useState(null);
    const [restoreError, setRestoreError] = useState(null);
    const [leavingClub, setLeavingClub] = useState(false);
    const [leaveConfirmationOpen, setLeaveConfirmationOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(storedSidebarPreference);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [switchingClubId, setSwitchingClubId] = useState(null);

    const displayName = user?.name || user?.email || 'Member';
    const initial = displayName.trim().charAt(0).toUpperCase() || 'M';
    const selectedClubName = activeClubs.find(entry => entry.club.id === (switchingClubId || selectedClubId))?.club.name;
    const loadingMessage = selectedClubName ? `Opening ${selectedClubName}…` : 'Loading your clubs…';
    const clubName = clubLoading || switchingClubId ? loadingMessage : club?.name || 'No club selected';
    const isClubWorkspace = ['/dashboard', '/players', '/matches', '/leaderboard', '/club', '/tournaments', '/announcements']
        .some(path => location.pathname === path || location.pathname.startsWith(`${path}/`));
    const workspaceLoading = isClubWorkspace && (clubLoading || switchingClubId !== null);
    const workspaceError = isClubWorkspace && !club && clubError;

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
        if (!window.dispatchEvent(new Event('app:before-context-change', { cancelable: true }))) return;
        setMenuOpen(false);
        await logout();
        navigate('/auth/login', { replace: true });
    };

    const handleThemeToggle = () => {
        toggleTheme();
        setMenuOpen(false);
    };

    const handleClubChange = async (event) => {
        if (!window.dispatchEvent(new Event('app:before-context-change', { cancelable: true }))) return;
        const nextClubId = event.target.value;
        setSwitchingClubId(nextClubId);
        setMobileNavOpen(false);
        const section = location.pathname.split('/')[1];
        const path = ['players', 'tournaments', 'announcements'].includes(section) ? `/${section}` : location.pathname;
        const query = new URLSearchParams(location.search);
        ['page', 'q', 'action', 'playerId'].forEach(key => query.delete(key));
        if (path === '/club') query.delete('tab');
        navigate({ pathname: path, search: query.toString() }, { replace: true });
        try {
            await selectClub(nextClubId);
        } finally {
            setSwitchingClubId(null);
        }
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
        setLeavingClub(true);
        setRestoreError(null);
        try {
            await clubApi.leave(club.id);
            setLeaveConfirmationOpen(false);
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
                        <button
                            type="button"
                            className="app-nav__brand app-nav__brand-toggle"
                            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            aria-expanded={!sidebarCollapsed}
                            onClick={() => setSidebarCollapsed(current => !current)}
                        >
                            <BrandLogo className="app-nav__brand-logo" collapse="phone" />
                            <span className="app-nav__brand-toggle-icon" aria-hidden="true"><Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} size="lg" /></span>
                        </button>
                        <NavLink className="app-nav__mobile-brand" to="/dashboard" aria-label="1chessclub dashboard">
                            <BrandLogo className="app-nav__brand-logo" collapse="phone" />
                        </NavLink>
                        <button
                            type="button"
                            className="app-nav__mobile-toggle"
                            aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
                            aria-expanded={mobileNavOpen}
                            onClick={() => setMobileNavOpen(current => !current)}
                        >
                            <span aria-hidden="true"><Icon name={mobileNavOpen ? 'x' : 'menu'} size="xl" /></span>
                        </button>
                    </div>

                    <label className={`app-nav__club-switcher${mobileNavOpen ? ' app-nav__club-switcher--mobile-open' : ''}`}>
                        <span className="app-nav__club-switcher-label">
                            {switchingClubId ? 'Switching club...' : 'Active club'}
                        </span>
                        <select
                            value={selectedClubId ?? ''}
                            onChange={handleClubChange}
                            disabled={clubLoading || switchingClubId !== null || activeClubs.length === 0}
                            aria-busy={switchingClubId !== null}
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
                    <div className="app-nav__club-collapsed-menu">
                        <ActionMenu label="Switch club" icon="club" heading="Active club" panelClassName="club-switch-menu"
                            disabled={clubLoading || switchingClubId !== null || activeClubs.length === 0}>
                            {activeClubs.map(entry => <button type="button" key={entry.club.id}
                                className={`club-switch-menu__option${entry.club.id === selectedClubId ? ' is-active' : ''}`}
                                aria-current={entry.club.id === selectedClubId ? 'true' : undefined}
                                onClick={() => { if (entry.club.id !== selectedClubId) handleClubChange({ target: { value: entry.club.id } }); }}>
                                <span className="club-switch-menu__identity"><strong>{entry.club.name}</strong>
                                    <span>{entry.membership.role[0].toUpperCase() + entry.membership.role.slice(1)}</span></span>
                                {entry.club.id === selectedClubId && <Icon name="check" />}
                            </button>)}
                        </ActionMenu>
                    </div>

                    <nav className={`app-nav__links${mobileNavOpen ? ' app-nav__links--mobile-open' : ''}`} aria-label="Primary navigation">
                        {navItems.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={navLinkClass}
                            >
                                <Icon className="app-nav__icon" name={item.icon} size="xl" />
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
                            aria-controls="account-menu"
                            aria-label={`${menuOpen ? 'Close' : 'Open'} account menu for ${displayName}`}
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
                            <div id="account-menu" className="app-nav__dropdown app-nav__dropdown--open" role="menu" aria-label="Account menu">
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
                                        onClick={() => setLeaveConfirmationOpen(true)}
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
                    <div role="status" aria-live="polite" aria-atomic="true">
                        {workspaceLoading && <div className="club-workspace-state">
                            <h1>{loadingMessage}</h1>
                            <p>Loading this club’s workspace. Please wait.</p>
                        </div>}
                    </div>
                    <div aria-busy={Boolean(workspaceLoading)}>
                        {!workspaceLoading && (workspaceError ? <div className="club-workspace-state" role="alert">
                            <h1>Couldn’t open {selectedClubName || 'your club'}</h1>
                            <p>{clubError}</p>
                            <button type="button" className="btn-secondary" onClick={() => refreshClubs(selectedClubId)}>Retry</button>
                        </div> : <Outlet key={`${club?.id ?? ''}:${location.pathname}`} />)}
                    </div>
                </div>
            </main>

            <ConfirmDialog
                isOpen={leaveConfirmationOpen}
                title={`Leave ${club?.name || 'club'}?`}
                message="Your player and match history will be preserved."
                confirmLabel="Leave club"
                variant="danger"
                loading={leavingClub}
                onClose={() => setLeaveConfirmationOpen(false)}
                onConfirm={handleLeaveClub}
            />
        </div>
    );
}
