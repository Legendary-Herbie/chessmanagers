import React from 'react';
import { Link } from 'react-router-dom';

export default function PlayerTable({
    players = [],
    currentLinkedPlayerId,
    isAdmin,
    onEdit,
    onDelete,
}) {
    if (!players || players.length === 0) return null;

    return (
        <div className="players-table-wrapper">
            <table className="players-table">
                <thead>
                    <tr>
                        <th>Player</th>
                        <th>ELO Rating</th>
                        <th>Account Link</th>
                        <th>Games</th>
                        <th>W / D / L</th>
                        <th>Win Rate</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {players.map((player) => {
                        const {
                            id,
                            name,
                            rating = 1500,
                            games = 0,
                            wins = 0,
                            draws = 0,
                            losses = 0,
                            link_status,
                        } = player;

                        const winRate = games > 0 ? Math.round(((wins + draws * 0.5) / games) * 100) : 0;
                        const isLinked = link_status === 'approved';
                        const isPending = link_status === 'pending';
                        const isSelf = currentLinkedPlayerId === id;
                        const canEdit = isAdmin || isSelf;

                        return (
                            <tr key={id}>
                                <td>
                                    <Link to={`/players/${id}`} className="player-table-name">
                                        {name}
                                    </Link>
                                </td>
                                <td>
                                    <span className="rating-badge">🏆 {rating}</span>
                                </td>
                                <td>
                                    {isLinked && <span className="link-badge link-badge--approved">✓ Claimed</span>}
                                    {isPending && <span className="link-badge link-badge--pending">⏳ Pending</span>}
                                    {!isLinked && !isPending && <span className="link-badge link-badge--unlinked">Unlinked</span>}
                                </td>
                                <td>{games}</td>
                                <td>
                                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{wins}</span> /{' '}
                                    <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{draws}</span> /{' '}
                                    <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{losses}</span>
                                </td>
                                <td><strong>{winRate}%</strong></td>
                                <td>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <Link to={`/players/${id}`} className="btn-secondary btn-sm">
                                            View
                                        </Link>
                                        {canEdit && (
                                            <button
                                                type="button"
                                                className="btn-secondary btn-sm"
                                                onClick={() => onEdit && onEdit(player)}
                                            >
                                                Edit
                                            </button>
                                        )}
                                        {isAdmin && (
                                            <button
                                                type="button"
                                                className="btn-danger btn-sm"
                                                onClick={() => onDelete && onDelete(player)}
                                            >
                                                Archive
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
