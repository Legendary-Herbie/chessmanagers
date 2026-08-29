import { Link } from 'react-router-dom';
import '../styles/landing.css';
import BrandLogo from '../shared/common/BrandLogo.jsx';

const features = [
    ['Independent ratings', 'Track Blitz, Rapid, and Classical Elo separately for every club.'],
    ['Complete match history', 'Record rated and unrated games with exact chronology and preserved history.'],
    ['Club operations', 'Manage members, players, tournaments, announcements, and club activity in one place.'],
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
                </nav>
            </header>

            <section className="landing-hero">
                <div className="landing-hero__copy">
                    <p className="landing-eyebrow">Built for over-the-board chess clubs</p>
                    <h1>Run your club. Preserve every game.</h1>
                    <p className="landing-lead">
                        Keep players, category Elo ratings, matches, tournaments, announcements,
                        and membership activity connected to the right club.
                    </p>
                    <div className="landing-actions">
                        <Link className="landing-button landing-button--primary" to="/auth/register">Create an account</Link>
                        <Link className="landing-button landing-button--secondary" to="/clubs">Browse public clubs</Link>
                    </div>
                </div>
                <div className="landing-board" aria-label="Blitz, Rapid, and Classical rating categories">
                    {['Blitz', 'Rapid', 'Classical'].map((category, index) => (
                        <div className="landing-rating-card" key={category}>
                            <span className="landing-rating-card__piece" aria-hidden="true">
                                {['♞', '♜', '♛'][index]}
                            </span>
                            <span><strong>{category}</strong><small>Independent Elo</small></span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="landing-features" aria-labelledby="landing-features-title">
                <div className="landing-section-heading">
                    <p className="landing-eyebrow">One reliable club record</p>
                    <h2 id="landing-features-title">Everything stays club-specific</h2>
                </div>
                <div className="landing-feature-grid">
                    {features.map(([title, description]) => (
                        <article key={title}>
                            <h3>{title}</h3>
                            <p>{description}</p>
                        </article>
                    ))}
                </div>
            </section>
        </main>
    );
}
