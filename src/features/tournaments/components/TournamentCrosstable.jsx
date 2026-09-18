import React, { memo, useMemo } from 'react';

// Presentation only: scores and ordering come from the server standings.
function TournamentCrosstable({ participants, rounds, standings }) {
    const { players, results, ranks } = useMemo(() => {
    const ranks = new Map(standings.map(row => [row.playerId, row]));
    const players = [...participants].sort((a, b) => {
        const rank = id => ranks.get(id)?.rank ?? Infinity;
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
    return { players, results, ranks };
    }, [participants, rounds, standings]);
    return <>
        <div className="tournament-table-wrap table-scroll" tabIndex={0} role="region" aria-label="Tournament crosstable">
            <table className="tournament-table tournament-crosstable">
                <thead><tr><th scope="col">Player</th>{players.map((player, index) => <th scope="col" key={player.id} title={player.name}>{index + 1}</th>)}<th scope="col">Byes</th><th scope="col">Points</th></tr></thead>
                <tbody>{players.map((player, index) => <tr key={player.id}>
                    <th scope="row">{index + 1}. {player.name}</th>
                    {players.map(opponent => <td className={player.id === opponent.id ? 'cross-self' : undefined} key={opponent.id} aria-label={`${player.name} against ${opponent.name}`}>
                        {player.id === opponent.id ? '—' : results.get(`${player.id}:${opponent.id}`)?.map(cell => <span className={`cross-score cross-score--${cell.score === '1' ? 'win' : cell.score === '½' ? 'draw' : cell.score === '0' ? 'loss' : 'empty'}`} key={cell.id} title={cell.description} aria-label={cell.description}>{cell.score}</span>) || '·'}
                    </td>)}
                    <td>{player.byeCount ?? 0}</td><td><strong>{ranks.get(player.id)?.matchPoints ?? '—'}</strong></td>
                </tr>)}</tbody>
            </table>
            {!players.length && <p>No participants yet.</p>}
        </div>
        <p className="muted">1 win · ½ draw · 0 loss · ? awaiting result · · not paired · — self. Byes are shown separately; points include the server’s bye awards. Score labels include round and colour.</p>
    </>;
}

export default memo(TournamentCrosstable);
