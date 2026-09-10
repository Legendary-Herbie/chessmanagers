import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isCancelledError, resolveAssetUrl } from '../../config/api.js';
import { useAuth, useClub, useNotifications } from '../../app/contextHooks.js';
import { clubApi } from '../../features/clubs/api/clubApi.js';

const PAGE_SIZE = 20;

export default function FindClubsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialCode = /^\d{6}$/.test(searchParams.get('joinCode') || '') ? searchParams.get('joinCode') : '';
    const [discoveryMode, setDiscoveryMode] = useState(initialCode ? 'code' : 'search');
    const [clubs, setClubs] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [joinCode, setJoinCode] = useState(initialCode);
    const [joiningByCode, setJoiningByCode] = useState(false);
    const [joinMessage, setJoinMessage] = useState(null);
    const query = searchParams.get('q') || '';
    const [draftQuery, setDraftQuery] = useState(query);
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
    const { user } = useAuth();
    const { refreshClubs } = useClub();
    const { notify } = useNotifications();
    const navigate = useNavigate();

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        clubApi.listPublic(
            { q: query, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
            { signal: controller.signal },
        )
            .then(data => {
                setClubs(data.clubs || []);
                setTotal(data.total || 0);
                setError(null);
            })
            .catch(requestError => {
                if (!isCancelledError(requestError)) {
                    setError(requestError.message || 'Failed to load clubs');
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [query, page]);

    useEffect(() => setDraftQuery(query), [query]);

    useEffect(() => {
        if (draftQuery === query) return undefined;
        const timer = window.setTimeout(() => {
            const next = new URLSearchParams();
            const trimmedQuery = draftQuery.trim();
            if (trimmedQuery) next.set('q', trimmedQuery);
            setSearchParams(next, { replace: true });
        }, 300);
        return () => window.clearTimeout(timer);
    }, [draftQuery, query, setSearchParams]);

    async function handleJoinCode(event) {
        event.preventDefault();
        setJoinMessage(null);
        if (!/^\d{6}$/.test(joinCode)) {
            setJoinMessage({ type: 'error', text: 'Enter the complete six-digit club join code.' });
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
            navigate('/dashboard', { state: { joinMessage: 'You joined the club successfully.' } });
        } catch (requestError) {
            const text = requestError.message || 'Unable to join with that code.';
            setJoinMessage({ type: 'error', text });
            notify(text, 'error');
        } finally {
            setJoiningByCode(false);
        }
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const goToPage = nextPage => setSearchParams({
        ...(query ? { q: query } : {}), page: String(nextPage),
    }, { replace: true });

    return <div className="public-page">
        <header className="public-page__header">
            <div><h1>Find clubs</h1>
                <p>Discover public chess clubs, or use a six-digit code to join a private club.</p></div>
            {user && <Link className="public-link-button" to="/create-club">Create a club</Link>}
        </header>

        {joinMessage && <section className={`public-panel public-join-message public-join-message--${joinMessage.type}`}
            role={joinMessage.type === 'error' ? 'alert' : 'status'}>{joinMessage.text}</section>}

        <div className="public-panel discovery-hub">
            <div className="discovery-switch" role="group" aria-label="Find a club by">
                <button type="button" className="public-button public-button--secondary" aria-pressed={discoveryMode === 'search'} onClick={() => setDiscoveryMode('search')}>Search public clubs</button>
                <button type="button" className="public-button public-button--secondary" aria-pressed={discoveryMode === 'code'} onClick={() => setDiscoveryMode('code')}>Have a join code?</button>
            </div>
            <section hidden={discoveryMode !== 'search'} aria-labelledby="club-search-heading">
                <label className="public-field">
                    <span id="club-search-heading">Search public clubs</span>
                    <input className="public-input" type="search" aria-label="Search public clubs"
                        placeholder="Search clubs or federations" value={draftQuery}
                        onChange={event => setDraftQuery(event.target.value)} />
                </label>
            </section>
            <form hidden={discoveryMode !== 'code'} className="public-join-form" onSubmit={handleJoinCode}>
                <label className="public-field"><span>Join a private club</span>
                    <input className="public-input" aria-label="Six-digit join code" inputMode="numeric"
                        autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={joinCode}
                        onChange={event => setJoinCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000" />
                </label>
                <button className="public-button" type="submit" disabled={joiningByCode || joinCode.length !== 6}>
                    {joiningByCode ? 'Joining…' : 'Join with code'}
                </button>
            </form>
        </div>

        {discoveryMode === 'search' && <>
        <div className="public-results-status" role="status" aria-live="polite">
            {loading ? (clubs.length ? 'Updating results…' : 'Loading clubs…') : null}
        </div>
        {error && <section className="public-panel public-state public-state--error" role="alert">
            <h2>Clubs could not be loaded</h2><p>{error}</p>
        </section>}
        {!error && clubs.length > 0 && <div className="public-club-grid" aria-busy={loading}>
            {clubs.map(club => <article className="public-card public-club-card" key={club.id}>
                {club.logo ? <img className="public-club-card__logo" src={resolveAssetUrl(club.logo)} alt="" />
                    : <div className="public-club-card__placeholder" aria-hidden="true" />}
                <div className="public-club-card__body"><h2>{club.name}</h2>
                    <p>{club.federation || 'Independent club'}</p></div>
                <div className="public-club-card__action">
                    <Link className="public-link-button" to={`/clubs/${club.id}`}>View club</Link>
                </div>
            </article>)}
        </div>}
        {!loading && !error && clubs.length === 0 && <section className="public-panel public-state">
            <h2>No public clubs found</h2><p>Try a different club or federation name.</p>
        </section>}
        {!error && totalPages > 1 && <nav className="public-pagination" aria-label="Club search pages">
            <button className="public-button public-button--secondary" type="button" disabled={page === 1 || loading}
                onClick={() => goToPage(page - 1)}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button className="public-button public-button--secondary" type="button" disabled={page >= totalPages || loading}
                onClick={() => goToPage(page + 1)}>Next</button>
        </nav>}
        </>}
    </div>;
}
