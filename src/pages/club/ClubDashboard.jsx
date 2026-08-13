import React from 'react';

export default function ClubDashboard({ stats }) {
    return (
        <div>
            <h2>Dashboard</h2>
            {stats ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                        <div className="muted">Players</div>
                        <div style={{ fontSize: 20 }}>{stats.total_players}</div>
                    </div>
                    <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                        <div className="muted">Matches</div>
                        <div style={{ fontSize: 20 }}>{stats.total_matches}</div>
                    </div>
                    <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                        <div className="muted">Tournaments</div>
                        <div style={{ fontSize: 20 }}>{stats.total_tournaments}</div>
                    </div>
                    <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                        <div className="muted">Avg rating</div>
                        <div style={{ fontSize: 20 }}>{stats.average_rating ?? '—'}</div>
                    </div>
                </div>
            ) : (
                <div className="muted">No stats available.</div>
            )}
        </div>
    );
}
