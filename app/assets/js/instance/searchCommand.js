export function buildSearchCommand({ nodes, depth, movetime, externalEngine, specificMoves = '' }) {
    if(externalEngine && Number.isFinite(movetime) && movetime > 0)
        return { command: `go movetime ${Math.floor(movetime)}${specificMoves}`, goalDepth: null, goalNodes: null };

    if(nodes > 0)
        return { command: `go nodes ${nodes}${specificMoves}`, goalDepth: null, goalNodes: nodes };

    return { command: `go depth ${depth}${specificMoves}`, goalDepth: depth, goalNodes: null };
}
