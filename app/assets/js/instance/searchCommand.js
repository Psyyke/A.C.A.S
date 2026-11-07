export function searchCommand({ advanced, mode, movetime, depth, nodes, specificMoves = '' }) {
    const selectedMode = advanced ? (mode ?? 'standard') : 'standard';

    if(selectedMode === 'movetime') {
        if(!Number.isSafeInteger(movetime) || movetime < 1 || movetime > 100000) {
            throw new Error('Engine movetime must be an integer between 1 and 100000 ms');
        }
        return { command: `go movetime ${movetime}${specificMoves}`, goalDepth: null, goalNodes: null,
            engineMovetime: movetime, infinite: false };
    }
    if(selectedMode === 'infinite') {
        return { command: `go infinite${specificMoves}`, goalDepth: null, goalNodes: null,
            engineMovetime: null, infinite: true };
    }
    if(selectedMode !== 'standard') throw new Error(`Unknown search mode: ${selectedMode}`);

    if(nodes > 0) {
        return { command: `go nodes ${nodes}${specificMoves}`, goalDepth: null, goalNodes: nodes,
            engineMovetime: null, infinite: false };
    }
    const limit = depth || 100;
    return { command: `go depth ${limit}${specificMoves}`, goalDepth: limit, goalNodes: null,
        engineMovetime: null, infinite: false };
}
