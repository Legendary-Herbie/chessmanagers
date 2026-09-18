import React from 'react';
import { createPortal } from 'react-dom';

const scores = { white: '1–0', draw: '½–½', black: '0–1', bye: 'Bye' };

export default function PairingsPrintSheet({ tournament, participants, round, standings = [], mode = 'pairings' }) {
    if (mode === 'pairings' && !round) return null;
    const playerName = (name, id) => name || participants.find(player => player.id === id)?.name || '—';
    return createPortal(<div className="tournament-print-sheet" aria-hidden="true">
        <h1>{tournament.name}</h1>
        <h2>{mode === 'standings' ? 'Standings' : `Pairings · Round ${round.roundNumber}`}</h2>
        <p>{tournament.rating_category?.replace(/^./, letter => letter.toUpperCase())} · {tournament.is_rated ? 'Rated' : 'Unrated'}</p>
        {mode === 'standings' ? <table><thead><tr><th>Rank</th><th>Player</th><th>{tournament.type === 'knockout' ? 'Progress' : 'Points'}</th></tr></thead><tbody>{standings.map(row => <tr key={row.playerId}><td>{row.rank}</td><td>{row.playerName}</td><td>{tournament.type === 'knockout' ? row.knockoutStatus : row.matchPoints}</td></tr>)}</tbody></table> : <table>
            <thead><tr><th>Board</th><th>White</th><th>Result</th><th>Black</th></tr></thead>
            <tbody>{round.pairings.map(pairing => <tr key={pairing.id}>
                <td>{pairing.board}{pairing.isPlayoff ? ' (Tiebreak)' : ''}</td>
                <td>{playerName(pairing.whitePlayerName, pairing.whitePlayerId)}</td>
                <td>{(pairing.isBye ? 'Bye' : scores[pairing.result]) || <span className="print-result-boxes">□ 1–0<br />□ ½–½<br />□ 0–1</span>}</td>
                <td>{pairing.isBye ? 'Bye' : playerName(pairing.blackPlayerName, pairing.blackPlayerId)}</td>
            </tr>)}</tbody>
        </table>}
    </div>, document.body);
}
