import React from 'react';
import { Link } from 'react-router-dom';
import './siteFooter.css';

export default function SiteFooter() {
    return <footer className="site-footer">
        <div className="site-footer__inner">
            <div className="site-footer__about"><Link className="site-footer__brand" to="/">1chessclub</Link><p>Players, games, and community in one place.</p><small>&copy; {new Date().getFullYear()} 1chessclub.</small></div>
            <nav aria-label="Footer navigation"><Link to="/">Home</Link><Link to="/clubs">Find clubs</Link></nav>
            <div className="site-footer__contact"><strong>Help improve 1chessclub</strong><p>Report bugs or faults, or suggest an improvement.</p><a href="mailto:okpoti.herbert@gmail.com?subject=1chessclub%20feedback">okpoti.herbert@gmail.com</a></div>
        </div>
    </footer>;
}
