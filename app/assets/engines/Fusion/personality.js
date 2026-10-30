import { Chess } from '../libraries/chessjs/chess.js';

const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const clamp = value => Math.max(-1, Math.min(1, value));
const file = square => square.charCodeAt(0) - 97;
const rank = square => Number(square[1]) - 1;
const distance = (a, b) => Math.max(Math.abs(file(a) - file(b)), Math.abs(rank(a) - rank(b)));

// Geometric attacks, not legal moves: pawn pushes are not attacks, and pinned
// pieces still exert pressure. This is a style feature, never a tactical proof.
function attacks(piece, target, board) {
    const dx = file(target) - file(piece.square);
    const dy = rank(target) - rank(piece.square);
    if(dx === 0 && dy === 0) return false;

    if(piece.type === 'p') return Math.abs(dx) === 1 && dy === (piece.color === 'w' ? 1 : -1);
    if(piece.type === 'n') return Math.abs(dx) * Math.abs(dy) === 2;
    if(piece.type === 'k') return Math.max(Math.abs(dx), Math.abs(dy)) === 1;

    const diagonal = Math.abs(dx) === Math.abs(dy);
    const straight = dx === 0 || dy === 0;
    if((piece.type === 'b' && !diagonal) || (piece.type === 'r' && !straight)
        || (piece.type === 'q' && !diagonal && !straight)) return false;

    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    for(let x = file(piece.square) + stepX, y = rank(piece.square) + stepY;
        x !== file(target) || y !== rank(target); x += stepX, y += stepY) {
        if(board.get(String.fromCharCode(97 + x) + (y + 1))) return false;
    }
    return true;
}

function defensiveState(board, color) {
    const pieces = board.board().flat().filter(Boolean);
    const own = pieces.filter(piece => piece.color === color);
    const enemy = pieces.filter(piece => piece.color !== color);
    const king = own.find(piece => piece.type === 'k');
    const enemyKing = enemy.find(piece => piece.type === 'k');
    const attacked = square => enemy.some(piece => attacks(piece, square, board));
    const ring = [];

    for(let x = Math.max(0, file(king.square) - 1); x <= Math.min(7, file(king.square) + 1); x++) {
        for(let y = Math.max(0, rank(king.square) - 1); y <= Math.min(7, rank(king.square) + 1); y++) {
            ring.push(String.fromCharCode(97 + x) + (y + 1));
        }
    }

    const direction = color === 'w' ? 1 : -1;
    let shelter = 0;
    for(let x = Math.max(0, file(king.square) - 1); x <= Math.min(7, file(king.square) + 1); x++) {
        for(let step = 1; step <= 2; step++) {
            const pawn = board.get(String.fromCharCode(97 + x) + (rank(king.square) + direction * step + 1));
            if(pawn?.type === 'p' && pawn.color === color) shelter += step === 1 ? 1 : 0.5;
        }
    }

    const exposure = own.filter(piece => piece.type !== 'k' && attacked(piece.square))
        .reduce((sum, piece) => {
            const defended = own.some(defender => attacks(defender, piece.square, board));
            return sum + pieceValues[piece.type] * (defended ? 0.25 : 1);
        }, 0);
    const phase = Math.min(1, pieces.filter(piece => 'nbrq'.includes(piece.type))
        .reduce((sum, piece) => sum + pieceValues[piece.type], 0) / 62);

    return { king: king.square, enemyKing: enemyKing.square, shelter,
        pressure: ring.filter(attacked).length, exposure, phase };
}

export function moveFeatures(fen, legal) {
    const board = new Chess(fen);
    const color = board.turn();
    const before = defensiveState(board, color);
    const fullmove = Number(fen.split(' ')[5]);
    const features = new Map();

    for(const [uci, move] of legal) {
        board.move({ from: move.from, to: move.to, promotion: move.promotion });
        const after = defensiveState(board, color);
        board.undo();

        const advance = (rank(move.to) - rank(move.from)) * (color === 'w' ? 1 : -1);
        const exchange = move.captured ? Math.min(pieceValues[move.piece], pieceValues[move.captured]) / 9 : 0;
        features.set(uci, {
            check: Number(/[+#]/.test(move.san)),
            capture: Number(Boolean(move.captured)),
            advance: clamp(advance / 2),
            retreat: Number(move.piece !== 'p' && advance < 0),
            central: Number(/^[c-f][3-6]$/.test(move.to)),
            development: Number('nb'.includes(move.piece) && move.from[1] === (color === 'w' ? '1' : '8') && advance > 0),
            earlyQueen: Number(move.piece === 'q' && fullmove <= 10),
            castle: Number(/[kq]/.test(move.flags)),
            exchange,
            queenTrade: Number(move.piece === 'q' && move.captured === 'q'),
            pawnStorm: move.piece === 'p' && advance > 0
                ? clamp((distance(move.from, before.enemyKing) - distance(move.to, after.enemyKing)) / 2) : 0,
            kingSafety: clamp((before.pressure - after.pressure) / 3) * before.phase,
            shelter: clamp((after.shelter - before.shelter) / 2) * before.phase,
            rescue: clamp((before.exposure - after.exposure) / 5)
        });
    }
    return features;
}

export function personalityAdjustment(features, personality, strength, personalStyle = {}) {
    if(!features) return 0;
    const adjustment = Object.entries(personality.style)
        .reduce((sum, [key, weight]) => sum + weight * (features[key] || 0), 0) * strength / 100;
    const individual = Object.entries(personalStyle)
        .reduce((sum, [key, weight]) => sum + weight * (features[key] || 0), 0);

    // A style can multiply policy odds, but cannot replace the learned policy.
    return Math.max(-2, Math.min(2, adjustment + Math.max(-0.5, Math.min(0.5, individual))));
}