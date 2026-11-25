import { Chess } from '../libraries/chessjs/chess.js';

const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
const pieces = 'pnbrqk';
const names = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
const movePattern = /<PIECE_([MO])([PNBRQK])>\s*<SQUARE_(\d+)>\s*(?:<PIECE_([MO])([PNBRQK])>\s*)?<SQUARE_(\d+)>(?:<PIECE_([MO])([QRBN])>)?/g;

function boardFor(fen) {
    const board = new Chess();
    if(!board.load(fen)) throw new Error('Pena received an invalid chess position.');
    return board;
}

export function moveFacts(fen, uci) {
    const board = boardFor(fen);
    const move = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci) && board.move({
        from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4]
    });
    if(!move) throw new Error('The move is not legal in its recorded position.');
    const effects = [];
    if(board.in_checkmate()) effects.push('It gives checkmate.');
    else if(board.in_check()) effects.push('It gives check.');
    if(move.captured) effects.push(`It captures the ${move.color === 'w' ? 'black' : 'white'} ${names[move.captured.toUpperCase()]}.`);
    if(move.promotion) effects.push(`It promotes to a ${names[move.promotion.toUpperCase()]}.`);
    if(move.flags.includes('k') || move.flags.includes('q')) effects.push('It castles the king.');
    else if(!move.captured && !move.promotion) {
        if(move.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(move.to))
            effects.push('It places a pawn in the center.');
        else if(['n', 'b'].includes(move.piece) && move.from[1] === (move.color === 'w' ? '1' : '8')
            && move.to[1] !== move.from[1])
            effects.push(`It brings the ${names[move.piece.toUpperCase()]} off the back rank.`);
    }
    return { san: move.san, effects };
}

function square(index, color) {
    const value = Number(index) - 1;
    if(!Number.isInteger(value) || value < 0 || value > 63) throw new Error('Pena returned an invalid square token.');
    const oriented = color === 'b' ? value ^ 56 : value;
    return 'abcdefgh'[oriented % 8] + (1 + Math.floor(oriented / 8));
}

export function encodePosition(fen, history = []) {
    const boards = [...history, fen].map(boardFor);
    const color = boards.at(-1).turn();
    const planes = new Float32Array(112 * 64);
    const keys = boards.map(board => {
        const fields = board.fen().split(' ');
        if(fields[3] !== '-' && !board.moves({ verbose: true }).some(move => move.flags.includes('e'))) fields[3] = '-';
        return fields.slice(0, 4).join(' ');
    });
    const fill = (plane, value = 1) => planes.fill(value, plane * 64, (plane + 1) * 64);
    const indexOf = name => ('abcdefgh'.indexOf(name[0]) + (Number(name[1]) - 1) * 8) ^ (color === 'b' ? 56 : 0);

    for(let slot = 0; slot < 8; slot++) {
        const index = boards.length - 1 - slot;
        const board = boards[Math.max(index, 0)];
        if(index < 0 && keys[0] === start) break;
        for(const row of board.board()) {
            for(const piece of row) {
                if(!piece) continue;
                const plane = slot * 13 + pieces.indexOf(piece.type) + (piece.color === color ? 0 : 6);
                planes[plane * 64 + indexOf(piece.square)] = 1;
            }
        }
        const positionIndex = Math.max(index, 0);
        if(keys.slice(0, positionIndex).includes(keys[positionIndex])) fill(slot * 13 + 12);
        if(index < 0) {
            const ep = board.fen().split(' ')[3];
            if(ep !== '-') {
                const movedColor = board.turn() === 'w' ? 'b' : 'w';
                const rank = Number(ep[1]);
                const plane = slot * 13 + (movedColor === color ? 0 : 6);
                const current = ep[0] + (rank + (movedColor === 'w' ? 1 : -1));
                const previous = ep[0] + (rank + (movedColor === 'w' ? -1 : 1));
                planes[plane * 64 + indexOf(current)] = 0;
                planes[plane * 64 + indexOf(previous)] = 1;
            }
        }
    }

    const fields = boards.at(-1).fen().split(' ');
    const rights = color === 'w' ? ['Q', 'K', 'q', 'k'] : ['q', 'k', 'Q', 'K'];
    rights.forEach((right, index) => { if(fields[2].includes(right)) fill(104 + index); });
    if(color === 'b') fill(108);
    fill(109, Number(fields[4]));
    fill(111);
    return planes;
}

