import React, { useState, useEffect } from 'react';
import { playerApi } from '../api/playerApi.js';

export default function EditPlayerForm({ isOpen, onClose, clubId, player, onPlayerUpdated }) {
    const [name, setName] = useState('');
    const [bio, setBio] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && player) {
            setName(player.name || '');
            setBio(player.bio || '');
            setError(null);
        } else {
            setName('');
            setBio('');
            setError(null);
        }
    }, [isOpen, player]);

    // Body scroll lock
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            const handleEscape = (e) => {
                if (e.key === 'Escape') onClose();
            };
            window.addEventListener('keydown', handleEscape);
            return () => {
                document.body.style.overflow = '';
                window.removeEventListener('keydown', handleEscape);
            };
        }
    }, [isOpen, onClose]);

    if (!isOpen || !player) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Player name is required.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await playerApi.updatePlayer(clubId, player.id, {
                name: name.trim(),
                bio: bio.trim() || undefined,
            });

            if (onPlayerUpdated) onPlayerUpdated();
            if (onClose) onClose();
        } catch (err) {
            setError(err.message || 'Failed to update player profile.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-card__header">
                    <h2 className="modal-card__title">Edit Player Profile</h2>
                    <button type="button" className="modal-card__close" onClick={onClose} aria-label="Close modal">
                        ✕
                    </button>
                </div>

                {error && <div className="error-box">{error}</div>}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="edit-player-name">Player Name *</label>
                        <input
                            id="edit-player-name"
                            type="text"
                            className="form-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="edit-player-bio">Biography / Profile Notes</label>
                        <textarea
                            id="edit-player-bio"
                            className="form-textarea"
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Biography, achievements, preferred openings..."
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                        <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-primary" disabled={loading}>
                            {loading ? 'Saving Changes...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
