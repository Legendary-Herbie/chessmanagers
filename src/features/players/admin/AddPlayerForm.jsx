import React, { useState, useEffect } from 'react';
import { playerApi } from '../api/playerApi.js';

export default function AddPlayerForm({
    isOpen = false,
    isInline = false,
    onClose,
    clubId,
    ratingSettings = {},
    onPlayerAdded,
}) {
    const ratingDefaults = {
        blitz: ratingSettings.blitz?.initialRating ?? 1500,
        rapid: ratingSettings.rapid?.initialRating ?? 1500,
        classical: ratingSettings.classical?.initialRating ?? 1500,
    };
    const [tab, setTab] = useState('single'); // 'single' | 'bulk'
    const [name, setName] = useState('');
    const [startRatings, setStartRatings] = useState(() => ({
        blitz: String(ratingDefaults.blitz),
        rapid: String(ratingDefaults.rapid),
        classical: String(ratingDefaults.classical),
    }));
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

    useEffect(() => {
        setStartRatings({
            blitz: String(ratingDefaults.blitz),
            rapid: String(ratingDefaults.rapid),
            classical: String(ratingDefaults.classical),
        });
    }, [ratingDefaults.blitz, ratingDefaults.rapid, ratingDefaults.classical]);

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
            const parsedStartRatings = Object.fromEntries(
                Object.entries(startRatings)
                    .filter(([, value]) => value.trim())
                    .map(([category, value]) => [category, Number.parseInt(value, 10)])
                    .filter(([, value]) => Number.isInteger(value))
            );
            await playerApi.createPlayer(clubId, {
                name: name.trim(),
                ...(Object.keys(parsedStartRatings).length > 0 ? { startRatings: parsedStartRatings } : {}),
                bio: bio.trim() || undefined,
            });

            // Reset form
            setName('');
            setStartRatings({
                blitz: String(ratingDefaults.blitz),
                rapid: String(ratingDefaults.rapid),
                classical: String(ratingDefaults.classical),
            });
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

            const parts = line.split(',').map(part => part.trim());
            if (parts.length >= 4) {
                const categoryValues = {
                    blitz: Number.parseInt(parts[1], 10),
                    rapid: Number.parseInt(parts[2], 10),
                    classical: Number.parseInt(parts[3], 10),
                };
                const parsedStartRatings = Object.fromEntries(
                    Object.entries(categoryValues).filter(([, value]) => Number.isInteger(value))
                );
                parsed.push({
                    name: parts[0],
                    ...(Object.keys(parsedStartRatings).length > 0 ? { startRatings: parsedStartRatings } : {}),
                    ...(parts.length > 4
                        ? { bio: parts.slice(4).join(',').trim() || undefined }
                        : {}),
                });
            } else {
                const legacyRating = parts[1] ? Number.parseInt(parts[1], 10) : null;
                parsed.push({
                    name: parts[0],
                    ...(Number.isInteger(legacyRating) ? {
                        startRatings: {
                            blitz: legacyRating,
                            rapid: legacyRating,
                            classical: legacyRating,
                        },
                    } : {}),
                    ...(parts.length > 2 ? { bio: parts[2] || undefined } : {}),
                });
            }
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
                        <span className="form-label">Starting ratings</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '10px' }}>
                            {['blitz', 'rapid', 'classical'].map((category) => (
                                <label key={category} className="form-label" htmlFor={`player-${category}-rating`}>
                                    {category[0].toUpperCase() + category.slice(1)}
                                    <input
                                        id={`player-${category}-rating`}
                                        type="number"
                                        className="form-input"
                                        value={startRatings[category]}
                                        onChange={(e) => setStartRatings((current) => ({
                                            ...current,
                                            [category]: e.target.value,
                                        }))}
                                        placeholder={`Club default: ${ratingDefaults[category]}`}
                                        min={ratingSettings[category]?.ratingFloor ?? 100}
                                        max="4000"
                                    />
                                </label>
                            ))}
                        </div>
                        <span className="form-helper">Set each time-control rating independently. Clear a field to use the club default.</span>
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
                            placeholder={`Garry Kasparov\nBobby Fischer, 1600, 1700, 1800, Grandmaster\nHikaru Nakamura\nJudit Polgar, 1750`}
                            autoFocus
                        />
                        <span className="form-helper">Format: <code>Name, Blitz, Rapid, Classical, Bio</code>. The older <code>Name, Rating, Bio</code> format still applies one rating to all categories.</span>
                    </div>

                    {bulkPreview.length > 0 && (
                        <div className="form-group" style={{ backgroundColor: 'var(--bg-muted)', padding: '10px 12px', borderRadius: '8px' }}>
                            <span className="form-label">Parsed Preview ({bulkPreview.length} player{bulkPreview.length > 1 ? 's' : ''})</span>
                            <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text)' }}>
                                {bulkPreview.slice(0, 5).map((p, idx) => (
                                    <li key={idx}>
                                        <strong>{p.name}</strong> — B/R/C: {p.startRatings
                                            ? `${p.startRatings.blitz ?? 'default'} / ${p.startRatings.rapid ?? 'default'} / ${p.startRatings.classical ?? 'default'}`
                                            : 'club defaults'} {p.bio ? `(${p.bio})` : ''}
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
