import ClaimedBadge from './ClaimedBadge.jsx';
import ActionMenu from '../../../shared/common/ActionMenu.jsx';
import Icon from '../../../shared/common/Icon.jsx';
import React from 'react';
import { Link } from 'react-router-dom';
import { playerRating } from '../roster/playerRating.js';
import { resolveAssetUrl } from '../../../config/api.js';

export default function PlayerCard({
    player,
    currentUser,
    ratingCategory = 'rapid',
    showAllRatings = false,
    currentLinkedPlayerId,
    isAdmin,
    onClaim,
    onEdit,
    onDelete,
    onUnlink,
}) {
    if (!player) return null;

    const {
        id,
        name,
        bio,
        link_status,
        photo_url,
    } = player;

    const initials = name
        ? name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
        : 'P';

    const isSelf = currentLinkedPlayerId === id;
    const canEdit = isAdmin || isSelf;
    const isLinked = link_status === 'approved';
    const isPending = link_status === 'pending';

    // A regular user can claim if unlinked and they don't already have an active link
    const canClaim = currentUser && !isAdmin && !isLinked && !isPending && !currentLinkedPlayerId;

    return (
        <div className="player-card">
            <div className="player-card__header">
                <div className="player-card__avatar">
                    {photo_url ? <img src={resolveAssetUrl(photo_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : initials}
                </div>
                <div className="player-card__main">
                    <Link to={`/players/${id}`} className="player-card__name name-link" title={name}>
                        <span className="player-card__name-text">{name}</span> <ClaimedBadge status={link_status} />
                    </Link>
                    <div className="player-card__meta">
                        {(showAllRatings ? ['blitz', 'rapid', 'classical'] : [ratingCategory]).map(category => <span key={category} className="rating-badge" title={`${category[0].toUpperCase() + category.slice(1)} Elo rating`}>
                            {category[0].toUpperCase() + category.slice(1)}{showAllRatings ? ':' : ' Elo:'} {playerRating(player, category) ?? '—'}
                        </span>)}
                        {isPending && <span className="link-badge link-badge--pending"><Icon name="clock" /> Pending Claim</span>}

                    </div>
                </div>
            </div>

            {bio && <p className="player-card__bio">{bio}</p>}

            <div className="player-card__footer">
                <Link to={`/players/${id}`} className="btn-secondary btn-sm">
                    View Details
                </Link>

                <div className="player-card__actions">
                    {canClaim && (
                        <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={() => onClaim && onClaim(player)}
                            title="Claim this player profile"
                        >
                            Claim
                        </button>
                    )}

                    {canEdit && (
                        <button
                            type="button"
                            className="btn-secondary btn-sm btn-icon"
                            onClick={() => onEdit && onEdit(player)}
                            title="Edit Player Profile"
                            aria-label="Edit Player"
                        >
                            <Icon name="edit" />
                        </button>
                    )}

                    {((isAdmin || isSelf) && isLinked || isAdmin) && <ActionMenu>
                    {(isAdmin || isSelf) && isLinked && (
                        <button
                            type="button"
                            className="btn-secondary btn-sm"
                            style={{ fontSize: '0.7rem' }}
                            onClick={() => onUnlink && onUnlink(player)}
                            title="Unlink account from player"
                        >
                            Unlink
                        </button>
                    )}

                    {isAdmin && (
                        <button
                            type="button"
                            className="btn-danger btn-sm btn-icon"
                            onClick={() => onDelete && onDelete(player)}
                            title="Archive Player"
                            aria-label="Archive Player"
                        >
                            🗑️
                        </button>
                    )}
                    </ActionMenu>}
                </div>
            </div>
        </div>
    );
}
