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
                // NOTE: this intentionally does NOT pass ?all=1. That param
                // used to be appended here and routed to ClubModel.listAll(),
                // which ignores the club's public_leaderboard/is_public flag
                // entirely — any club marked "Private (invite-only)" in
                // CreateClub.jsx was still returned to every visitor,
                // logged in or not. The server now only honors ?all=1 for an
                // authenticated system admin (see listClubs in
                // clubController.js); everyone else always gets the
                // public-only listing, so this page must rely on that
                // default rather than requesting the bypass.
                const data = await api.get(endpoints.clubs.list());
                const list = Array.isArray(data) ? data : (data?.clubs || []);
                setClubs(list);
                setError(null);
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
            <p className="muted" style={{ marginTop: -8 }}>
                Showing publicly listed clubs. Have an invite link or a direct
                club URL? You can open and request to join a private club
                that way even if it isn't listed here.
            </p>

            {loading && <p>Loading clubs…</p>}
            {error && <p style={{ color: 'var(--danger)' }}>Error: {error}</p>}

            {!loading && !error && (
                <div>
                    {clubs.length === 0 ? (
                        <p>No public clubs found yet.</p>
                    ) : (
                        <ul style={{ listStyle: 'none', padding: 0 }}>
                            {clubs.map(club => (
                                <li key={club.id} style={{ marginBottom: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        {club.logo ? (
                                            <img
                                                src={club.logo}
                                                alt={`${club.name} logo`}
                                                style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8 }}
                                            />
                                        ) : (
                                            <div style={{ width: 40, height: 40, background: 'var(--bg-muted)', borderRadius: 8 }} />
                                        )}

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