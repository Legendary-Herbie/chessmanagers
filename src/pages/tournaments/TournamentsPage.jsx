import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../../styles/tournaments.css';
import { useClub } from '../../app/contextHooks.js';
import Button from '../../shared/common/Button.jsx';
import Dialog from '../../shared/common/Dialog.jsx';
import { tournamentApi } from '../../features/tournaments/api/tournamentApi.js';
import NoClubState from '../../shared/common/NoClubState.jsx';

function localDateTime(value = new Date()) {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
        .toISOString().slice(0, 16);
}

function emptyForm() {
    return {
        name: '',
        type: 'swiss',
        startDate: localDateTime(),
        endDate: '',
        ratingCategory: 'rapid',
        isRated: true,
    };
}

const title = value => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

export default function TournamentsPage() {
    const navigate = useNavigate();
    const { club, capabilities } = useClub();
    const isAdmin = Boolean(capabilities.canManageMatches);
    const [tournaments, setTournaments] = useState([]);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);

    const load = useCallback(async () => {
        if (!club?.id) return;
        setLoading(true);
        try {
            const response = await tournamentApi.list(club.id, { q: search, status, limit: 100 });
            setTournaments(response.tournaments || []);
            setError('');
        } catch (requestError) {
            setError(requestError.message || 'Unable to load tournaments.');
        } finally {
            setLoading(false);
        }
    }, [club?.id, search, status]);

    useEffect(() => { void load(); }, [load]);

    async function createTournament(event) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const response = await tournamentApi.create(club.id, {
                ...form,
                startDate: new Date(form.startDate).toISOString(),
                endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
            });
            setModalOpen(false);
            setForm(emptyForm());
            navigate(`/tournaments/${response.tournament.id}`);
        } catch (requestError) {
            setError(requestError.message || 'Unable to create tournament.');
        } finally {
            setSaving(false);
        }
    }

    if (!club) return <NoClubState title="Your first tournament begins with a club"
        feature="Organize Swiss or Round-Robin events, manage participants and results, and choose whether games affect club ratings."
        description="Create a club for your event, or join an existing club to see its tournaments." />;

    return (
        <div className="tournaments-page">
            <div className="page-header">
                <div><h1>Tournaments</h1><p className="muted">Run deterministic Swiss and Round-Robin events.</p></div>
                {isAdmin && <Button onClick={() => { setForm(emptyForm()); setModalOpen(true); }}>New tournament</Button>}
            </div>
            {error && !modalOpen && <div className="error" role="alert"><p>Couldn’t load tournaments. Try again. {error}</p><Button variant="secondary" disabled={loading} onClick={() => load()}>Retry</Button></div>}
            <div className="tournament-filters">
                <input className="input" value={search} onChange={event => setSearch(event.target.value)}
                    placeholder="Search tournaments" aria-label="Search tournaments" />
                <select className="input" value={status} onChange={event => setStatus(event.target.value)} aria-label="Filter tournament status">
                    <option value="">All statuses</option>
                    <option value="upcoming">Upcoming</option><option value="active">Active</option><option value="completed">Completed</option>
                </select>
            </div>
            <div className="tournament-grid" aria-busy={loading}>
                {loading ? <p className="muted">Loading...</p> : tournaments.map(tournament => (
                    <Link className="tournament-card" to={`/tournaments/${tournament.id}`} key={tournament.id}>
                        <div className="tournament-card__top"><h2>{tournament.name}</h2><span className={`tournament-status ${tournament.status}`}>{title(tournament.status)}</span></div>
                        <div className="tournament-meta">
                            <span>{title(tournament.type)}</span>
                            <span>{title(tournament.rating_category)}</span>
                            <span>{tournament.is_rated ? 'Rated' : 'Unrated'}</span>
                        </div>
                        <p>Starts {new Date(tournament.start_date).toLocaleString()}</p>
                        <p className="muted">Round {tournament.current_round || 0}</p>
                    </Link>
                ))}
                {!loading && !tournaments.length && <div className="empty-tournaments"><h2>No tournaments found</h2><p className="muted">Create an event or adjust the filters.</p></div>}
            </div>

            {modalOpen && <Dialog title="New tournament" busy={saving} onClose={() => setModalOpen(false)}>
                <form onSubmit={createTournament}>
                    <div className="modal-body">
                        {error && <div className="error" role="alert">{error}</div>}
                        <label className="form-row"><span className="label">Name</span><input className="input" required maxLength={150} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
                        <label className="form-row"><span className="label">Format</span><select className="input" value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}><option value="swiss">Swiss</option><option value="round_robin">Round Robin</option></select></label>
                        <label className="form-row"><span className="label">Rating category</span><select className="input" value={form.ratingCategory} onChange={event => setForm({ ...form, ratingCategory: event.target.value })}><option value="blitz">Blitz</option><option value="rapid">Rapid</option><option value="classical">Classical</option></select></label>
                        <label className="rated-toggle"><input type="checkbox" checked={form.isRated} onChange={event => setForm({ ...form, isRated: event.target.checked })} />Rated tournament</label>
                        <label className="form-row"><span className="label">Starts</span><input type="datetime-local" className="input" required value={form.startDate} onChange={event => setForm({ ...form, startDate: event.target.value })} /></label>
                        <label className="form-row"><span className="label">Ends (optional)</span><input type="datetime-local" className="input" value={form.endDate} onChange={event => setForm({ ...form, endDate: event.target.value })} /></label>
                    </div>
                    <div className="modal-footer"><Button variant="secondary" disabled={saving} onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>Create tournament</Button></div>
                </form>
            </Dialog>}
        </div>
    );
}
