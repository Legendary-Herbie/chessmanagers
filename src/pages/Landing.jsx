import React from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../shared/common/BrandLogo.jsx';
import '../styles/landing.css';

const organizerOutcomes = [
    ['Welcome every new member', 'Bring members into your club, connect them with their player profiles, and help them find their place.'],
    ['Keep everyone in the loop', 'Share club announcements and tournament details so members know what is happening and how to take part.'],
    ['Build a shared club history', 'Keep the games, results, and player progress that tell the story of your club together.'],
];

const playerOutcomes = [
    ['Find your chess community', 'Discover a club, request to join, and connect your player profile once you become a member.'],
    ['Follow your progress', 'Look back on your games and follow your Blitz, Rapid, and Classical ratings as you play.'],
    ['Stay part of club life', 'Catch up on announcements, follow club tournaments, and see the latest results.'],
];

export default function Landing() {
    return (
        <main className="landing-page">
            <header className="landing-nav">
                <Link className="landing-brand" to="/" aria-label="1chessclub home">
                    <BrandLogo className="landing-brand__logo" collapse="phone" />
                </Link>
                <nav aria-label="Public navigation">
                    <Link className="text-link" to="/clubs">Find clubs</Link>
                    <Link className="text-link" to="/auth/login">Sign in</Link>
                </nav>
            </header>

            <section className="landing-hero">
                <div className="landing-hero__copy">
                    <p className="landing-eyebrow">A home for your chess community</p>
                    <h1>One club. Every player connected.</h1>
                    <p className="landing-lead">
                        Bring your chess community together. 1chessclub gives members one place to follow club news, tournaments, and their progress, while organizers keep everyone involved.
                    </p>
                    <div className="landing-actions">
                        <Link className="landing-button landing-button--primary" to="/auth/register">Bring your club together</Link>
                        <Link className="landing-button landing-button--secondary" to="/clubs">Find your club</Link>
                    </div>
                    <p className="landing-hero__note">For school clubs, local communities, and the people who bring them to life.</p>
                </div>

                <div className="landing-outcome-card" aria-label="Your club community on 1chessclub">
                    <div className="landing-outcome-card__header"><span>Your club, together</span><strong>Connected</strong></div>
                    <div className="landing-outcome-card__metrics">
                        <div><strong>Join</strong><span>find your community</span></div>
                        <div><strong>Play</strong><span>take part in club life</span></div>
                        <div><strong>Grow</strong><span>follow your progress</span></div>
                    </div>
                    <div className="landing-outcome-card__result">
                        <span aria-hidden="true">♞</span>
                        <div><strong>Stay connected between games</strong><small>Club news, tournaments, and results in one place</small></div>
                        <b>✓</b>
                    </div>
                    <div className="landing-outcome-card__categories">
                        <span>Members <strong>Belong</strong></span>
                        <span>Games <strong>Connect</strong></span>
                        <span>Progress <strong>Inspires</strong></span>
                    </div>
                </div>
            </section>

            <section className="landing-audiences" aria-labelledby="landing-value-title">
                <div className="landing-section-heading">
                    <p className="landing-eyebrow">A place for everyone in your club</p>
                    <h2 id="landing-value-title">Bring people together. Keep them involved.</h2>
                </div>
                <div className="landing-audience-grid">
                    <article>
                        <span className="landing-audience-grid__label">For organizers</span>
                        <h3>Make your club a place to belong.</h3>
                        <div className="landing-outcome-list">{organizerOutcomes.map(([title, copy]) => <div key={title}>
                            <span aria-hidden="true">✓</span><p><strong>{title}</strong>{copy}</p>
                        </div>)}</div>
                    </article>
                    <article>
                        <span className="landing-audience-grid__label">For players</span>
                        <h3>Your next game starts with your club.</h3>
                        <div className="landing-outcome-list">{playerOutcomes.map(([title, copy]) => <div key={title}>
                            <span aria-hidden="true">✓</span><p><strong>{title}</strong>{copy}</p>
                        </div>)}</div>
                    </article>
                </div>
            </section>

            <section className="landing-workflow" aria-labelledby="landing-workflow-title">
                <div className="landing-section-heading">
                    <p className="landing-eyebrow">From first hello to the next round</p>
                    <h2 id="landing-workflow-title">Build your community, one game at a time.</h2>
                </div>
                <ol>
                    <li><span>1</span><div><strong>Bring your club together</strong><p>Create your club, add your players, and invite members to join.</p></div></li>
                    <li><span>2</span><div><strong>Give everyone a way to take part</strong><p>Share announcements, organize tournaments, and record the games your members play.</p></div></li>
                    <li><span>3</span><div><strong>Follow the story of your club</strong><p>Keep up with results and player progress, from the first game to the latest tournament.</p></div></li>
                </ol>
            </section>

            <section className="landing-final-cta">
                <div><p className="landing-eyebrow">There is a place for your club here</p><h2>Bring your people. Build your chess community.</h2></div>
                <div className="landing-actions">
                    <Link className="landing-button landing-button--primary" to="/auth/register">Create your club</Link>
                    <Link className="landing-button landing-button--secondary" to="/auth/login">Sign in</Link>
                </div>
            </section>
        </main>
    );
}
