import React from 'react';
import '../../styles/club-dashboard.css';

const CATEGORIES = ['blitz', 'rapid', 'classical'];

const RESULT_LABELS = {
    white: '1–0',
    black: '0–1',
    draw:  '½–½',
};

function StatCard({ label, value, sub }) {
    return (
        <div className="dash-stat-card">
            <span className="dash-stat-card__label">{label}</span>
            <span className="dash-stat-card__value">{value}</span>
            {sub && <span className="dash-stat-card__sub">{sub}</span>}
        </div>
    );
}

/**
 * Club dashboard tab. Expects the payload shape returned by
 * GET /clubs/:clubId/leaderboard/dashboard (see LeaderboardModel.getDashboardStats):
 *
 *   { total_members, total_players, active_players, total_matches,
 *     total_tournaments, average_rating, highest_rating, lowest_rating,
 *     pending_join_requests, pending_player_links,
 *     games_by_category: { blitz, rapid, classical },
 *     top_players: [{ id, name, rating, games, wins, draws, losses }],
 *     recent_matches: [{ id, result, type, time_control, played_at, white_name, black_name }] }
 *
 * Falls back gracefully to the older, smaller { stats } shape
 * (total_players/total_matches/total_tournaments/average_rating) if that's
 * all the caller has, so this stays compatible during rollout.
 */
export default function ClubDashboard({ data }) {
    if (!data) {
        return (
            <div className="dash-empty">
                <p className="muted">No stats available yet.</p>
            </div>
        );
    }

    const {
        total_members,
        total_players = 0,
        active_players,
        total_matches = 0,
        total_tournaments = 0,
        average_rating,
        highest_rating,
        lowest_rating,
        pending_join_requests = 0,
        pending_player_links = 0,
        games_by_category,
        top_players = [],
        recent_matches = [],
    } = data;

    const pendingTotal = (pending_join_requests || 0) + (pending_player_links || 0);
    const hasRatingRange = highest_rating != null && lowest_rating != null;
    const categoryCounts = games_by_category || {};
    const maxCategoryCount = Math.max(1, ...CATEGORIES.map(c => categoryCounts[c] || 0));

    return (
        <div className="club-dashboard">
            {pendingTotal > 0 && (
                <div className="dash-pending-banner">
                    <strong>
                        {pendingTotal} item{pendingTotal === 1 ? '' : 's'} need attention
                    </strong>
                    <span>
                        {pending_join_requests > 0 &&
                            `${pending_join_requests} join request${pending_join_requests === 1 ? '' : 's'}`}
                        {pending_join_requests > 0 && pending_player_links > 0 && ' · '}
                        {pending_player_links > 0 &&
                            `${pending_player_links} player claim${pending_player_links === 1 ? '' : 's'}`}
                        {' '}— see the Profile tab to review.
                    </span>
                </div>
            )}

            <div className="dash-stats-grid">
                {total_members !== undefined && (
                    <StatCard label="Members" value={total_members} />
                )}
                <StatCard
                    label="Players"
                    value={total_players}
                    sub={active_players !== undefined ? `${active_players} active` : undefined}
                />
                <StatCard label="Matches played" value={total_matches} />
                <StatCard label="Tournaments" value={total_tournaments} />
                <StatCard label="Average rating" value={average_rating ?? '—'} />
                <StatCard
                    label="Rating range"
                    value={hasRatingRange ? `${lowest_rating}–${highest_rating}` : '—'}
                />
            </div>

            <div className="dash-columns">
                {games_by_category && (
                    <div className="dash-panel">
                        <h3 className="dash-panel__title">Games by time control</h3>
                        <div className="dash-category-bars">
                            {CATEGORIES.map((cat) => {
                                const count = categoryCounts[cat] || 0;
                                const pct = Math.round((count / maxCategoryCount) * 100);
                                return (
                                    <div key={cat} className="dash-category-row">
                                        <span className="dash-category-label">{cat}</span>
                                        <div className="dash-category-track">
                                            <div className="dash-category-fill" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="dash-category-count">{count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="dash-panel">
                    <h3 className="dash-panel__title">Top players</h3>
                    {top_players.length === 0 ? (
                        <p className="muted">No players yet.</p>
                    ) : (
                        <ol className="dash-top-players">
                            {top_players.map((p, i) => (
                                <li key={p.id}>
                                    <span className="dash-top-players__rank">{i + 1}</span>
                                    <span className="dash-top-players__name" title={p.name}>{p.name}</span>
                                    <span className="dash-top-players__rating">{p.rating}</span>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </div>

            <div className="dash-panel">
                <h3 className="dash-panel__title">Recent matches</h3>
                {recent_matches.length === 0 ? (
                    <p className="muted">No matches recorded yet.</p>
                ) : (
                    <table className="dash-matches-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>White</th>
                                <th>Black</th>
                                <th>Result</th>
                                <th>Time control</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recent_matches.map((m) => (
                                <tr key={m.id}>
                                    <td>{new Date(m.played_at).toLocaleDateString()}</td>
                                    <td>{m.white_name}</td>
                                    <td>{m.black_name}</td>
                                    <td>{RESULT_LABELS[m.result] ?? m.result}</td>
                                    <td className="dash-matches-table__tc">{m.time_control}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}