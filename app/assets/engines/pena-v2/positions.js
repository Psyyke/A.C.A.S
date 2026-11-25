import { Chess, SQUARES } from '../libraries/chessjs/chess.js';
import { Facts } from './concepts.js';

export function boardAt(fen) {
    const board = new Chess();
    if(typeof fen !== 'string' || !board.load(fen) || !board.validate_fen(fen).valid)
        throw new Error('Pena v2 needs a valid standard-chess FEN.');
    const pieces = board.board().flat().filter(Boolean);
    if(['w', 'b'].some(color => pieces.filter(piece => piece.color === color && piece.type === 'k').length !== 1))
        throw new Error('Pena v2 requires exactly one king per side.');
    return board;
}

export function playUci(board, uci) {
    if(typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))
        throw new Error(`Invalid coordinate move: ${uci}`);
    const move = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if(!move) throw new Error(`Illegal move ${uci} on ${board.fen()}`);
    return move;
}

const uciOf = move => move.from + move.to + (move.promotion || '');

export function canonicalUci(fen, uci) {
    const board = boardAt(fen);
    if(typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error(`Invalid coordinate move: ${uci}`);
    const moves = board.moves({ verbose: true });
    if(moves.some(move => uciOf(move) === uci)) return uci;
    // Lc0 verbose statistics print king-to-rook coordinates even in standard chess.
    const from = uci.slice(0, 2), to = uci.slice(2, 4);
    if(board.get(from)?.type === 'k' && board.get(to)?.type === 'r' && board.get(to).color === board.get(from).color) {
        const castle = moves.find(move => move.from === from && (to[0] === 'h' ? move.flags.includes('k') : to[0] === 'a' && move.flags.includes('q')));
        if(castle) return uciOf(castle);
    }
    throw new Error(`Illegal move ${uci} on ${fen}`);
}

const piecesAt = (board, identities) => SQUARES.filter(square => board.get(square)).map(square =>
    ({ id: identities.get(square), square, ...board.get(square) }));

export class PositionGraph {
    constructor(fen, history = []) {
        if(!Array.isArray(history) || history.length > 1024) throw new Error('Invalid position history.');
        const positions = [...history, fen].map(item => boardAt(item).fen());
        this.frames = new Map();
        this.moves = [];
        let current = this.addInitial(positions[0]);
        for(let i = 1; i < positions.length; i++) {
            const board = boardAt(current.fen);
            const matches = board.moves({ verbose: true }).filter(move => {
                const probe = boardAt(current.fen);
                probe.move(move);
                return probe.fen() === positions[i];
            });
            if(matches.length !== 1) throw new Error(`History transition ${i} is not one legal move.`);
            const uci = uciOf(matches[0]);
            this.moves.push(uci);
            current = this.advance(current, uci, `history-${i}`, 'history');
        }
        this.initialFen = positions[0];
        this.root = { ...current, id: 'root', branch: 'current', parentId: null };
        this.frames.set('root', this.root);
    }

    addInitial(fen) {
        const board = boardAt(fen);
        const identities = new Map(SQUARES.filter(square => board.get(square)).map(square => {
            const piece = board.get(square);
            return [square, `${piece.color}${piece.type}@${square}`];
        }));
        const frame = { id: 'history-0', branch: 'history', fen, parentId: null, move: null, pieces: piecesAt(board, identities) };
        this.frames.set(frame.id, frame);
        return frame;
    }

    advance(before, uci, id, branch) {
        if(this.frames.has(id)) throw new Error(`Duplicate position frame: ${id}`);
        const board = boardAt(before.fen), move = playUci(board, uci);
        const identities = new Map(before.pieces.map(piece => [piece.square, piece.id]));
        const actorId = identities.get(move.from);
        const capturedSquare = move.captured ? move.flags.includes('e') ? move.to[0] + move.from[1] : move.to : null;
        const capturedId = capturedSquare ? identities.get(capturedSquare) : null;
        identities.delete(move.from);
        if(capturedSquare) identities.delete(capturedSquare);
        identities.set(move.to, actorId);
        if(move.flags.includes('k') || move.flags.includes('q')) {
            const from = (move.flags.includes('k') ? 'h' : 'a') + move.from[1];
            const to = (move.flags.includes('k') ? 'f' : 'd') + move.from[1];
            identities.set(to, identities.get(from));
            identities.delete(from);
        }
        const frame = { id, branch, parentId: before.id, fen: board.fen(), pieces: piecesAt(board, identities),
            move: { uci, san: move.san, color: move.color, from: move.from, to: move.to, pieceId: actorId,
                capturedId, capturedSquare, promotion: move.promotion || null, check: board.in_check(), mate: board.in_checkmate() } };
        if(frame.pieces.some(piece => !piece.id)) throw new Error('Lost piece identity while replaying a move.');
        this.frames.set(id, frame);
        return frame;
    }

    branch(id, moves, { parent = 'root', maxPlies = 12 } = {}) {
        if(!/^[a-zA-Z][\w-]*$/.test(id) || !Array.isArray(moves) || !moves.length || moves.length > maxPlies)
            throw new Error('Invalid or overlong analysis branch.');
        let before = this.frames.get(parent);
        if(!before) throw new Error(`Unknown parent frame: ${parent}`);
        const result = [];
        for(const [index, uci] of moves.entries()) {
            before = this.advance(before, uci, `${id}-${index + 1}`, id);
            result.push(before);
        }
        return result;
    }

    command() {
        return `position fen ${this.initialFen}${this.moves.length ? ` moves ${this.moves.join(' ')}` : ''}`;
    }
}

function relations(frame) {
    const facts = new Facts(frame.fen), result = new Map();
    const bySquare = new Map(frame.pieces.map(piece => [piece.square, piece]));
    for(const square of SQUARES) for(const color of ['w', 'b']) {
        const target = bySquare.get(square);
        const kind = !target ? 'control' : target.color === color ? 'defend' : 'attack';
        for(const from of facts.attackers(square, color)) {
            const actor = bySquare.get(from);
            const relation = { kind, pieceId: actor.id, targetId: target?.id || null, from, to: square, color };
            result.set(`${kind}:${actor.id}:${target?.id || square}`, relation);
        }
    }
    return result;
}

export function effectsBetween(before, after) {
    if(after.parentId !== before.id) throw new Error('Move effects require consecutive frames.');
    const old = relations(before), next = relations(after);
    return { kind: 'geometric-move-effects', beforeFrame: before.id, afterFrame: after.id, move: after.move,
        gained: [...next].filter(([key]) => !old.has(key)).map(([, value]) => value),
        lost: [...old].filter(([key]) => !next.has(key)).map(([, value]) => value),
        caveat: 'Geometric attacks include pinned pieces; an attack or undefended piece does not establish a legal capture or material win.' };
}
