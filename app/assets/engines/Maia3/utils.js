import { Chess } from '../libraries/chessjs/chess.js';

export function parsePosition(line) {
    const tokens = line.trim().split(/\s+/), board = new Chess();
    if(tokens[0] !== 'position' || !['startpos', 'fen'].includes(tokens[1]))
        throw new Error('Invalid Maia 3 position command.');
    let index = 2;
    if(tokens[1] === 'fen') {
        index = tokens.indexOf('moves', 2);
        if(index < 0) index = tokens.length;
        if(!board.load(tokens.slice(2, index).join(' '))) throw new Error('Invalid Maia 3 position FEN.');
    }
    if(index < tokens.length && tokens[index] !== 'moves') throw new Error('Invalid Maia 3 move continuation.');
    const history = [board.fen()];
    for(const move of tokens.slice(index + 1)) {
        if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)
            || !board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }))
            throw new Error(`Illegal Maia 3 history move ${move}.`);
        history.unshift(board.fen());
        history.length = Math.min(history.length, 8);
    }
    return { fen: board.fen(), history };
}

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