import React from 'react';
import { Link } from 'react-router-dom';
import { resolveAssetUrl } from '../../../config/api.js';

export default function PlayerCard({
    player,
    currentUser,
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
        rating = 1500,
        bio,
        games = 0,
        wins = 0,
        draws = 0,
        losses = 0,
        link_status,
        photo_url,
    } = player;

    const initials = name
        ? name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
        : 'P';

    const winRate = games > 0 ? Math.round(((wins + (draws * 0.5)) / games) * 100) : 0;
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
                    <Link to={`/players/${id}`} className="player-card__name" title={name}>
                        {name}
                    </Link>
                    <div className="player-card__meta">
                        <span className="rating-badge" title="ELO Rating">
                            🏆 {rating}
                        </span>
                        {isLinked && <span className="link-badge link-badge--approved">✓ Claimed</span>}
                        {isPending && <span className="link-badge link-badge--pending">⏳ Pending Claim</span>}
                        {!isLinked && !isPending && <span className="link-badge link-badge--unlinked">Unlinked</span>}
                    </div>
                </div>
            </div>

            {bio ? (
                <p className="player-card__bio">{bio}</p>
            ) : (
                <p className="player-card__bio" style={{ fontStyle: 'italic', opacity: 0.6 }}>
                    No bio provided.
                </p>
            )}

            <div className="player-card__stats">
                <div className="player-card__stat-item">
                    <span className="player-card__stat-val">{games}</span>
                    <span className="player-card__stat-lbl">Played</span>
                </div>
                <div className="player-card__stat-item">
                    <span className="player-card__stat-val" style={{ color: 'var(--accent)' }}>{wins}</span>
                    <span className="player-card__stat-lbl">Wins</span>
                </div>
                <div className="player-card__stat-item">
                    <span className="player-card__stat-val" style={{ color: 'var(--warning)' }}>{draws}</span>
                    <span className="player-card__stat-lbl">Draws</span>
                </div>
                <div className="player-card__stat-item">
                    <span className="player-card__stat-val" style={{ color: 'var(--danger)' }}>{losses}</span>
                    <span className="player-card__stat-lbl">Losses</span>
                </div>
                <div className="player-card__stat-item">
                    <span className="player-card__stat-val">{winRate}%</span>
                    <span className="player-card__stat-lbl">Win %</span>
                </div>
            </div>

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
                            ✏️
                        </button>
                    )}

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
                </div>
            </div>
        </div>
    );
}
