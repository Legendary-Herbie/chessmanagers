import ActionMenu from '../../../shared/common/ActionMenu.jsx';
import Icon from '../../../shared/common/Icon.jsx';
import React from 'react';
import { Link } from 'react-router-dom';
import { playerRating } from '../roster/playerRating.js';

export default function PlayerTable({
    players = [],
    ratingCategory = 'rapid',
    currentLinkedPlayerId,
    isAdmin,
    onEdit,
    onDelete,
}) {
    if (!players || players.length === 0) return null;

    return (
        <div className="players-table-wrapper">
            <table className="players-table player-roster-table">
                <thead>
                    <tr>
                        <th>Player</th>
                        <th>{ratingCategory[0].toUpperCase() + ratingCategory.slice(1)} Elo rating</th>
                        <th>Games</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {players.map((player) => {
                        const {
                            id,
                            name,
                            games = 0,

                        } = player;

                        const isSelf = currentLinkedPlayerId === id;
                        const canEdit = isAdmin || isSelf;

                        return (
                            <tr key={id}>
                                <td>
                                    <Link to={`/players/${id}`} className="player-table-name name-link">
                                        {name}
                                    </Link>
                                </td>
                                <td>
                                    <span className="rating-badge"><Icon name="trophy" /><span className="mobile-rating-label">{ratingCategory[0].toUpperCase() + ratingCategory.slice(1)} </span> {playerRating(player, ratingCategory) ?? '—'}</span>
                                </td>
                                <td>{games}</td>
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
                                        {isAdmin && <ActionMenu>
                                            <button
                                                type="button"
                                                className="btn-danger btn-sm"
                                                onClick={() => onDelete && onDelete(player)}
                                            >
                                                Archive
                                            </button>
                                        </ActionMenu>}
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
