import { Chess } from '../libraries/chessjs/chess.js';
import CaptureExchange from '../../js/misc/captureExchange.js';

// A guard for Pena's own pick. A shallow material count could not tell blunders from gambits
// against Stockfish, but a move that allows mate in one is always wrong, so only that is caught.
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const uciOf = move => move.from + move.to + (move.promotion || '');

function matingReply(chess, move) {
    chess.move(move);
    try {
        if(chess.game_over()) return null;
        for(const reply of chess.moves({ verbose: true })) {
            chess.move(reply);
            const mate = chess.in_checkmate();
            chess.undo();
            if(mate) return reply;
        }
        return null;
    } finally { chess.undo(); }
}

// Material won by a move minus the worst exchange the opponent can then start against the mover.
function materialAfter(chess, move) {
    chess.move(move);
    try {
        const exchange = new CaptureExchange(chess.fen());
        const own = chess.board().flat().filter(piece => piece?.color === move.color && piece.type !== 'k');
        return (VALUES[move.captured] || 0) - Math.max(0, ...own.map(piece => exchange.captureLoss(piece.square) || 0));
    } finally { chess.undo(); }
}

// Returns null when the pick does not allow mate in one, or when every move does.
export function pickProblem(fen, uci, { mentioned = [] } = {}) {
    const chess = new Chess();
    if(!chess.load(fen)) return null;
    const moves = chess.moves({ verbose: true });
    const chosen = moves.find(move => uciOf(move) === uci);
    if(!chosen) return null;
    const reply = matingReply(chess, chosen);
    if(!reply) return null;
    const safe = moves.filter(move => move !== chosen && !matingReply(chess, move));
    if(!safe.length) return null;
    const preference = move => (mentioned.includes(uciOf(move)) ? 100 : 0) + materialAfter(chess, move) * 10
        + { n: 4, b: 3, p: 2, r: 1, q: 1, k: 0 }[move.piece];
    const alternative = safe.sort((a, b) => preference(b) - preference(a))[0];
    chess.move(alternative);
    const index = square => (8 - Number(square[1])) * 8 + square.charCodeAt(0) - 97;
    const guards = new CaptureExchange(chess.fen()).attackersTo(index(reply.to), alternative.color).includes(index(alternative.to));
    chess.undo();
    return { pick: chosen.san, uci, reply: reply.san, guards: guards ? reply.to : null,
        alternative: { san: alternative.san, uci: uciOf(alternative) } };
}

export function problemText(problem) {
    const guard = problem.guards ? `, guarding ${problem.guards}` : '';
    return `${problem.alternative.san}${guard}. The tempting alternative ${problem.pick} runs into ${problem.reply}, which is checkmate.`;
}


