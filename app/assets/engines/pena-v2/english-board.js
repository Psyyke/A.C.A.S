import { Chess, SQUARES } from '../libraries/chessjs/chess.js';

// Inkling explains positions most reliably from plain sentences: one line per piece with
// what it attacks, guards and is hit by. The format experiment found far fewer
// misplaced pieces and impossible moves this way than with compact PCF codes.
export const englishBoardLayout = 'pena-english-board/1';

const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const sides = { w: 'White', b: 'Black' };
const describe = piece => `${sides[piece.color]} ${names[piece.type]} ${piece.square}`;
const pieceAt = (board, square) => board.get(square) && { ...board.get(square), square };

function controls(board, piece, to) {
    const fx = piece.square.charCodeAt(0) - 97, fy = Number(piece.square[1]) - 1;
    const tx = to.charCodeAt(0) - 97, ty = Number(to[1]) - 1;
    const dx = tx - fx, dy = ty - fy, ax = Math.abs(dx), ay = Math.abs(dy);
    if(!ax && !ay) return false;
    if(piece.type === 'n') return ax * ay === 2;
    if(piece.type === 'k') return Math.max(ax, ay) === 1;
    if(piece.type === 'p') return ax === 1 && dy === (piece.color === 'w' ? 1 : -1);
    const line = !dx || !dy ? 'r' : ax === ay ? 'b' : null;
    if(!line || (piece.type !== 'q' && piece.type !== line)) return false;
    const sx = Math.sign(dx), sy = Math.sign(dy);
    for(let x = fx + sx, y = fy + sy; x !== tx || y !== ty; x += sx, y += sy)
        if(board.get(String.fromCharCode(97 + x) + (y + 1))) return false;
    return true;
}

const hitters = (board, square, color) => SQUARES.map(from => pieceAt(board, from))
    .filter(piece => piece?.color === color && controls(board, piece, square));

function lastMove(previousFen, fen) {
    if(!previousFen) return null;
    // chess.js writes an en passant square after every double push, and app FENs often don't, so that field is left out.
    const key = value => value.split(' ').slice(0, 3).join(' ');
    try {
        const before = new Chess(previousFen), target = key(fen);
        for(const move of before.moves({ verbose: true })) {
            before.move(move);
            const reached = key(before.fen()) === target;
            before.undo();
            if(reached) return `Last move: ${sides[move.color]} played ${move.san}, ${names[move.piece]} from ${move.from} to ${move.to}`
                + `${move.captured ? `, taking the ${names[move.captured]}` : ''}.`;
        }
    } catch {}
    return null;
}

/** Every piece on the current board in plain English, rule-checked. */
export function englishBoard(fen, { playerColor, previousFen = null } = {}) {
    const board = new Chess(fen);
    const turn = board.turn();
    const lines = [`You play ${sides[playerColor] || sides[turn]}. ${sides[turn]} to move.${board.in_check() ? ` ${sides[turn]} is in check.` : ''}`];
    const played = lastMove(previousFen, fen);
    if(played) lines.push(played);
    lines.push('Every piece, what it attacks and who guards it (rule-checked, current board only):');
    for(const piece of SQUARES.map(square => pieceAt(board, square)).filter(Boolean)) {
        const targets = SQUARES.filter(square => controls(board, piece, square)).map(square => pieceAt(board, square)).filter(Boolean);
        const list = (items, empty) => items.map(describe).join(', ') || empty;
        const moves = turn === piece.color ? board.moves({ square: piece.square, verbose: true }).map(move => move.san) : null;
        lines.push(`${describe(piece)}: attacks ${list(targets.filter(target => target.color !== piece.color), 'no enemy piece')}; `
            + `guards ${list(targets.filter(target => target.color === piece.color), 'nothing')}; `
            + `attacked by ${list(hitters(board, piece.square, piece.color === 'w' ? 'b' : 'w'), 'nobody')}; `
            + `defended by ${list(hitters(board, piece.square, piece.color), 'nobody')}`
            + (moves ? `; legal moves ${moves.join(' ') || 'none'}` : '') + '.');
    }
    return lines.join('\n');
}
