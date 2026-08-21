import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resolveAssetUrl } from '../../config/api.js';
import { useAuth, useClub, useNotifications } from '../../app/contextHooks.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';

const PAGE_SIZE = 20;

export default function FindClubsPage() {
    const [clubs, setClubs] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [joinCode, setJoinCode] = useState('');
    const [joiningByCode, setJoiningByCode] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
    const { user } = useAuth();
    const { refreshClubs } = useClub();
    const { notify } = useNotifications();
    const navigate = useNavigate();

    useEffect(() => {
        let active = true;
        setLoading(true);
        clubApi.listPublic({ q: query, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
            .then(data => {
                if (!active) return;
                setClubs(data.clubs || []);
                setTotal(data.total || 0);
                setError(null);
            })
            .catch(requestError => active && setError(requestError.message || 'Failed to load clubs'))
            .finally(() => active && setLoading(false));
        return () => { active = false; };
    }, [query, page]);

    function updateSearch(value) {
        const next = new URLSearchParams(searchParams);
        if (value) next.set('q', value); else next.delete('q');
        next.delete('page');
        setSearchParams(next, { replace: true });
    }

    async function handleJoinCode(event) {
        event.preventDefault();
        if (!/^\d{6}$/.test(joinCode)) {
            notify('Enter the six-digit club join code.', 'error');
            return;
        }
        if (!user) {
            navigate(`/auth/login?joinCode=${encodeURIComponent(joinCode)}`);
            return;
        }
        setJoiningByCode(true);
        try {
            const result = await clubApi.joinByCode(joinCode);
            await refreshClubs(result.clubId);
            notify('You joined the club.', 'success');
            navigate('/dashboard');
        } catch (requestError) {
            notify(requestError.message || 'Unable to join with that code.', 'error');
        } finally {
            setJoiningByCode(false);
        }
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const goToPage = nextPage => setSearchParams({
        ...(query ? { q: query } : {}), page: String(nextPage),
    }, { replace: true });

    return <div>
        <h1>Find Clubs</h1>
        <p className="muted">Public clubs are searchable here. Private clubs require an invite or join code.</p>
        <input aria-label="Search public clubs" placeholder="Search clubs or federations"
            value={query} onChange={event => updateSearch(event.target.value)} />

        <form onSubmit={handleJoinCode} style={{ display: 'flex', gap: 8, alignItems: 'end', margin: '18px 0' }}>
            <label><span style={{ display: 'block', marginBottom: 4 }}>Join a private club</span>
                <input aria-label="Six-digit join code" inputMode="numeric" autoComplete="one-time-code"
                    pattern="[0-9]{6}" maxLength={6} value={joinCode}
                    onChange={event => setJoinCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000" />
            </label>
            <button type="submit" disabled={joiningByCode || joinCode.length !== 6}>
                {joiningByCode ? 'Joining…' : 'Join with code'}
            </button>
        </form>

        {loading && <p>Loading clubs…</p>}
        {error && <p style={{ color: 'var(--danger)' }}>Error: {error}</p>}
        {!loading && !error && (clubs.length ? <>
            <ul style={{ listStyle: 'none', padding: 0 }}>{clubs.map(club => <li key={club.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {club.logo ? <img src={resolveAssetUrl(club.logo)} alt={`${club.name} logo`}
                        style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8 }} />
                        : <div style={{ width: 40, height: 40, background: 'var(--bg-muted)', borderRadius: 8 }} />}
                    <div><strong>{club.name}</strong><div className="muted">{club.federation || ''}</div></div>
                    <div style={{ marginLeft: 'auto' }}><Link to={`/clubs/${club.id}`}>View</Link></div>
                </div>
            </li>)}</ul>
            {totalPages > 1 && <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <button type="button" disabled={page === 1} onClick={() => goToPage(page - 1)}>Previous</button>
                <span>Page {page} of {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>Next</button>
            </div>}
        </> : <p>No public clubs found.</p>)}
    </div>;
}
