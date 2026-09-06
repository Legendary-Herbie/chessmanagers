import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { resolveAssetUrl } from '../../config/api.js';
import { publicApi } from '../../features/public/api/publicApi.js';

export default function PublicPlayerPage() {
    const { clubId, publicPlayerId } = useParams();
    const [player, setPlayer] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        publicApi.fetchPlayer(clubId, publicPlayerId, { signal: controller.signal })
            .then(setPlayer)
            .catch(error => {
                if (!controller.signal.aborted) setError(error.message || 'Player not found.');
            });
        return () => controller.abort();
    }, [clubId, publicPlayerId]);
    if (error) return <section className="public-panel public-state public-state--error" role="alert">
        <h1>Player could not be loaded</h1><p>{error}</p>
        <Link className="public-back-link" to={`/clubs/${clubId}`}>Back to club</Link>
    </section>;
    if (!player) return <section className="public-panel public-state" role="status">
        <h1>Loading player…</h1><p>Retrieving this player’s public profile.</p>
    </section>;
    return <div className="public-page">
        <article className="public-card public-section public-profile">
            {player.photoUrl && <img className="public-profile__photo" src={resolveAssetUrl(player.photoUrl)} alt={`${player.name} profile`} />}
            <div><h1>{player.name}</h1>{player.bio && <p>{player.bio}</p>}</div>
            <dl className="public-ratings">{Object.entries(player.ratings).map(([category, rating]) =>
                <div className="public-rating" key={category}><dt>{category[0].toUpperCase() + category.slice(1)}</dt><dd>{rating}</dd></div>
            )}</dl>
        </article>
        <div><Link className="public-back-link" to={`/clubs/${clubId}`}>← Back to club</Link></div>
    </div>;
}
