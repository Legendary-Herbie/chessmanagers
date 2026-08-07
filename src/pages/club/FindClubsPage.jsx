import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '../../config/api.js';

export default function FindClubsPage() {
    const [clubs, setClubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                const data = await api.get(endpoints.clubs.create() + '?all=1');
                // API returns { clubs: [...] } — accept both shapes for compatibility
                const list = Array.isArray(data) ? data : (data?.clubs || []);
                setClubs(list);
            } catch (err) {
                setError(err?.message || 'Failed to load clubs');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    return (
        <div>
            <h1>Find Clubs</h1>
            {loading && <p>Loading clubs…</p>}
            {error && <p style={{ color: 'var(--danger)' }}>Error: {error}</p>}
            {!loading && !error && (
                <div>
                    {clubs.length === 0 ? (
                        <p>No clubs found.</p>
                    ) : (
                        <ul style={{ listStyle: 'none', padding: 0 }}>
                            {clubs.map(club => (
                                <li key={club.id} style={{ marginBottom: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div>
                                            <strong>{club.name}</strong>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{club.federation || ''}</div>
                                        </div>

                                        <div style={{ marginLeft: 'auto' }}>
                                            <Link to={`/clubs/${club.id}`}>View</Link>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
