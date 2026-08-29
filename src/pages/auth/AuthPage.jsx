import React from 'react';
import { Outlet } from 'react-router-dom';
import '../../styles/auth.css';
import BrandLogo from '../../shared/common/BrandLogo.jsx';

function AuthBrand({ mobile = false }) {
    return <div className={`auth-brand${mobile ? ' auth-brand--mobile' : ''}`}>
        <BrandLogo className="auth-brand-logo" tone="inverted" compact />
    </div>;
}

export default function AuthPage() {
    return (
        <div className="auth-root">
            <div className="auth-layout">
                <section className="auth-left">
                    <AuthBrand />

                    <div className="auth-hero">
                        <p className="auth-hero-eyebrow">Built for chess clubs.</p>
                        <h1 className="auth-hero-title">A smarter way to run your club.</h1>
                        <p className="auth-hero-copy">
                            Manage players, record results, and run tournaments from one polished control center.
                        </p>
                    </div>
                </section>

                <section className="auth-right">
                    <AuthBrand mobile />
                    <div className="auth-panel">
                        <Outlet />
                    </div>
                </section>
            </div>
        </div>
    );
}