export function decodeExplanation(raw, color) {
    const colour = side => (side === 'M') === (color === 'w') ? 'white' : 'black';
    return raw
        .replace(/<PIECE_([MO])P><SQUARE_(\d+)><PIECE_([MO])([PNBRQK])><SQUARE_(\d+)><PIECE_\1([QRBN])>/g,
            (_, side, from, victimSide, victim, to, promotion) => `${colour(side)} pawn ${square(from, color)} takes ${colour(victimSide)} ${names[victim]} ${square(to, color)}${promotion.toLowerCase()}`)
        .replace(/<PIECE_([MO])P><SQUARE_(\d+)><SQUARE_(\d+)><PIECE_\1([QRBN])>/g,
            (_, side, from, to, promotion) => `${colour(side)} pawn ${square(from, color)}-${square(to, color)}${promotion.toLowerCase()}`)
        .replace(/<PIECE_([MO])([PNBRQK])><SQUARE_(\d+)><PIECE_([MO])([PNBRQK])><SQUARE_(\d+)>/g,
            (_, a, b, c, d, e, f) => `${colour(a)} ${names[b]} ${square(c, color)} takes ${colour(d)} ${names[e]} ${square(f, color)}`)
        .replace(/<PIECE_([MO])([PNBRQK])><SQUARE_(\d+)><SQUARE_(\d+)>/g,
            (_, side, piece, from, to) => `${colour(side)} ${names[piece]} ${square(from, color)}-${square(to, color)}`)
        .replace(/(?<=>)(?=<)/g, ' ')
        .replace(/<SQUARE_(\d+)>/g, (_, index) => square(index, color))
        .replace(/<PIECE_([MO])([PNBRQK])>/g, (_, side, piece) => `${colour(side)} ${names[piece]}`)
        .replaceAll('<PLAYER>', color === 'w' ? 'White' : 'Black')
        .replaceAll('<OPPONENT>', color === 'w' ? 'Black' : 'White')
        .replaceAll('<EMPTY>', 'empty');
}

function checkedMove(board, match, color) {
    const [, side, piece, source, capturedSide, capturedPiece, target, promotionSide, promotion] = match;
    const from = square(source, color), to = square(target, color);
    const mover = board.get(from);
    const moverColor = (side === 'M') === (color === 'w') ? 'w' : 'b';
    if(mover?.color !== moverColor || mover.type !== piece.toLowerCase()) return null;
    if(promotionSide && promotionSide !== side) return null;
    const candidate = board.moves({ verbose: true }).find(move => move.from === from && move.to === to
        && (move.promotion || '') === (promotion?.toLowerCase() || (piece === 'P' && /[18]$/.test(to) ? 'q' : '')));
    if(!candidate) return null;
    const victimColor = capturedSide ? ((capturedSide === 'M') === (color === 'w') ? 'w' : 'b') : null;
    if(Boolean(candidate.captured) !== Boolean(capturedPiece) || candidate.captured && (
        candidate.captured !== capturedPiece.toLowerCase() || victimColor === moverColor)) return null;
    return candidate;
}

export function parseRecommendation(raw, fen) {
    const fields = {};
    for(const match of raw.matchAll(/^(ANALYSIS|BEST_MOVE|CRITICAL_LINE|PROMISING_MOVES|EVALUATION):\s*([\s\S]*?)(?=^(?:ANALYSIS|BEST_MOVE|CRITICAL_LINE|PROMISING_MOVES|EVALUATION):|(?![\s\S]))/gm)) {
        fields[match[1]] = match[2].trim();
    }
    const board = boardFor(fen);
    const color = board.turn();
    const bestAtom = [...(fields.BEST_MOVE || '').matchAll(movePattern)][0];
    const best = bestAtom ? checkedMove(board, bestAtom, color) : null;
    if(!best) throw new Error('Pena did not return a valid BEST_MOVE. No move was played.');
    const uci = move => move.from + move.to + (move.promotion || '');
    const pv = [];
    for(const atom of (fields.CRITICAL_LINE || '').matchAll(movePattern)) {
        const move = checkedMove(board, atom, color);
        if(!move) break;
        pv.push(uci(move));
        board.move(move);
        if(board.game_over()) break;
    }
    const bestMove = uci(best);
    return { bestMove, pv: pv[0] === bestMove ? pv : [bestMove], text: decodeExplanation(raw, color) };
}
