const pieceValues = Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 });
const knightSteps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const kingSteps = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export function getPieceValue(piece) {
    return pieceValues[piece?.toLowerCase()] || 0;
}

function pieceColor(piece) {
    return piece === piece.toUpperCase() ? 'w' : 'b';
}

function squareIndex(square) {
    return /^[a-h][1-8]$/.test(square)
        ? (8 - Number(square[1])) * 8 + square.charCodeAt(0) - 97 : -1;
}

// Material-only exchanges on one square, not a positional or tactical engine search.
// Both sides may stop exchanging. Every continued capture must leave its king safe.
export default class CaptureExchange {
    constructor(fen) {
        const fields = String(fen ?? '').trim().split(/\s+/);
        const rows = fields[0].split('/');
        this.board = [];
        this.kings = { w: -1, b: -1 };
        this.turn = fields[1];
        this.enPassant = squareIndex(fields[3] ?? '-');
        this.valid = false;

        if(rows.length !== 8) return;
        for(const row of rows) {
            if(!/^[prnbqkPRNBQK1-8]+$/.test(row)) return;
            const start = this.board.length;
            for(const token of row) {
                if(/[1-8]/.test(token)) this.board.push(...Array(Number(token)).fill(null));
                else this.board.push(token);
            }
            if(this.board.length - start !== 8) return;
        }

        for(let square = 0; square < 64; square++) {
            const piece = this.board[square];
            if(piece?.toLowerCase() !== 'k') continue;
            const color = pieceColor(piece);
            if(this.kings[color] !== -1) return;
            this.kings[color] = square;
        }
        this.valid = this.kings.w !== -1 && this.kings.b !== -1;
    }

    attackersTo(target, color) {
        const row = Math.floor(target / 8), col = target % 8;
        const attackers = [];
        const add = (r, c, types) => {
            if(r < 0 || r > 7 || c < 0 || c > 7) return;
            const square = r * 8 + c, piece = this.board[square];
            if(piece && pieceColor(piece) === color && types.includes(piece.toLowerCase())) attackers.push(square);
        };

        const pawnRow = row + (color === 'w' ? 1 : -1);
        add(pawnRow, col - 1, 'p');
        add(pawnRow, col + 1, 'p');
        knightSteps.forEach(([dr, dc]) => add(row + dr, col + dc, 'n'));
        kingSteps.forEach(([dr, dc]) => add(row + dr, col + dc, 'k'));

        for(const [dr, dc] of kingSteps) {
            const types = dr && dc ? 'bq' : 'rq';
            for(let r = row + dr, c = col + dc; r >= 0 && r < 8 && c >= 0 && c < 8; r += dr, c += dc) {
                if(!this.board[r * 8 + c]) continue;
                add(r, c, types);
                break;
            }
        }
        return attackers;
    }

    exchangeGain(target, color, cache, cutoff = Infinity) {
        if(cutoff <= 0) return 0;
        const victim = this.board[target];
        // Kings are never traded or captured, including after a legal king recapture.
        if(!victim || victim.toLowerCase() === 'k' || pieceColor(victim) === color) return 0;
        const key = `${target}:${color}:${this.board.map(piece => piece || '.').join('')}`;
        if(cache.has(key)) return cache.get(key);

        let best = 0;
        const attackers = this.attackersTo(target, color)
            .sort((a, b) => getPieceValue(this.board[a]) - getPieceValue(this.board[b]));
        for(const from of attackers) {
            const piece = this.board[from];
            const promotes = piece.toLowerCase() === 'p' && Math.floor(target / 8) === (color === 'w' ? 0 : 7);
            for(const promotion of promotes ? ['q', 'r', 'b', 'n'] : [null]) {
                const immediateGain = getPieceValue(victim) + (promotion ? getPieceValue(promotion) - 1 : 0);
                if(immediateGain <= best) continue;
                const gain = this.captureGain(from, target, color, promotion, target, cache, best);
                if(gain !== null) best = Math.max(best, gain);
                // A cutoff is a lower bound only; never memoize it as an exact score.
                if(best >= cutoff) return best;
            }
        }
        cache.set(key, best);
        return best;
    }

    captureGain(from, to, color, promotion, capturedSquare, cache, minimumGain = 0) {
        const piece = this.board[from], victim = this.board[capturedSquare];
        const oldTarget = this.board[to], oldKing = this.kings[color];
        const opponent = color === 'w' ? 'b' : 'w';
        const placedPiece = promotion ? color === 'w' ? promotion.toUpperCase() : promotion : piece;
        const immediateGain = getPieceValue(victim) + getPieceValue(placedPiece) - getPieceValue(piece);

        this.board[from] = null;
        this.board[capturedSquare] = null;
        this.board[to] = placedPiece;
        if(piece.toLowerCase() === 'k') this.kings[color] = to;

        try {
            // Geometric attacks are intentional here: even pinned pieces forbid king moves.
            if(this.attackersTo(this.kings[color], opponent).length) return null;
            return immediateGain - this.exchangeGain(to, opponent, cache, immediateGain - minimumGain);
        } finally {
            this.board[from] = piece;
            this.board[to] = oldTarget;
            this.board[capturedSquare] = victim;
            this.kings[color] = oldKing;
        }
    }

    captureLoss(square) {
        const target = squareIndex(square);
        if(!this.valid || target === -1) return null;
        const victim = this.board[target];
        if(!victim || victim.toLowerCase() === 'k') return 0;
        const color = pieceColor(victim) === 'w' ? 'b' : 'w';
        const cache = new Map();
        let loss = this.exchangeGain(target, color, cache);

        // En passant removes the pawn from a different square. Only the actual
        // side to move can use this one-turn right; recaptures continue on its landing square.
        const ep = this.enPassant;
        const epRow = color === 'w' ? 2 : 5;
        if(victim.toLowerCase() === 'p' && loss < 1 && this.turn === color && ep >= 0
            && Math.floor(ep / 8) === epRow && !this.board[ep]
            && target === ep + (color === 'w' ? 8 : -8)) {
            for(const from of this.attackersTo(ep, color)) {
                if(this.board[from].toLowerCase() !== 'p') continue;
                const gain = this.captureGain(from, ep, color, null, target, cache, loss);
                if(gain !== null) loss = Math.max(loss, gain);
            }
        }
        return loss;
    }
}