import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../app/contextHooks.js';
import BrandLogo from '../common/BrandLogo.jsx';
import '../../styles/public.css';

export default function PublicLayout() {
    const { user, loading } = useAuth();

    return (
        <div className="public-shell">
            <a className="public-skip-link" href="#public-main">Skip to content</a>
            <header className="public-header">
                <div className="public-header__inner">
                    <Link className="public-brand" to="/" aria-label="1chessclub home">
                        <BrandLogo className="public-brand__logo" collapse="mobile" />
                    </Link>
                    <nav className="public-nav" aria-label="Public navigation">
                        <NavLink to="/clubs" end>Find clubs</NavLink>
                        {!loading && (user ? (
                            <Link className="public-nav__button" to="/dashboard">Dashboard</Link>
                        ) : <>
                            <Link to="/auth/login">Sign in</Link>
                            <Link className="public-nav__button" to="/auth/register">Create account</Link>
                        </>)}
                    </nav>
                </div>
            </header>
            <main id="public-main" className="public-main" tabIndex="-1">
                <Outlet />
            </main>
        </div>
    );
}
