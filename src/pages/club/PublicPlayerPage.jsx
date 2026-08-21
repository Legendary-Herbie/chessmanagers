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
    if (error) return <p>{error}</p>;
    if (!player) return <p>Loading player…</p>;
    return <div>
        {player.photoUrl && <img src={resolveAssetUrl(player.photoUrl)} alt="" style={{ width: 96, height: 96, objectFit: 'cover' }} />}
        <h1>{player.name}</h1>
        {player.bio && <p>{player.bio}</p>}
        <dl>{Object.entries(player.ratings).map(([category, rating]) => <React.Fragment key={category}>
            <dt>{category}</dt><dd>{rating}</dd>
        </React.Fragment>)}</dl>
        <Link to={`/clubs/${clubId}`}>Back to club</Link>
    </div>;
}
