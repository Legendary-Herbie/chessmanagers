import React, { useState, useEffect, useCallback } from 'react';
import '../../styles/matches.css';
import Button from '../../shared/common/Button.jsx';
import { api, endpoints } from '../../config/api.js';
import { useClub, useAuth } from '../../app/contextHooks.js';

export default function MatchesPage() {
    const { club } = useClub();
    const { isAdmin } = useAuth();

    const [matches, setMatches] = useState([]);
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    const [modalOpen, setModalOpen] = useState(false);
    const [editingMatch, setEditingMatch] = useState(null);
    const [form, setForm] = useState({ whiteId: '', blackId: '', outcome: 'white', timeControl: 'blitz', notes: '' });
    const [error, setError] = useState(null);

    const refreshAll = useCallback(async () => {
        if (!club) return;
        setLoading(true);
        try {
            const [mRes, pRes] = await Promise.all([
                api.get(endpoints.matches.list(club.id)),
                api.get(endpoints.players.list(club.id)),
            ]);
            setMatches(Array.isArray(mRes.matches) ? mRes.matches : mRes ?? []);
            setPlayers(Array.isArray(pRes.players) ? pRes.players : pRes ?? []);
        } catch (err) {
            setError(err.message || 'Failed to load matches');
        } finally {
            setLoading(false);
        }
    }, [club]);

    useEffect(() => {
        if (!club) return;
        refreshAll();
    }, [club, refreshAll]);

    function openAddModal() {
        setEditingMatch(null);
        setForm({ whiteId: '', blackId: '', outcome: 'white', timeControl: 'blitz', notes: '' });
        setModalOpen(true);
    }

    function openEditModal(match) {
        setEditingMatch(match);
        setForm({
            whiteId: match.whitePlayerId ?? match.white_player_id ?? '',
            blackId: match.blackPlayerId ?? match.black_player_id ?? '',
            outcome: match.result ?? match.outcome,
            timeControl: match.timeControl ?? match.time_control ?? 'blitz',
            notes: match.notes || '',
        });
        setModalOpen(true);
    }

    async function submitForm() {
        setError(null);
        if (!form.whiteId || !form.blackId) return setError('Select both players');
        if (form.whiteId === form.blackId) return setError('Players must be different');

        const payload = {
            whitePlayerId: form.whiteId,
            blackPlayerId: form.blackId,
            result: form.outcome,
            timeControl: form.timeControl,
            notes: form.notes,
            playedAt: new Date().toISOString(),
        };

        try {
            if (editingMatch) {
                await api.patch(endpoints.matches.byId(club.id, editingMatch.id), payload);
            } else {
                await api.post(endpoints.matches.list(club.id), payload);
            }
            setModalOpen(false);
            await refreshAll();
        } catch (err) {
            setError(err.message || 'Failed to save match');
        }
    }

    async function deleteMatch(id) {
        if (!confirm('Delete this match? This action cannot be undone. Ratings will be recomputed on the server.')) return;
        try {
            await api.delete(endpoints.matches.byId(club.id, id));
            await refreshAll();
        } catch (err) {
            alert(err.message || 'Failed to delete match');
        }
    }

    const visibleMatches = matches.filter(m => {
        if (!search) return true;
        const q = search.toLowerCase();
        const white = (players.find(p => p.id === (m.whitePlayerId ?? m.white_player_id))?.name || '').toLowerCase();
        const black = (players.find(p => p.id === (m.blackPlayerId ?? m.black_player_id))?.name || '').toLowerCase();
        return white.includes(q) || black.includes(q) || (m.notes || '').toLowerCase().includes(q);
    });

    return (
        <div className="matches-page">
            <div className="page-header">
                <h1>Matches</h1>
                {isAdmin && <Button onClick={openAddModal} className="ml-4">Add Match</Button>}
            </div>

            <div className="matches-controls">
                <input
                    className="input"
                    placeholder="Search by player or notes"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    aria-label="Search matches"
                />
            </div>

            <div className="matches-list">
                {loading ? (
                    <div className="muted">Loading...</div>
                ) : (
                    <table className="matches-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>White</th>
                                <th>Black</th>
                                <th>Result</th>
                                <th>Time</th>
                                <th>Notes</th>
                                {isAdmin && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {visibleMatches.map(m => (
                                <tr key={m.id}>
                                    <td>{new Date(m.playedAt || m.played_at || m.createdAt || m.created_at || Date.now()).toLocaleString()}</td>
                                    <td>{players.find(p => p.id === (m.whitePlayerId ?? m.white_player_id))?.name ?? (m.whitePlayerId ?? m.white_player_id)}</td>
                                    <td>{players.find(p => p.id === (m.blackPlayerId ?? m.black_player_id))?.name ?? (m.blackPlayerId ?? m.black_player_id)}</td>
                                    <td>{(m.result ?? m.outcome) === 'white' ? '1-0' : (m.result ?? m.outcome) === 'black' ? '0-1' : '�-�'}</td>
                                    <td className="badge time-control">{(m.timeControl ?? m.time_control ?? 'blitz').toUpperCase()}</td>
                                    <td>{m.notes}</td>
                                    {isAdmin && (
                                        <td>
                                            <Button variant="secondary" onClick={() => openEditModal(m)} className="mr-2">Edit</Button>
                                            <Button variant="danger" onClick={() => deleteMatch(m.id)}>Delete</Button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {visibleMatches.length === 0 && (
                                <tr><td colSpan={isAdmin ? 7 : 6} className="muted">No matches found.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {modalOpen && (
                <div className="modal-backdrop">
                    <div className="modal-content small" role="dialog" aria-modal="true">
                        <div className="modal-header">
                            <h3>{editingMatch ? 'Edit Match' : 'Add Match'}</h3>
                            <Button variant="secondary" onClick={() => setModalOpen(false)}>Close</Button>
                        </div>

                        <div className="modal-body">
                            {error && <div className="error">{error}</div>}

                            <label className="form-row">
                                <div className="label">White</div>
                                <select value={form.whiteId} onChange={e => setForm({ ...form, whiteId: e.target.value })} className="input">
                                    <option value="">� Select White �</option>
                                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </label>

                            <label className="form-row">
                                <div className="label">Black</div>
                                <select value={form.blackId} onChange={e => setForm({ ...form, blackId: e.target.value })} className="input">
                                    <option value="">� Select Black �</option>
                                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </label>

                            <label className="form-row">
                                <div className="label">Result</div>
                                <select value={form.outcome} onChange={e => setForm({ ...form, outcome: e.target.value })} className="input">
                                    <option value="white">White wins</option>
                                    <option value="black">Black wins</option>
                                    <option value="draw">Draw</option>
                                </select>
                            </label>

                            <label className="form-row">
                                <div className="label">Time control</div>
                                <select value={form.timeControl} onChange={e => setForm({ ...form, timeControl: e.target.value })} className="input">
                                    <option value="blitz">Blitz</option>
                                    <option value="rapid">Rapid</option>
                                    <option value="classical">Classical</option>
                                </select>
                            </label>

                            <label className="form-row">
                                <div className="label">Notes (optional)</div>
                                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input" />
                            </label>
                        </div>

                        <div className="modal-footer">
                            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
                            <Button variant="primary" onClick={submitForm}>{editingMatch ? 'Save changes' : 'Create match'}</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
