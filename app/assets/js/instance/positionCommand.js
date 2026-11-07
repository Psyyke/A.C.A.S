import { Chess } from '../../engines/libraries/chessjs/chess.js';

function uciMove(state) {
    const change = state?.boardChanges;
    if(!/^[a-h][1-8]$/.test(change?.from ?? '') || !/^[a-h][1-8]$/.test(change?.to ?? '')) return null;
    const promotion = change.promotionPiece ? String(change.promotionPiece).toLowerCase() : '';
    if(promotion && !/^[qrbn]$/.test(promotion)) return null;
    return `${change.from}${change.to}${promotion}`;
}

export function buildPositionCommand(currentFen, newestFirstHistory, variant = 'chess') {
    const fallback = `position fen ${currentFen}`;
    if(variant !== 'chess' || !Array.isArray(newestFirstHistory) || newestFirstHistory.length < 2) return fallback;

    const history = [...newestFirstHistory].reverse();
    const baseFen = history[0]?.fen?.full;
    if(typeof baseFen !== 'string') return fallback;

    const moves = [];
    for(const state of history.slice(1)) {
        const move = uciMove(state);
        if(!move) return fallback;
        moves.push(move);
    }
    if(!moves.length) return fallback;

    try {
        const chess = new Chess();
        if(!chess.load(baseFen)) return fallback;
        for(const move of moves) {
            if(!chess.move({ from: move.slice(0, 2), to: move.slice(2, 4),
                ...(move.length === 5 ? { promotion: move[4] } : {}) })) return fallback;
        }

        const expected = currentFen.split(' ');
        const actual = chess.fen().split(' ');
        if(expected.slice(0, 4).join(' ') !== actual.slice(0, 4).join(' ')) return fallback;
        return `position fen ${baseFen} moves ${moves.join(' ')}`;
    } catch {
        return fallback;
    }
}
