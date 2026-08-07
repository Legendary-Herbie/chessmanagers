import { Outlet } from 'react-router-dom';
import '../../styles/auth.css';

export default function AuthPage() {
    return (
        <div className="auth-root">
            <div className="auth-layout">
                <section className="auth-left">
                    <div className="auth-brand">
                        <div className="auth-brand-icon">
                            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <rect x="4"  y="28" width="8"  height="8"  rx="1" fill="currentColor" opacity="0.9"/>
                                <rect x="16" y="20" width="8"  height="16" rx="1" fill="currentColor"/>
                                <rect x="28" y="4"  width="8"  height="32" rx="1" fill="currentColor" opacity="0.7"/>
                                <rect x="4"  y="4"  width="8"  height="20" rx="1" fill="currentColor" opacity="0.4"/>
                            </svg>
                        </div>
                        <span className="auth-brand-name">Chess Managers</span>
                    </div>

                    <div className="auth-hero">
                        <p className="auth-hero-eyebrow">Welcome back.</p>
                        <h1 className="auth-hero-title">A smarter way to run your club.</h1>
                        <p className="auth-hero-copy">
                            Manage players, record results, and run tournaments from one polished control center.
                        </p>
                    </div>
                </section>

                <section className="auth-right">
                    <div className="auth-panel">
                        <Outlet />
                    </div>
                </section>
            </div>
        </div>
    );
}