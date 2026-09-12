import ClaimedBadge from '../components/ClaimedBadge.jsx';
import ActionMenu from '../../../shared/common/ActionMenu.jsx';
import Icon from '../../../shared/common/Icon.jsx';
import React from 'react';
import { Link } from 'react-router-dom';
import { playerRating } from '../roster/playerRating.js';

export default function PlayerTable({
    players = [],
    ratingCategory = 'rapid',
    showAllRatings = false,
    currentLinkedPlayerId,
    currentUser,
    onClaim,
    onUnlink,
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
                        <th>{showAllRatings ? 'Elo ratings' : `${ratingCategory[0].toUpperCase() + ratingCategory.slice(1)} Elo rating`}</th>
                        <th>Games (all)</th>
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
                        const isLinked = player.link_status === 'approved';
                        const canClaim = currentUser && !isAdmin && !isLinked && player.link_status !== 'pending' && !currentLinkedPlayerId;

                        return (
                            <tr key={id}>
                                <td>
                                    <Link to={`/players/${id}`} className="player-table-name name-link">
                                        {name} <ClaimedBadge status={player.link_status} />
                                    </Link>
                                </td>
                                <td>
                                    <div className="player-table-ratings">{(showAllRatings ? ['blitz', 'rapid', 'classical'] : [ratingCategory]).map(category =>
                                        <span key={category} className="rating-badge"><Icon name="trophy" /><span className={showAllRatings ? '' : 'mobile-rating-label'}>{category[0].toUpperCase() + category.slice(1)} </span> {playerRating(player, category) ?? '—'}</span>
                                    )}</div>
                                </td>
                                <td>{games}</td>
                                <td>
                                    <div className="player-table-actions">
                                        <Link to={`/players/${id}`} className="btn-secondary btn-sm">
                                            View
                                        </Link>
                                        {canClaim && <button type="button" className="btn-primary btn-sm" onClick={() => onClaim?.(player)}>Claim</button>}
                                        {canEdit && (
                                            <button
                                                type="button"
                                                className="btn-secondary btn-sm"
                                                onClick={() => onEdit && onEdit(player)}
                                            >
                                                Edit
                                            </button>
                                        )}
                                        {(isAdmin || isSelf && isLinked) && <ActionMenu>
                                            {isLinked && <button type="button" className="btn-secondary btn-sm" onClick={() => onUnlink?.(player)}>Unlink</button>}
                                            {isAdmin &&
                                            <button
                                                type="button"
                                                className="btn-danger btn-sm"
                                                onClick={() => onDelete && onDelete(player)}
                                            >
                                                Archive
                                            </button>}
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
