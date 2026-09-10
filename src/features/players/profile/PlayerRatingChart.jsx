import React, { useState } from 'react';

export default function PlayerRatingChart({ history = [], startRating = 1500, category = 'rapid' }) {
    const [hoverPoint, setHoverPoint] = useState(null);
    const categoryLabel = category[0].toUpperCase() + category.slice(1);

    // Build timeline data
    let points = [];
    if (!history || history.length === 0) {
        points = [
            { label: 'Start', rating: startRating, date: 'Initial' }
        ];
    } else {
        // The rating-history endpoint uses one canonical camelCase DTO.
        const first = history[0];
        points.push({
            label: 'Start',
            rating: first.ratingBefore,
            date: new Date(first.playedAt).toLocaleDateString(),
        });

        history.forEach((h, idx) => {
            const rating = h.ratingAfter;
            points.push({
                label: `Match #${idx + 1}`,
                rating,
                delta: rating - h.ratingBefore,
                date: new Date(h.playedAt).toLocaleDateString(),
            });
        });
    }

    if (points.length === 1) {
        return (
            <div className="chart-card">
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-strong)' }}>
                    {categoryLabel} Rating History Trajectory
                </h3>
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    Starting Rating: <strong>{startRating}</strong>. No matches played yet.
                </div>
            </div>
        );
    }

    // Chart dimensions
    const width = 600;
    const height = 220;
    const padding = 40;

    const ratings = points.map(p => p.rating);
    const minRating = Math.min(...ratings) - 20;
    const maxRating = Math.max(...ratings) + 20;
    const ratingRange = Math.max(maxRating - minRating, 40);

    const getX = (index) => padding + (index * (width - 2 * padding)) / (points.length - 1);
    const getY = (rating) => height - padding - ((rating - minRating) * (height - 2 * padding)) / ratingRange;

    const svgPoints = points.map((p, idx) => `${getX(idx)},${getY(p.rating)}`).join(' ');

    return (
        <div className="chart-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-strong)' }}>
                    {categoryLabel} Rating History Trajectory
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {points.length - 1} match{points.length - 1 === 1 ? '' : 'es'} recorded
                </span>
            </div>

            <div style={{ position: 'relative', width: '100%' }}>
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    className="chart-svg"
                    style={{ overflow: 'visible' }}
                >
                    {/* Horizontal grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                        const rValue = Math.round(minRating + ratio * ratingRange);
                        const yPos = getY(rValue);
                        return (
                            <g key={i}>
                                <line
                                    x1={padding}
                                    y1={yPos}
                                    x2={width - padding}
                                    y2={yPos}
                                    stroke="var(--border)"
                                    strokeDasharray="4 4"
                                    opacity="0.5"
                                />
                                <text
                                    x={padding - 8}
                                    y={yPos + 4}
                                    fill="var(--text-muted)"
                                    fontSize="10"
                                    textAnchor="end"
                                >
                                    {rValue}
                                </text>
                            </g>
                        );
                    })}

                    {/* Gradient Fill under line */}
                    <defs>
                        <linearGradient id="ratingGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                        </linearGradient>
                    </defs>
                    <polygon
                        points={`${padding},${height - padding} ${svgPoints} ${width - padding},${height - padding}`}
                        fill="url(#ratingGrad)"
                    />

                    {/* Main Polyline */}
                    <polyline
                        fill="none"
                        stroke="var(--primary)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={svgPoints}
                    />

                    {/* Point circles */}
                    {points.map((p, idx) => {
                        const cx = getX(idx);
                        const cy = getY(p.rating);
                        const isHovered = hoverPoint && hoverPoint.idx === idx;

                        return (
                            <g key={idx} onMouseEnter={() => setHoverPoint({ ...p, cx, cy, idx })} onMouseLeave={() => setHoverPoint(null)}>
                                <circle
                                    cx={cx}
                                    cy={cy}
                                    r={isHovered ? "6" : "4"}
                                    fill={isHovered ? "var(--accent)" : "var(--primary)"}
                                    stroke="var(--bg-surface)"
                                    strokeWidth="2"
                                    style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                                />
                            </g>
                        );
                    })}
                </svg>

                {/* Tooltip Overlay */}
                {hoverPoint && (
                    <div
                        style={{
                            position: 'absolute',
                            left: `${(hoverPoint.cx / width) * 100}%`,
                            top: `${(hoverPoint.cy / height) * 100 - 15}%`,
                            transform: 'translate(-50%, -100%)',
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-emphasis)',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            boxShadow: 'var(--shadow-md)',
                            pointerEvents: 'none',
                            zIndex: 10,
                            whiteSpace: 'nowrap',
                            fontSize: '0.75rem',
                        }}
                    >
                        <strong style={{ color: 'var(--text-strong)', display: 'block' }}>{hoverPoint.label}</strong>
                        <div>Rating: <strong>{hoverPoint.rating}</strong></div>
                        {hoverPoint.delta !== undefined && (
                            <div style={{ color: hoverPoint.delta >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                                {hoverPoint.delta >= 0 ? `+${hoverPoint.delta}` : hoverPoint.delta} Elo
                            </div>
                        )}
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{hoverPoint.date}</div>
                    </div>
                )}
            </div>
        </div>
    );
}
