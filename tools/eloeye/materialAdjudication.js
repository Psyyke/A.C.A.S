// A deliberately narrow material shortcut, not a tablebase or a promise of conversion.
export function materialWinner(chess) {
    if(chess.game_over()) return null;
    const pieces = chess.board().flat().filter(Boolean);
    if(pieces.length !== 3) return null;
    const queen = pieces.find(piece => piece.type === 'q');
    if(!queen || pieces.filter(piece => piece.type === 'k' && piece.color === 'w').length !== 1
        || pieces.filter(piece => piece.type === 'k' && piece.color === 'b').length !== 1) return null;
    const fen = chess.fen();
    const halfmoves = Number(fen.split(' ')[4]);
    if(!Number.isInteger(halfmoves) || halfmoves > 60) return null;
    const defender = pieces.find(piece => piece.type === 'k' && piece.color !== queen.color);
    const distance = Math.max(
        Math.abs(queen.square.charCodeAt(0) - defender.square.charCodeAt(0)),
        Math.abs(Number(queen.square[1]) - Number(defender.square[1])));
    if(distance <= 1) return null;

    if(chess.turn() !== queen.color) {
        for(const move of chess.moves({ verbose: true })) {
            chess.move(move);
            try {
                if(move.captured === 'q' || chess.in_draw()) return null;
            } finally {
                chess.undo();
            }
        }
    }
    return queen.color;
}

export const materialStabilityPlies = 8;
