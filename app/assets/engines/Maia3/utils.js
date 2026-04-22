export function parseGo(line) {
    const tokens = line.trim().split(/\s+/);

    const nodes = tokens.includes('nodes')
        ? parseInt(tokens[tokens.indexOf('nodes') + 1])
        : null;

    let history = tokens.includes('history')
        ? tokens[tokens.indexOf('history') + 1]
        : null;

    history = history === '-' || history === null
        ? null
        : history.replaceAll('#', ' ').split(',');

    let searchMoves = null;
    const smIdx = tokens.indexOf('searchmoves');

    if(smIdx !== -1) searchMoves = tokens.slice(smIdx + 1);

    return { nodes, history, searchMoves };
}