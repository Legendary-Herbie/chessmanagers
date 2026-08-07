import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useClub, useTheme } from '../../app/providers.jsx';
import '../../styles/layout.css';

const navItems = [
    { to: '/dashboard', label: 'Dashboard', end: true },
    { to: '/leaderboard', label: 'Leaderboard' },
    { to: '/players', label: 'Players' },
    { to: '/matches', label: 'Matches' },
    { to: '/tournaments', label: 'Tournaments' },
    { to: '/clubs', label: 'Clubs' },
];

function navLinkClass({ isActive }) {
    return `app-nav__link${isActive ? ' app-nav__link--active' : ''}`;
}

export default function AppLayout() {
    const { user, logout, isAdmin } = useAuth();
    const { club, loading: clubLoading } = useClub();
    const { theme, toggleTheme } = useTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const dropdownRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);

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

    const handleLogout = () => {
        setMenuOpen(false);
        logout();
        navigate('/auth/login', { replace: true });
    };

    const handleThemeToggle = () => {
        toggleTheme();
        setMenuOpen(false);
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

                                {isAdmin && (
                                    <NavLink className="app-nav__dropdown-item" role="menuitem" to="/club">
                                        Club settings
                                    </NavLink>
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
