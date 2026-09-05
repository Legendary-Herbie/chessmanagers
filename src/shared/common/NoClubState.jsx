import React from 'react';
import { Link } from 'react-router-dom';

export default function NoClubState({
    title = 'Your chess club starts here',
    description = 'Create a club to manage it, or find an existing club and join its community.',
    feature,
}) {
    return (
        <section className="no-club-state" aria-labelledby="no-club-title">
            <span className="no-club-state__eyebrow">No active club yet</span>
            <h1 id="no-club-title">{title}</h1>
            {feature && <p className="no-club-state__feature">{feature}</p>}
            <p>{description}</p>
            <div className="no-club-state__actions">
                <Link className="btn-primary" to="/create-club">Create a club</Link>
                <Link className="btn-secondary" to="/clubs">Find a club</Link>
            </div>
        </section>
    );
}
