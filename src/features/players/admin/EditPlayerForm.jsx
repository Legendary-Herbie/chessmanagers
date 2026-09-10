import React, { useEffect, useState } from 'react';
import { playerApi } from '../api/playerApi.js';
import { resolveAssetUrl } from '../../../config/api.js';
import Dialog from '../../../shared/common/Dialog.jsx';
import '../../../styles/playerForms.css';

export default function EditPlayerForm({ isOpen, onClose, clubId, player, isAdmin = false, isOwner = false, onPlayerUpdated }) {
    const [form, setForm] = useState({});
    const [photoFile, setPhotoFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [accounts, setAccounts] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isOpen || !player) return;
        setForm({ name: player.name || '', bio: player.bio || '', dateOfBirth: player.date_of_birth?.slice(0, 10) || '',
            federationId: player.federation_id || '', nameLocked: Boolean(player.name_locked),
            chesscomUsername: player.chesscom_username || '', lichessUsername: player.lichess_username || '' });
        setAccounts({ chesscom: Boolean(player.chesscom_username), lichess: Boolean(player.lichess_username) });
        setPhotoFile(null);
        setError(null);
    }, [isOpen, player]);
    useEffect(() => {
        if (!photoFile) { setPreview(null); return; }
        const url = URL.createObjectURL(photoFile);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [photoFile]);

    if (!isOpen || !player) return null;
    const nameLocked = Boolean(player.name_locked) && !isOwner;
    const setField = field => event => setForm(current => ({ ...current, [field]: event.target.value }));
    const save = async event => {
        event.preventDefault();
        if (loading) return;
        setLoading(true);
        setError(null);
        try {
            const changes = { bio: form.bio.trim() || null, federationId: form.federationId.trim() || null,
                chesscomUsername: form.chesscomUsername.trim() || null, lichessUsername: form.lichessUsername.trim() || null,
                ...(!nameLocked ? { name: form.name.trim() } : {}),
                ...(isOwner ? { nameLocked: form.nameLocked } : {}),
                ...(isAdmin ? { dateOfBirth: form.dateOfBirth || null } : {}) };
            if (isAdmin) await playerApi.updatePlayer(clubId, player.id, changes);
            else await playerApi.updateOwnProfile(clubId, player.id, changes);
            if (photoFile) await playerApi.uploadPhoto(clubId, player.id, photoFile);
            await onPlayerUpdated?.();
            onClose();
        } catch (requestError) {
            setError(requestError.message || 'Could not save this profile.');
        } finally { setLoading(false); }
    };

    return <Dialog title="Player identity" onClose={onClose} busy={loading} className="player-identity-dialog">
        <form onSubmit={save}>
            <fieldset className="player-form-body" disabled={loading}>
                {error && <p className="error-box" role="alert">{error}</p>}
                <div className="identity-photo">
                    {preview || player.photo_url ? <img src={preview || resolveAssetUrl(player.photo_url)} alt={`${player.name} profile`} />
                        : <span className="identity-photo-placeholder" aria-hidden="true">{player.name?.slice(0, 1)}</span>}
                    <label className="identity-photo-edit">Change photo
                        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Player photo" onChange={event => {
                            const file = event.target.files?.[0];
                            if (file && (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
                                setError('Choose a JPEG, PNG, or WebP image under 5 MB.'); return;
                            }
                            setPhotoFile(file || null);
                        }} />
                    </label>
                </div>
                <label className="form-group">Official player name *
                    <input className="form-input" value={form.name ?? ''} onChange={setField('name')} required maxLength={100} disabled={nameLocked} />
                </label>
                {isOwner && <label className="identity-name-lock"><input type="checkbox" checked={form.nameLocked ?? false}
                    onChange={event => setForm(current => ({ ...current, nameLocked: event.target.checked }))} />Lock name to owner edits</label>}
                {nameLocked && <p className="form-helper">This name is locked by the club owner.</p>}
                <label className="form-group">FIDE / Federation ID
                    <input className="form-input" value={form.federationId ?? ''} onChange={setField('federationId')} maxLength={100} />
                </label>
                <label className="form-group">Bio
                    <textarea className="form-textarea" value={form.bio ?? ''} onChange={setField('bio')} maxLength={500} rows={4} />
                </label>
                {['chesscom', 'lichess'].map(platform => {
                    const label = platform === 'chesscom' ? 'Chess.com' : 'Lichess';
                    return accounts[platform] ? <label className="form-group" key={platform}>{label} username
                        <input className="form-input" value={form[`${platform}Username`] ?? ''} onChange={setField(`${platform}Username`)}
                            placeholder="Username" minLength={2} maxLength={40} pattern="[a-zA-Z0-9_-]+" />
                        <span className="form-helper">Links to your public profile. Clear to remove.</span>
                    </label> : <button className="identity-add-account" type="button" key={platform}
                        onClick={() => setAccounts(current => ({ ...current, [platform]: true }))}>+ Add {label} account</button>;
                })}
                {isAdmin && <details><summary>Additional identity details</summary>
                    <label className="form-group">Date of birth<input className="form-input" type="date" value={form.dateOfBirth ?? ''} onChange={setField('dateOfBirth')} /></label>
                </details>}
            </fieldset>
            <div className="modal-footer"><button className="btn-secondary" type="button" onClick={onClose} disabled={loading}>Cancel</button>
                <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save changes'}</button></div>
        </form>
    </Dialog>;
}
