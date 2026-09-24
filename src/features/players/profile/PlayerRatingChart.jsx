import React, { useEffect, useId, useState } from 'react';
import RatingCategoryIcon from '../../../shared/common/RatingCategoryIcon.jsx';
import { playerApi } from '../api/playerApi.js';
import './playerRatingChart.css';
const colors = { blitz: '#c99720', rapid: '#36a77b', classical: '#6499cf' };
const outcomeColors = { win: '#22c55e', draw: '#f59e0b', loss: '#ef4444' };
const title = value => value[0].toUpperCase() + value.slice(1);
export default function PlayerRatingChart({ history = [], startRating = 1500, category = 'rapid', clubId, playerId }) {
    const gradientId = useId().replaceAll(':', '');
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
            ...series.map(row => ({ ...row, category:key, rating:row.ratingAfter, label:title(row.outcome || 'result') }))];
    });
    const width = 800, height = 300, padding = 48;
    const low = points.length ? Math.min(...points.map(item => item.rating)) : startRating;
    const high = points.length ? Math.max(...points.map(item => item.rating)) : startRating;
    const step = Math.max(10, Math.ceil((high - low + 40) / 4 / 10) * 10);
    const min = Math.floor((low - 10) / step) * step;
    const max = Math.ceil((high + 10) / step) * step;
    const dates = points.map(item => new Date(item.playedAt).getTime()); const first = Math.min(...dates), last = Math.max(...dates);
    const x = item => first === last ? width / 2 : padding + (new Date(item.playedAt).getTime() - first) / (last - first) * (width - 2 * padding);
    const y = rating => height - padding - (rating - min) / Math.max(max - min, 1) * (height - 2 * padding);
    const shown = rows.filter(row => (row.category || category) === category);
    const latest = shown.at(-1)?.ratingAfter;
    const change = latest === undefined ? 0 : latest - shown[0].ratingBefore;
    const activePoint = point && points.find(item => item.category === point.category && item.matchId === point.matchId);
    const selectNearestPoint = event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const px = (event.clientX - bounds.left) / bounds.width * width;
        const py = (event.clientY - bounds.top) / bounds.height * height;
        setPoint(points.reduce((nearest, item) => Math.hypot(x(item)-px, y(item.rating)-py) < Math.hypot(x(nearest)-px, y(nearest.rating)-py) ? item : nearest));
    };
    return <section className="chart-card rating-history-card"><div className="rating-chart-controls"><h3>{!combined && <RatingCategoryIcon category={category} />}{combined ? 'Category comparison' : title(category)} rating history</h3>
        <label>Timeframe<select className="input" value={windowSize} onChange={event => setWindowSize(event.target.value)}><option value="10">Last 10 games</option><option value="month">Last 30 days</option><option value="all">All-time</option></select></label>
        <label><input type="checkbox" checked={combined} onChange={event => setCombined(event.target.checked)} />Show all rating categories</label></div>
        {loading ? <p role="status">Loading rating history…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p> : points.length ? <>
        {!combined && <div className="rating-chart-summary"><div><span>Latest shown rating</span><strong>{latest}</strong><small>{change >= 0 ? '+' : ''}{change} in selected period</small></div><div><span>Highest shown</span><strong>{high}</strong></div><div><span>Rated games shown</span><strong>{shown.length}</strong></div></div>}
        <div className="rating-chart-legend">{categories.map(key => <span key={key} style={{ color:colors[key] }}>{title(key)}</span>)}<span>● Win · ● Draw · ● Loss (green / amber / red)</span></div>
        <div className="rating-chart-plot" onMouseLeave={() => setPoint(null)}>
        <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} aria-label="Rating history by played date"
            onPointerMove={selectNearestPoint} onPointerDown={selectNearestPoint} onKeyDown={event => { if (event.key === 'Escape') setPoint(null); }}>
            <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors[category]} stopOpacity=".3" /><stop offset="100%" stopColor={colors[category]} stopOpacity=".02" /></linearGradient></defs>
            {Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + index * step).map(rating => <g key={rating}><line x1={padding} x2={width - padding} y1={y(rating)} y2={y(rating)} stroke="var(--border)" strokeDasharray="4 4" /><text x={padding - 8} y={y(rating) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">{rating}</text></g>)}
            {!combined && <polygon points={`${x(points[0])},${height-padding} ${points.map(item => `${x(item)},${y(item.rating)}`).join(' ')} ${x(points.at(-1))},${height-padding}`} fill={`url(#${gradientId})`} />}
            {categories.map(key => <polyline key={key} points={points.filter(item => item.category === key).map(item => `${x(item)},${y(item.rating)}`).join(' ')} fill="none" stroke={colors[key]} strokeWidth="2" />)}
            {activePoint && <line x1={x(activePoint)} x2={x(activePoint)} y1={padding} y2={height-padding} stroke="var(--text-muted)" strokeDasharray="3 5" opacity=".5" />}
            {points.map((item, index) => <circle key={`${item.category}:${item.matchId || 'start'}`} cx={x(item)} cy={y(item.rating)} r={activePoint === item ? 7 : 4} fill={outcomeColors[item.outcome] || colors[item.category]} stroke="var(--bg-surface)" strokeWidth={activePoint === item ? 2 : 1} tabIndex={0} role="button" aria-label={`${title(item.category)}: ${item.label}, ${item.rating}, ${new Date(item.playedAt).toLocaleDateString()}`} onFocus={() => setPoint(item)} onBlur={() => setPoint(null)} onMouseEnter={() => setPoint(item)} onClick={() => setPoint(item)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPoint(points[index]); } }} />)}
            {(first === last ? [first] : [first, first + (last-first)/2, last]).map((date, index, ticks) => <text key={date} x={ticks.length === 1 ? width/2 : padding + index/(ticks.length-1)*(width-2*padding)} y={height-16} textAnchor={ticks.length === 1 ? 'middle' : index === 0 ? 'start' : index === ticks.length-1 ? 'end' : 'middle'} fontSize="12" fill="var(--text-muted)">{new Date(date).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })}</text>)}
        </svg>
        {activePoint && <div className={`rating-chart-tooltip${y(activePoint.rating) < 90 ? ' rating-chart-tooltip--below' : ''}`} role="tooltip"
            style={{ left: `${Math.max(24, Math.min(76, x(activePoint)/width*100))}%`, top: `${y(activePoint.rating)/height*100}%` }}>
            <span>{new Date(activePoint.playedAt).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })}</span>
            <strong><i style={{ background: colors[activePoint.category] }} />{title(activePoint.category)}: {activePoint.rating}</strong>
        </div>}
        </div>
        </> : <p>No rated games in this timeframe.</p>}
    </section>;
}
