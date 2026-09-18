import React, { useEffect, useRef, useState } from 'react';
import { matchApi } from '../api/matchApi.js';
import { matchResultLabel } from '../matchPresentation.js';

export default function NotificationMatchPreview({ clubId, matchId }) {
    const [match, setMatch] = useState(null);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const region = useRef(null);
    useEffect(() => {
        const controller = new AbortController();
        setMatch(null); setError('');
        matchApi.get(clubId, matchId, { signal: controller.signal }).then(data => {
            if (!controller.signal.aborted) setMatch(data.match);
        }).catch(error => { if (!controller.signal.aborted) setError(error.message || 'Could not load this match.'); });
        return () => controller.abort();
    }, [clubId, matchId, retry]);
    useEffect(() => {
        if (match) { region.current?.focus(); region.current?.scrollIntoView?.({ block: 'center' }); }
    }, [match]);
    return <section ref={region} tabIndex={-1} className="notification-target" aria-label="Match from notification">
        <h2>Match from notification</h2>
        {error ? <p role="alert">{error} <button className="btn btn-secondary" type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p>
            : !match ? <p role="status">Loading match…</p> : <>
                <p><strong>{match.whitePlayerName} · {matchResultLabel(match.result)} · {match.blackPlayerName}</strong></p>
                <p>{new Date(match.playedAt).toLocaleString()} · {match.ratingCategory?.replace(/^./, letter => letter.toUpperCase())} · {match.isRated ? 'Rated' : 'Unrated'}</p>
                {match.notes && <p>{match.notes}</p>}
                {match.status !== 'active' && <p>{match.status}</p>}
            </>}
    </section>;
}
