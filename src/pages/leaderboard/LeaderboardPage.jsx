import React, { useState, useEffect, useCallback } from 'react';
import '../../styles/leaderboard.css';
import Button from '../../shared/common/Button.jsx';
import { api, endpoints } from '../../config/api.js';
import { useClub } from '../../app/contextHooks.js';

function Sparkline({ points = [] }) {
    if (!points || points.length === 0) return <div className="sparkline empty">No data</div>;
    const w = 360;
    const h = 120;
    const padding = 8;
    const min = Math.min(...points.map(p => p.rating));
    const max = Math.max(...points.map(p => p.rating));
    const dx = (w - padding * 2) / Math.max(1, points.length - 1);
    const scaleY = (value) => {
        if (max === min) return h / 2;
        return padding + (1 - (value - min) / (max - min)) * (h - padding * 2);
    };
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${padding + i * dx} ${scaleY(p.rating)}`).join(' ');
    return (
        <svg className="sparkline-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <path d={d} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export default function LeaderboardPage() {
    const { club } = useClub();
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [onlyActive, setOnlyActive] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [ratingHistory, setRatingHistory] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);

    const loadLeaderboard = useCallback(async () => {
        if (!club) return;
        setLoading(true);
        try {
            const res = await api.get(endpoints.leaderboard.list(club.id));
            const list = Array.isArray(res.players) ? res.players : (Array.isArray(res) ? res : (res.players ?? []));
            setPlayers(list);
        } catch (err) {
            console.error('Failed to load leaderboard', err);
        } finally {
            setLoading(false);
        }
    }, [club]);

    useEffect(() => {
        if (!club) return;
        loadLeaderboard();
    }, [club, loadLeaderboard]);

    function openPlayer(player) {
        setSelectedPlayer(player);
        setModalOpen(true);
        api.get(endpoints.players.ratingHistory(club.id, player.id))
            .then(res => {
                const points = Array.isArray(res.history) ? res.history : (Array.isArray(res) ? res : res.history ?? []);
                setRatingHistory(points);
            })
            .catch(() => setRatingHistory([]));
    }

    const filtered = players
        .filter(p => !onlyActive || (p.played && p.played > 0))
        .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => (b.rating || 0) - (a.rating || 0));

    return (
        <div className="leaderboard-page">
            <div className="page-header">
                <h1>Leaderboard</h1>
                <div className="controls">
                    <input className="input" placeholder="Search players" value={search} onChange={e => setSearch(e.target.value)} />
                    <label className="checkbox"><input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} /> Active only</label>
                </div>
            </div>

            <div className="leaderboard-list">
                {loading ? <div className="muted">Loading�</div> : (
                    <table className="leaderboard-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Player</th>
                                <th>ELO</th>
                                <th>Played</th>
                                <th>W</th>
                                <th>D</th>
                                <th>L</th>
                                <th>Win %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((p, i) => (
                                <tr key={p.id} className="leaderboard-row" onClick={() => openPlayer(p)}>
                                    <td className={`rank ${i < 3 ? 'top' + (i + 1) : ''}`}>{i + 1}</td>
                                    <td>{p.name}</td>
                                    <td className="mono">{p.rating ?? '�'}</td>
                                    <td>{p.played ?? 0}</td>
                                    <td>{p.wins ?? 0}</td>
                                    <td>{p.draws ?? 0}</td>
                                    <td>{p.losses ?? 0}</td>
                                    <td>{p.played ? Math.round(((p.wins || 0) / p.played) * 100) + '%' : '�'}</td>
                                </tr>
                            ))}
                            {filtered.length === 0 && <tr><td colSpan={8} className="muted">No players</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>

            {modalOpen && selectedPlayer && (
                <div className="modal-backdrop">
                    <div className="modal-content small" role="dialog" aria-modal="true">
                        <div className="modal-header">
                            <h3>{selectedPlayer.name}</h3>
                            <Button variant="secondary" onClick={() => setModalOpen(false)}>Close</Button>
                        </div>
                        <div className="modal-body">
                            <div className="player-summary">
                                <div><strong>ELO:</strong> {selectedPlayer.rating ?? '�'}</div>
                                <div><strong>Played:</strong> {selectedPlayer.played ?? 0}</div>
                                <div><strong>Win %:</strong> {selectedPlayer.played ? Math.round(((selectedPlayer.wins||0)/selectedPlayer.played)*100) + '%' : '�'}</div>
                            </div>
                            <div className="rating-history">
                                <h4>Rating history</h4>
                                <Sparkline points={ratingHistory} />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <Button variant="secondary" onClick={() => setModalOpen(false)}>Close</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
