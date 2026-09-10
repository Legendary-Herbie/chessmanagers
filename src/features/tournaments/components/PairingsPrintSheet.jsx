import React from 'react';
import { createPortal } from 'react-dom';

const scores = { white: '1–0', draw: '½–½', black: '0–1', bye: 'Bye' };

export default function PairingsPrintSheet({ tournament, participants, round }) {
    if (!round) return null;
    const playerName = (name, id) => name || participants.find(player => player.id === id)?.name || '—';
    return createPortal(<div className="tournament-print-sheet" aria-hidden="true">
        <h1>{tournament.name}</h1>
        <h2>Pairings · Round {round.roundNumber}</h2>
        <p>{tournament.rating_category?.replace(/^./, letter => letter.toUpperCase())} · {tournament.is_rated ? 'Rated' : 'Unrated'}</p>
        <table>
            <thead><tr><th>Board</th><th>White</th><th>Result</th><th>Black</th></tr></thead>
            <tbody>{round.pairings.map(pairing => <tr key={pairing.id}>
                <td>{pairing.board}</td>
                <td>{playerName(pairing.whitePlayerName, pairing.whitePlayerId)}</td>
                <td>{scores[pairing.result] || ''}</td>
                <td>{pairing.isBye ? 'Bye' : playerName(pairing.blackPlayerName, pairing.blackPlayerId)}</td>
            </tr>)}</tbody>
        </table>
    </div>, document.body);
}
