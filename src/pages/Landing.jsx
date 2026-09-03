import React from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../shared/common/BrandLogo.jsx';
import '../styles/landing.css';

const organizerOutcomes = [
    ['Start club night ready', 'Approve new members, keep the roster current, and publish the details everyone needs before the first clock starts.'],
    ['Trust every result', 'Record the game once. Corrections, backdated results, and category ratings stay connected to a clear history.'],
    ['Know what needs attention', 'See pending requests, recent games, active players, and rating leaders without rebuilding a spreadsheet.'],
];

const playerOutcomes = [
    ['A rating that matches the game', 'Blitz, Rapid, and Classical progress stay separate, so one format never distorts another.'],
    ['A history you can follow', 'Review opponents, results, rating changes, peaks, streaks, and head-to-head records.'],
    ['One place to stay involved', 'Find the club, follow announcements and tournaments, and keep your player profile connected.'],
];

export default function Landing() {
    return (
        <main className="landing-page">
            <header className="landing-nav">
                <Link className="landing-brand" to="/" aria-label="Chess Managers home">
                    <BrandLogo className="landing-brand__logo" collapse="phone" />
                </Link>
                <nav aria-label="Public navigation">
                    <Link to="/clubs">Find clubs</Link>
                    <Link to="/auth/login">Sign in</Link>
                    <Link className="landing-nav__cta" to="/auth/register">Get started</Link>
                </nav>
            </header>

            <section className="landing-hero">
                <div className="landing-hero__copy">
                    <p className="landing-eyebrow">For organizers who would rather run chess than chase records</p>
                    <h1>Spend club night on the games—not the spreadsheet.</h1>
                    <p className="landing-lead">
                        Chess Managers turns membership, match results, ratings, and events into one dependable club record—so organizers make faster decisions and players can trust their progress.
                    </p>
                    <div className="landing-actions">
                        <Link className="landing-button landing-button--primary" to="/auth/register">Create your club</Link>
                        <Link className="landing-button landing-button--secondary" to="/clubs">Find your club</Link>
                    </div>
                    <p className="landing-hero__note">Set up the roster, record the first result, and give everyone a clearer view of club life.</p>
                </div>

                <div className="landing-outcome-card" aria-label="Example organizer overview">
                    <div className="landing-outcome-card__header"><span>Tonight’s club overview</span><strong>Ready</strong></div>
                    <div className="landing-outcome-card__metrics">
                        <div><strong>28</strong><span>active players</span></div>
                        <div><strong>12</strong><span>games tonight</span></div>
                        <div><strong>2</strong><span>requests to review</span></div>
                    </div>
                    <div className="landing-outcome-card__result">
                        <span aria-hidden="true">♞</span>
                        <div><strong>Result recorded</strong><small>Rapid ratings and player history updated</small></div>
                        <b>✓</b>
                    </div>
                    <div className="landing-outcome-card__categories">
                        <span>Blitz <strong>1568</strong></span>
                        <span>Rapid <strong>1642</strong></span>
                        <span>Classical <strong>1710</strong></span>
                    </div>
                </div>
            </section>

            <section className="landing-audiences" aria-labelledby="landing-value-title">
                <div className="landing-section-heading">
                    <p className="landing-eyebrow">Less uncertainty for everyone</p>
                    <h2 id="landing-value-title">A calmer operation. A better player experience.</h2>
                </div>
                <div className="landing-audience-grid">
                    <article>
                        <span className="landing-audience-grid__label">For organizers</span>
                        <h3>Know the club is under control.</h3>
                        <div className="landing-outcome-list">{organizerOutcomes.map(([title, copy]) => <div key={title}>
                            <span aria-hidden="true">✓</span><p><strong>{title}</strong>{copy}</p>
                        </div>)}</div>
                    </article>
                    <article>
                        <span className="landing-audience-grid__label">For players</span>
                        <h3>See progress you can believe.</h3>
                        <div className="landing-outcome-list">{playerOutcomes.map(([title, copy]) => <div key={title}>
                            <span aria-hidden="true">✓</span><p><strong>{title}</strong>{copy}</p>
                        </div>)}</div>
                    </article>
                </div>
            </section>

            <section className="landing-workflow" aria-labelledby="landing-workflow-title">
                <div className="landing-section-heading">
                    <p className="landing-eyebrow">From handshake to history</p>
                    <h2 id="landing-workflow-title">Every result becomes a useful record.</h2>
                </div>
                <ol>
                    <li><span>1</span><div><strong>Bring in the roster</strong><p>Start each player at the right Blitz, Rapid, and Classical rating.</p></div></li>
                    <li><span>2</span><div><strong>Record what happened</strong><p>Capture opponents, result, category, rated status, and the actual time played.</p></div></li>
                    <li><span>3</span><div><strong>Let the club learn from it</strong><p>Ratings, history, leaderboards, dashboards, and player statistics stay in step.</p></div></li>
                </ol>
            </section>

            <section className="landing-final-cta">
                <div><p className="landing-eyebrow">Ready for the next round?</p><h2>Give your club a record everyone can rely on.</h2></div>
                <div className="landing-actions">
                    <Link className="landing-button landing-button--primary" to="/auth/register">Create your club</Link>
                    <Link className="landing-button landing-button--secondary" to="/auth/login">Sign in</Link>
                </div>
            </section>
        </main>
    );
}
