import { Chess } from '../../app/assets/engines/libraries/chessjs/chess.js';

export function openingSamples(line) {
    if(typeof line !== 'string' || line.length > 2000) throw new Error('Enter a short SAN opening line.');
    const board = new Chess(), result = [], history = [];
    for(const san of line.replace(/\d+\.(?:\.\.)?/g, ' ').trim().split(/\s+/).filter(Boolean)) {
        if(result.length >= 40) throw new Error('Use an opening line of at most 40 plies.');
        const fen = board.fen(), legalMoves = board.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || ''));
        history.unshift(fen);
        history.length = Math.min(history.length, 8);
        let move;
        try { move = board.move(san); }
        catch { throw new Error(`Invalid opening move "${san}" after ${result.length} plies.`); }
        if(!move) throw new Error(`Invalid opening move "${san}".`);
        result.push({ fen, history: [...history], legalMoves, move: move.from + move.to + (move.promotion || '') });
    }
    if(result.length < 2) throw new Error('Enter at least two legal opening plies, such as 1. e4 e5.');
    return result;
}

export function shapeSquares(text) {
    const squares = String(text).toLowerCase().trim().split(/[\s,]+/).filter(Boolean);
    if(!squares.length || squares.length > 8 || squares.some(square => !/^[a-h][2-7]$/.test(square))
        || new Set(squares).size !== squares.length)
        throw new Error('Choose one to eight distinct pawn squares, such as d4 e4. Squares are from the moving side.');
    return squares;
}

export function shapeRewards(sample, squares) {
    const fen = sample.fen || sample.history[0], board = new Chess(fen), color = board.turn();
    const desired = squares.map(square => color === 'b' ? square[0] + (9 - Number(square[1])) : square);
    return sample.legalMoves.map(uci => {
        board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        const count = desired.filter(square => board.get(square)?.type === 'p' && board.get(square)?.color === color).length;
        board.undo();
        return count / squares.length;
    });
}

export function objectiveTargets(base, target, rewards, baseAnchor = 0) {
    if(!Number.isFinite(baseAnchor) || baseAnchor < 0 || baseAnchor > 1)
        throw new Error('Choose a base preference balance between zero and one.');
    if(!rewards) {
        if(!baseAnchor) return base.map((_, i) => Number(i === target));
        const max = Math.max(...base), exp = base.map(value => Math.exp(value - max));
        const total = exp.reduce((a, b) => a + b, 0);
        return exp.map((value, i) => baseAnchor * value / total + (1 - baseAnchor) * Number(i === target));
    }
    const teacher = base.map((value, i) => value + 8 * rewards[i]);
    const max = Math.max(...teacher), exp = teacher.map(value => Math.exp(value - max));
    const total = exp.reduce((a, b) => a + b, 0);
    return exp.map((value, i) => 0.75 * value / total + 0.25 * Number(i === target));
}
