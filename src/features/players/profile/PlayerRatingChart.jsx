import React, { useEffect, useState } from 'react';
import { playerApi } from '../api/playerApi.js';
import './playerRatingChart.css';
const colors = { blitz: '#a78bfa', rapid: '#38bdf8', classical: '#f472b6' };
const outcomeColors = { win: '#22c55e', draw: '#f59e0b', loss: '#ef4444' };
const title = value => value[0].toUpperCase() + value.slice(1);
export default function PlayerRatingChart({ history = [], startRating = 1500, category = 'rapid', clubId, playerId }) {
    const [windowSize, setWindowSize] = useState('10'); const [combined, setCombined] = useState(false);
    const [loaded, setLoaded] = useState(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
    const [point, setPoint] = useState(null); const [retry, setRetry] = useState(0);
    useEffect(() => {
        setPoint(null); setLoaded(null); setError('');
        if (!clubId || !playerId || (!combined && windowSize === '10')) { setLoading(false); return; }
        const controller = new AbortController(); setLoading(true);
        playerApi.fetchRatingTimeline(clubId, playerId, { category: combined ? 'all' : category, limit: windowSize === '10' ? 10 : undefined,
            since: windowSize === 'month' ? new Date(Date.now() - 30 * 86400000).toISOString() : undefined, signal: controller.signal })
            .then(rows => { if (!controller.signal.aborted) setLoaded(rows); })
            .catch(err => { if (!controller.signal.aborted) setError(err.message || 'Could not load history.'); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [clubId, playerId, category, windowSize, combined, retry]);
    let rows = loaded || ((!combined && windowSize === '10') ? history : []);
    if (windowSize === '10') rows = rows.slice(-10);
    const categories = combined ? Object.keys(colors) : [category];
    const points = categories.flatMap(key => {
        const series = rows.filter(row => (row.category || category) === key);
        if (!series.length) return [];
        return [{ category:key, rating:series[0].ratingBefore, playedAt:series[0].playedAt, label:'Before first shown game' },
            ...series.map(row => ({ ...row, category:key, rating:row.ratingAfter, label:`${title(row.outcome || 'result')} vs. ${row.opponentName || 'Opponent'}` }))];
    });
    const width = 640, height = 250, padding = 45;
    const min = Math.floor((Math.min(...points.map(item => item.rating), startRating) - 20) / 200) * 200;
    const max = Math.ceil((Math.max(...points.map(item => item.rating), startRating) + 20) / 200) * 200;
    const dates = points.map(item => new Date(item.playedAt).getTime()); const first = Math.min(...dates), last = Math.max(...dates);
    const x = item => padding + (new Date(item.playedAt).getTime() - first) / Math.max(last - first, 1) * (width - 2 * padding);
    const y = rating => height - padding - (rating - min) / Math.max(max - min, 200) * (height - 2 * padding);
    return <section className="chart-card"><div className="rating-chart-controls"><h3>{combined ? 'Combined' : title(category)} rating history</h3>
        <label>Timeframe<select className="input" value={windowSize} onChange={event => setWindowSize(event.target.value)}><option value="10">Last 10 games</option><option value="month">Last 30 days</option><option value="all">All-time</option></select></label>
        <label><input type="checkbox" checked={combined} onChange={event => setCombined(event.target.checked)} />Show all rating categories</label></div>
        {loading ? <p role="status">Loading rating history…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p> : points.length ? <>
        <div className="rating-chart-legend">{categories.map(key => <span key={key} style={{ color:colors[key] }}>{title(key)}</span>)}<span>● Win · ● Draw · ● Loss (green / amber / red)</span></div>
        <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} aria-label="Rating history by played date">
            {Array.from({ length: Math.round((max - min) / 200) + 1 }, (_, index) => min + index * 200).map(rating => <g key={rating}><line x1={padding} x2={width - padding} y1={y(rating)} y2={y(rating)} stroke="var(--border)" strokeDasharray="4 4" /><text x={padding - 8} y={y(rating) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">{rating}</text></g>)}
            {categories.map(key => <polyline key={key} points={points.filter(item => item.category === key).map(item => `${x(item)},${y(item.rating)}`).join(' ')} fill="none" stroke={colors[key]} strokeWidth="2" />)}
            {points.map((item, index) => <circle key={`${item.category}:${item.matchId || 'start'}`} cx={x(item)} cy={y(item.rating)} r={point === item ? 6 : 4} fill={outcomeColors[item.outcome] || colors[item.category]} stroke="var(--bg-surface)" tabIndex={0} role="button" aria-label={`${title(item.category)}: ${item.label}, ${item.rating}, ${new Date(item.playedAt).toLocaleDateString()}`} onFocus={() => setPoint(item)} onMouseEnter={() => setPoint(item)} onClick={() => setPoint(item)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPoint(points[index]); } }}><title>{item.label}: {item.rating}</title></circle>)}
            <text x={padding} y={height - 10} fontSize="11" fill="var(--text-muted)">{new Date(first).toLocaleDateString()}</text><text x={width - padding} y={height - 10} textAnchor="end" fontSize="11" fill="var(--text-muted)">{new Date(last).toLocaleDateString()}</text>
        </svg><div className="rating-chart-detail" role="status">{point ? `${title(point.category)} · ${point.label} · Elo ${point.rating} · ${new Date(point.playedAt).toLocaleString()}` : 'Hover, tap, or focus a point to see the opponent and result.'}</div>
        </> : <p>No rated games in this timeframe.</p>}
    </section>;
}
