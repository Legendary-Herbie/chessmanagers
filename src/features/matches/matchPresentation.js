export function matchResultLabel(result) {
    if (result === 'white') return 'White wins';
    if (result === 'black') return 'Black wins';
    if (result === 'draw') return 'Draw';
    return 'Unknown result';
}
