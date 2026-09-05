import React, { useEffect, useState } from 'react';
import { playerApi } from '../api/playerApi.js';
import { resolveAssetUrl } from '../../../config/api.js';

export default function EditPlayerForm({ isOpen, onClose, clubId, player, isAdmin = false, onPlayerUpdated }) {
    const [form, setForm] = useState({ name: '', bio: '', dateOfBirth: '', federationId: '' });
    const [photoFile, setPhotoFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && player) {
            setForm({
                name: player.name || '',
                bio: player.bio || '',
                dateOfBirth: player.date_of_birth?.slice(0, 10) || '',
                federationId: player.federation_id || '',
            });
            setError(null);
            setPhotoFile(null);
        }
    }, [isOpen, player]);

    useEffect(() => {
        if (!isOpen) return undefined;
        document.body.style.overflow = 'hidden';
        const handleEscape = (event) => event.key === 'Escape' && onClose();
        window.addEventListener('keydown', handleEscape);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen || !player) return null;

    const setField = (field) => (event) => setForm(current => ({ ...current, [field]: event.target.value }));

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (isAdmin && !form.name.trim()) {
            setError('Player name is required.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const shared = {
                bio: form.bio.trim() || null,
            };
            if (isAdmin) {
                await playerApi.updatePlayer(clubId, player.id, {
                    ...shared,
                    name: form.name.trim(),
                    dateOfBirth: form.dateOfBirth || null,
                    federationId: form.federationId.trim() || null,
                });
            } else {
                await playerApi.updateOwnProfile(clubId, player.id, shared);
            }
            if (photoFile) await playerApi.uploadPhoto(clubId, player.id, photoFile);
            await onPlayerUpdated?.();
            onClose?.();
        } catch (requestError) {
            setError(requestError.message || 'Failed to update player profile.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                <div className="modal-card__header">
                    <h2 className="modal-card__title">{isAdmin ? 'Edit Player Identity' : 'Edit My Profile'}</h2>
                    <button type="button" className="modal-card__close" onClick={onClose} aria-label="Close modal">×</button>
                </div>
                {error && <div className="error-box" role="alert">{error}</div>}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {isAdmin && (
                        <>
                            <div className="form-group">
                                <label className="form-label" htmlFor="edit-player-name">Official player name *</label>
                                <input id="edit-player-name" className="form-input" value={form.name} onChange={setField('name')} required autoFocus />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="edit-player-dob">Date of birth</label>
                                <input id="edit-player-dob" type="date" className="form-input" value={form.dateOfBirth} onChange={setField('dateOfBirth')} />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="edit-player-federation">Federation ID</label>
                                <input id="edit-player-federation" className="form-input" value={form.federationId} onChange={setField('federationId')} />
                            </div>
                        </>
                    )}
                    <div className="form-group">
                        <label className="form-label" htmlFor="edit-player-photo">Player photo</label>
                        {player.photo_url && <img src={resolveAssetUrl(player.photo_url)} alt="Current player" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: '50%', display: 'block', marginBottom: 8 }} />}
                        <input
                            id="edit-player-photo"
                            type="file"
                            className="form-input"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
                        />
                        <span className="form-helper">{photoFile ? `${photoFile.name} selected` : 'JPEG, PNG, or WebP; maximum 5 MB.'}</span>
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="edit-player-bio">Biography / profile notes</label>
                        <textarea id="edit-player-bio" className="form-textarea" value={form.bio} onChange={setField('bio')} placeholder="Biography, achievements, preferred openings..." />
                    </div>
                    {!isAdmin && <span className="form-helper">Official identity fields are managed by club administrators.</span>}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                        <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
                        <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving Changes...' : 'Save Changes'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
