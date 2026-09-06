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
    if (error) return <section className="public-panel public-state public-state--error" role="alert">
        <h1>Tournament could not be loaded</h1><p>{error}</p>
        <Link className="public-back-link" to={`/clubs/${clubId}`}>Back to club</Link>
    </section>;
    if (!data) return <section className="public-panel public-state" role="status">
        <h1>Loading tournament…</h1><p>Retrieving the public standings.</p>
    </section>;
    return <div className="public-page">
        <header className="public-page__header"><h1>{data.tournament.name}</h1>
            <p>{data.tournament.ratingCategory[0].toUpperCase() + data.tournament.ratingCategory.slice(1)} · {data.tournament.isRated ? 'Rated' : 'Unrated'}</p></header>
        <section className="public-card public-section"><h2>Standings</h2>
            {data.standings.length ? <div className="public-table-wrap"><table className="public-table">
                <thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Score</th></tr></thead>
                <tbody>{data.standings.map((standing, index) => <tr key={standing.publicPlayerId}>
                    <td>{index + 1}</td><td>{standing.name}</td><td><strong>{standing.score}</strong></td>
                </tr>)}</tbody>
            </table></div> : <p>No standings are available yet.</p>}
        </section>
        <div><Link className="public-back-link" to={`/clubs/${clubId}`}>← Back to club</Link></div>
    </div>;
}
