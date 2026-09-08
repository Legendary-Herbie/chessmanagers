import React from 'react';

// Presentation only: scores and ordering come from the server standings.
export default function TournamentCrosstable({ participants, rounds, standings }) {
    const players = [...participants].sort((a, b) => {
        const rank = id => standings.find(row => row.playerId === id)?.rank ?? Infinity;
        return rank(a.id) - rank(b.id) || a.name.localeCompare(b.name);
    });
    const results = new Map();
    for (const round of rounds) {
        for (const pairing of round.pairings) {
            if (pairing.isBye) continue;
            for (const [id, opponent, color] of [
                [pairing.whitePlayerId, pairing.blackPlayerId, 'white'],
                [pairing.blackPlayerId, pairing.whitePlayerId, 'black'],
            ]) {
                const key = `${id}:${opponent}`;
                const cells = results.get(key) || [];
                const score = pairing.result === 'draw' ? '½'
                    : ['white', 'black'].includes(pairing.result) ? (pairing.result === color ? '1' : '0') : '?';
                cells.push({ id: pairing.id, score, description: `Round ${round.roundNumber}, ${color}: ${score === '?' ? 'awaiting result' : score}` });
                results.set(key, cells);
            }
        }
    }
    return <>
        <div className="tournament-table-wrap" tabIndex={0} role="region" aria-label="Tournament crosstable">
            <table className="tournament-table tournament-crosstable">
                <thead><tr><th scope="col">Player</th>{players.map((player, index) => <th scope="col" key={player.id} title={player.name}>{index + 1}</th>)}<th scope="col">Byes</th><th scope="col">Points</th></tr></thead>
                <tbody>{players.map((player, index) => <tr key={player.id}>
                    <th scope="row">{index + 1}. {player.name}</th>
                    {players.map(opponent => <td key={opponent.id} aria-label={`${player.name} against ${opponent.name}`}>
                        {player.id === opponent.id ? '—' : results.get(`${player.id}:${opponent.id}`)?.map(cell => <span className="cross-score" key={cell.id} title={cell.description} aria-label={cell.description}>{cell.score}</span>) || '·'}
                    </td>)}
                    <td>{player.byeCount ?? 0}</td><td><strong>{standings.find(row => row.playerId === player.id)?.matchPoints ?? '—'}</strong></td>
                </tr>)}</tbody>
            </table>
            {!players.length && <p>No participants yet.</p>}
        </div>
        <p className="muted">1 win · ½ draw · 0 loss · ? awaiting result · · not paired · — self. Byes are shown separately; points include the server’s bye awards. Score labels include round and colour.</p>
    </>;
}
