import React, { useState } from 'react';
import Button from '../../../shared/common/Button.jsx';
import { exportApi } from '../api/exportApi.js';

const categories = [
    { value: '', label: 'All categories' },
    { value: 'blitz', label: 'Blitz' },
    { value: 'rapid', label: 'Rapid' },
    { value: 'classical', label: 'Classical' },
];

export default function DataExportPanel({ clubId }) {
    const [includeInactive, setIncludeInactive] = useState(false);
    const [matchCategory, setMatchCategory] = useState('');
    const [ratingCategory, setRatingCategory] = useState('');
    const [downloading, setDownloading] = useState(null);
    const [message, setMessage] = useState(null);

    async function run(type, action) {
        setDownloading(type);
        setMessage(null);
        try {
            await action();
            setMessage({ type: 'success', text: 'Your download has started.' });
        } catch (error) {
            setMessage({ type: 'error', text: error.message || 'The export could not be downloaded.' });
        } finally {
            setDownloading(null);
        }
    }

    return (
        <section className="data-export-panel" aria-labelledby="data-export-heading">
            <div>
                <h2 id="data-export-heading">Data exports</h2>
                <p className="muted">Download club data as spreadsheet-safe CSV files. Exports are recorded in the club audit history.</p>
            </div>

            {message && (
                <div className={message.type === 'error' ? 'error' : 'success'} role={message.type === 'error' ? 'alert' : 'status'}>
                    {message.text}
                </div>
            )}

            <div className="dashboard-settings-card">
                <h3>Full club records package</h3>
                <p className="muted">One ZIP with the roster, match history, and current ratings in all categories, including inactive and deleted records. Uploaded files and account data are excluded.</p>
                <Button disabled={Boolean(downloading)} onClick={() => run('package', () => exportApi.downloadPackage(clubId))}>{downloading === 'package' ? 'Preparing…' : 'Export full club package'}</Button>
            </div>
            <label className="form-row">
                <span className="label">Lifecycle records</span>
                <span>
                    <input
                        type="checkbox"
                        checked={includeInactive}
                        onChange={event => setIncludeInactive(event.target.checked)}
                    />{' '}
                    Include inactive and deleted players in roster and rating exports
                </span>
            </label>

            <div className="dashboard-settings-card">
                <h3>Player roster</h3>
                <p className="muted">Player identity and lifecycle fields. Account details and uploaded media are excluded.</p>
                <Button
                    disabled={Boolean(downloading)}
                    onClick={() => run('players', () => exportApi.downloadPlayers(clubId, { includeInactive }))}
                >
                    {downloading === 'players' ? 'Preparing…' : 'Download player roster'}
                </Button>
            </div>

            <div className="dashboard-settings-card">
                <h3>Match history</h3>
                <label className="form-row">
                    <span className="label">Category</span>
                    <select className="input" value={matchCategory} onChange={event => setMatchCategory(event.target.value)}>
                        {categories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
                    </select>
                </label>
                <p className="muted">Includes active, voided, and deleted matches with chronology, rated state, and lifecycle reasons.</p>
                <Button
                    disabled={Boolean(downloading)}
                    onClick={() => run('matches', () => exportApi.downloadMatches(clubId, { category: matchCategory }))}
                >
                    {downloading === 'matches' ? 'Preparing…' : 'Download match history'}
                </Button>
            </div>

            <div className="dashboard-settings-card">
                <h3>Current ratings</h3>
                <label className="form-row">
                    <span className="label">Category</span>
                    <select className="input" value={ratingCategory} onChange={event => setRatingCategory(event.target.value)}>
                        {categories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
                    </select>
                </label>
                <Button
                    disabled={Boolean(downloading)}
                    onClick={() => run('ratings', () => exportApi.downloadRatings(
                        clubId,
                        { category: ratingCategory, includeInactive }
                    ))}
                >
                    {downloading === 'ratings' ? 'Preparing…' : 'Download current ratings'}
                </Button>
            </div>

            <p className="muted">CSV import is not available.</p>
        </section>
    );
}
