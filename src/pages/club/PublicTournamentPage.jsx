import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { publicApi } from '../../features/public/api/publicApi.js';

export default function PublicTournamentPage() {
    const { clubId, tournamentId } = useParams();
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        publicApi.fetchTournament(clubId, tournamentId, { signal: controller.signal })
            .then(setData).catch(error => {
                if (!controller.signal.aborted) setError(error.message || 'Tournament not found.');
            });
        return () => controller.abort();
    }, [clubId, tournamentId]);
    if (error) return <p>{error}</p>;
    if (!data) return <p>Loading tournament…</p>;
    return <div><h1>{data.tournament.name}</h1>
        <p>{data.tournament.ratingCategory} · {data.tournament.isRated ? 'Rated' : 'Unrated'}</p>
        <h2>Standings</h2>
        <ol>{data.standings.map(standing => <li key={standing.publicPlayerId}>{standing.name} — {standing.score}</li>)}</ol>
        <Link to={`/clubs/${clubId}`}>Back to club</Link>
    </div>;
}
