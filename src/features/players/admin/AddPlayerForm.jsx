import React, { useState, useEffect } from 'react';
import { playerApi } from '../api/playerApi.js';

export default function AddPlayerForm({
    isOpen = false,
    isInline = false,
    onClose,
    clubId,
    onPlayerAdded,
}) {
    const [tab, setTab] = useState('single'); // 'single' | 'bulk'
    const [name, setName] = useState('');
    const [rating, setRating] = useState('');
    const [bio, setBio] = useState('');
    
    // Bulk state
    const [bulkText, setBulkText] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [bulkSuccessMsg, setBulkSuccessMsg] = useState(null);

    // Scroll Lock when modal is open
    useEffect(() => {
        if (!isInline && isOpen) {
            document.body.style.overflow = 'hidden';
            const handleEscape = (e) => {
                if (e.key === 'Escape' && onClose) onClose();
            };
            window.addEventListener('keydown', handleEscape);
            return () => {
                document.body.style.overflow = '';
                window.removeEventListener('keydown', handleEscape);
            };
        }
    }, [isInline, isOpen, onClose]);

    if (!isInline && !isOpen) return null;

    const handleSingleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Player name is required.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const parsedRating = rating.trim() ? Number.parseInt(rating, 10) : null;
            await playerApi.createPlayer(clubId, {
                name: name.trim(),
                ...(Number.isInteger(parsedRating) ? { rating: parsedRating } : {}),
                bio: bio.trim() || undefined,
            });

            // Reset form
            setName('');
            setRating('');
            setBio('');
            if (onPlayerAdded) onPlayerAdded();
            if (onClose) onClose();
        } catch (err) {
            setError(err.message || 'Failed to create player.');
        } finally {
            setLoading(false);
        }
    };

    const parseBulkPlayers = () => {
        if (!bulkText.trim()) return [];
        const lines = bulkText.split('\n');
        const parsed = [];

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;

            const parts = line.split(',');
            const parsedRating = parts[1]?.trim()
                ? Number.parseInt(parts[1].trim(), 10)
                : null;
            parsed.push({
                name: parts[0].trim(),
                ...(Number.isInteger(parsedRating) ? { rating: parsedRating } : {}),
                ...(parts.length > 2
                    ? { bio: parts.slice(2).join(',').trim() || undefined }
                    : {}),
            });
        }
        return parsed;
    };

    const handleBulkSubmit = async (e) => {
        e.preventDefault();
        const playersToCreate = parseBulkPlayers();
        if (playersToCreate.length === 0) {
            setError('Please enter at least one valid player name.');
            return;
        }

        setLoading(true);
        setError(null);
        setBulkSuccessMsg(null);

        try {
            const created = await playerApi.createPlayersBulk(clubId, playersToCreate);
            setBulkSuccessMsg(`Successfully imported ${created.length} player(s) atomically!`);
            setBulkText('');
            if (onPlayerAdded) onPlayerAdded();
            setTimeout(() => {
                setBulkSuccessMsg(null);
                if (onClose) onClose();
            }, 1200);
        } catch (err) {
            console.error('Failed to bulk add players:', err);
            setError(err.message || 'Failed to import players. Please check input format.');
        } finally {
            setLoading(false);
        }
    };

    const bulkPreview = parseBulkPlayers();

    const formContent = (
        <>
            <div className="modal-card__header">
                <h2 className="modal-card__title">Add New Player(s)</h2>
                {!isInline && onClose && (
                    <button type="button" className="modal-card__close" onClick={onClose} aria-label="Close modal">
                        ✕
                    </button>
                )}
            </div>

            <div className="form-tabs">
                <button
                    type="button"
                    className={`form-tab ${tab === 'single' ? 'form-tab--active' : ''}`}
                    onClick={() => { setTab('single'); setError(null); }}
                >
                    Single Player
                </button>
                <button
                    type="button"
                    className={`form-tab ${tab === 'bulk' ? 'form-tab--active' : ''}`}
                    onClick={() => { setTab('bulk'); setError(null); }}
                >
                    Bulk roster entry
                </button>
            </div>

            {error && <div className="error-box">{error}</div>}
            {bulkSuccessMsg && <div className="success-box">{bulkSuccessMsg}</div>}

            {tab === 'single' ? (
                <form onSubmit={handleSingleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="player-name">Player Full Name *</label>
                        <input
                            id="player-name"
                            type="text"
                            className="form-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Magnus Carlsen"
                            required
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="player-rating">Initial ELO Rating</label>
                        <input
                            id="player-rating"
                            type="number"
                            className="form-input"
                            value={rating}
                            onChange={(e) => setRating(e.target.value)}
                            placeholder="Use club default"
                            min="100"
                            max="3500"
                        />
                        <span className="form-helper">Leave blank to use this club's configured category ratings.</span>
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="player-bio">Biography / Notes (Optional)</label>
                        <textarea
                            id="player-bio"
                            className="form-textarea"
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Player background, title, or club notes..."
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                        {onClose && (
                            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
                                Cancel
                            </button>
                        )}
                        <button type="submit" className="btn-primary" disabled={loading}>
                            {loading ? 'Adding Player...' : 'Add Player'}
                        </button>
                    </div>
                </form>
            ) : (
                <form onSubmit={handleBulkSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="bulk-players">Paste Player Names (One per line)</label>
                        <textarea
                            id="bulk-players"
                            className="form-textarea"
                            style={{ minHeight: '140px', fontFamily: 'monospace' }}
                            value={bulkText}
                            onChange={(e) => setBulkText(e.target.value)}
                            placeholder={`Garry Kasparov\nBobby Fischer, 1400, Grandmaster\nHikaru Nakamura\nJudit Polgar`}
                            autoFocus
                        />
                        <span className="form-helper">Format per line: <code>Name</code> or <code>Name, Rating, Bio</code></span>
                    </div>

                    {bulkPreview.length > 0 && (
                        <div className="form-group" style={{ backgroundColor: 'var(--bg-muted)', padding: '10px 12px', borderRadius: '8px' }}>
                            <span className="form-label">Parsed Preview ({bulkPreview.length} player{bulkPreview.length > 1 ? 's' : ''})</span>
                            <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text)' }}>
                                {bulkPreview.slice(0, 5).map((p, idx) => (
                                    <li key={idx}>
                                        <strong>{p.name}</strong> — Rating: {p.rating ?? 'club defaults'} {p.bio ? `(${p.bio})` : ''}
                                    </li>
                                ))}
                                {bulkPreview.length > 5 && (
                                    <li style={{ color: 'var(--text-muted)' }}>...and {bulkPreview.length - 5} more</li>
                                )}
                            </ul>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                        {onClose && (
                            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
                                Cancel
                            </button>
                        )}
                        <button type="submit" className="btn-primary" disabled={loading || bulkPreview.length === 0}>
                            {loading ? `Creating ${bulkPreview.length} Players...` : `Add ${bulkPreview.length} Player(s)`}
                        </button>
                    </div>
                </form>
            )}
        </>
    );

    if (isInline) {
        return (
            <div
                className="add-player-panel"
                style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    marginBottom: '20px',
                }}
            >
                {formContent}
            </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                {formContent}
            </div>
        </div>
    );
}
