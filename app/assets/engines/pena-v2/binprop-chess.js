/* MIT-licensed BinProp chess motif compatibility layer; see BINPROP-LICENSE.txt. */
import { Chess } from '../libraries/chessjs/chess.js';

const toSquare = n => 'abcdefgh'[n % 8] + (Math.floor(n / 8) + 1);
const fromSquare = s => (Number(s[1]) - 1) * 8 + s.charCodeAt(0) - 97;
const colorName = color => color ? 'w' : 'b';
const integer = value => Number.isSafeInteger(value) && value >= 0 && value < 64;

class Board {
    constructor(fen) {
        this.board = new Chess();
        if(!this.board.load(fen)) throw new Error('BinProp requires a valid chess position.');
        this.saved = [];
        this.cache = null;
    }
    get turn() { return this.board.turn() === 'w'; }
    set turn(value) {
        const parts = this.board.fen().split(' ');
        if(parts[1] !== colorName(value)) parts[3] = '-';
        parts[1] = colorName(value);
        if(!this.board.load(parts.join(' '))) throw new Error('Invalid BinProp perspective.');
        this.cache = null;
    }
    piece_at(square) {
        if(!integer(square)) return null;
        const piece = this.board.get(toSquare(square));
        return piece ? { piece_type: piece.type, color: piece.color === 'w' } : null;
    }
    piece_type_at(square) { return this.piece_at(square)?.piece_type || null; }
    piece_map() {
        const result = new Dict();
        for(let square = 0; square < 64; square++) {
            const piece = this.piece_at(square);
            if(piece) result.set(square, piece);
        }
        return result;
    }
    pieces(type, color) {
        return new Set([...this.piece_map()].filter(([, piece]) => piece.piece_type === type && piece.color === color).map(([square]) => square));
    }
    king(color) { return [...this.pieces('k', color)][0] ?? null; }
    attacks(square) {
        if(!this.cache) this.cache = new Map();
        if(this.cache.has(square)) return this.cache.get(square);
        const piece = this.piece_at(square), result = new Set();
        if(!piece) return result;
        const file = square % 8, rank = Math.floor(square / 8);
        const add = (x, y) => { if(x >= 0 && x < 8 && y >= 0 && y < 8) result.add(y * 8 + x); };
        if(piece.piece_type === 'p') for(const dx of [-1, 1]) add(file + dx, rank + (piece.color ? 1 : -1));
        else if(piece.piece_type === 'n') for(const [dx, dy] of [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]]) add(file + dx, rank + dy);
        else {
            for(const [dx, dy] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
                if(piece.piece_type === 'b' && (!dx || !dy) || piece.piece_type === 'r' && dx && dy) continue;
                for(let x = file + dx, y = rank + dy; x >= 0 && x < 8 && y >= 0 && y < 8; x += dx, y += dy) {
                    const target = y * 8 + x;
                    result.add(target);
                    if(piece.piece_type === 'k' || this.piece_at(target)) break;
                }
            }
        }
        this.cache.set(square, result);
        return result;
    }
    attackers(color, target) {
        if(!integer(target)) throw new Error('Invalid BinProp attack target.');
        return new Set([...this.piece_map()].filter(([square, piece]) => piece.color === color && this.attacks(square).has(target)).map(([square]) => square));
    }
    is_check() { return this.board.in_check(); }
    is_checkmate() { return this.board.in_checkmate(); }
    is_stalemate() { return this.board.in_stalemate(); }
    is_insufficient_material() { return this.board.insufficient_material(); }
    is_valid() {
        const white = this.king(true), black = this.king(false);
        return white !== null && black !== null && this.attackers(this.turn, this.turn ? black : white).size === 0;
    }
    is_pinned(color, square) {
        const king = this.king(color);
        if(king === null || !integer(square) || square === king) return false;
        const dx = Math.sign(square % 8 - king % 8), dy = Math.sign(Math.floor(square / 8) - Math.floor(king / 8));
        if(dx && dy && Math.abs(square % 8 - king % 8) !== Math.abs(Math.floor(square / 8) - Math.floor(king / 8))) return false;
        for(let x = king % 8 + dx, y = Math.floor(king / 8) + dy; x >= 0 && x < 8 && y >= 0 && y < 8; x += dx, y += dy) {
            const current = y * 8 + x, piece = this.piece_at(current);
            if(current === square) continue;
            if(!piece) continue;
            return (dx ? (current % 8 - king % 8) * dx > (square % 8 - king % 8) * dx
                : (Math.floor(current / 8) - Math.floor(king / 8)) * dy > (Math.floor(square / 8) - Math.floor(king / 8)) * dy)
                && piece.color !== color && (piece.piece_type === 'q' || piece.piece_type === (dx && dy ? 'b' : 'r'));
        }
        return false;
    }
    get legal_moves() {
        return this.board.moves({ verbose: true }).map(move => ({ from_square: fromSquare(move.from), to_square: fromSquare(move.to),
            promotion: move.promotion || null, flags: move.flags }));
    }
    generate_legal_captures() { return this.legal_moves.filter(move => this.is_capture(move)); }
    is_capture(move) { return move.flags?.includes('c') || move.flags?.includes('e') || false; }
    is_en_passant(move) { return move.flags?.includes('e') || false; }
    gives_check(move) { this.push(move); try { return this.is_check(); } finally { this.pop(); } }
    push(move) {
        this.saved.push(this.board.fen());
        if(move === null) this.turn = !this.turn;
        else if(!this.board.move({ from: toSquare(move.from_square), to: toSquare(move.to_square), promotion: move.promotion || undefined }))
            throw new Error('BinProp attempted an illegal move.');
        this.cache = null;
    }
    pop() {
        if(!this.saved.length || !this.board.load(this.saved.pop())) throw new Error('BinProp move stack underflow.');
        this.cache = null;
    }
    has_kingside_castling_rights(color) { return this.board.fen().split(' ')[2].includes(color ? 'K' : 'k'); }
    has_queenside_castling_rights(color) { return this.board.fen().split(' ')[2].includes(color ? 'Q' : 'q'); }
    has_castling_rights(color) { return this.has_kingside_castling_rights(color) || this.has_queenside_castling_rights(color); }
}

class Dict extends Map {
    get(key, fallback = null) { return this.has(key) ? super.get(key) : fallback; }
    items() { return [...this.entries()]; }
    setdefault(key, fallback) { if(!this.has(key)) this.set(key, fallback); return this.get(key); }
}

const truth = value => value !== null && value !== undefined && value !== false && value !== 0 && value !== ''
    && !(Array.isArray(value) && !value.length) && !(value instanceof Set && !value.size) && !(value instanceof Map && !value.size);
const iter = value => value instanceof Map ? value.keys() : value;
const item = (object, key) => object instanceof Map ? object.get(key) : object[key < 0 && Array.isArray(object) ? object.length + key : key];
const setitem = (object, key, value) => object instanceof Map ? object.set(key, value) : (object[key < 0 && Array.isArray(object) ? object.length + key : key] = value);
const contains = (object, value) => object instanceof Map || object instanceof Set ? object.has(value) : object.includes(value);
const add = (a, b) => Array.isArray(a) && Array.isArray(b) ? a.concat(b) : a + b;
const multiply = (a, b) => Array.isArray(a) && Number.isInteger(b) ? Array.from({ length: Math.max(0, b) }, () => a).flat()
    : Array.isArray(b) && Number.isInteger(a) ? Array.from({ length: Math.max(0, a) }, () => b).flat() : a * b;
const bitand = (a, b) => typeof a === 'number' && typeof b === 'number' ? a & b : new Set([...a].filter(value => b.has(value)));
const len = value => value instanceof Set || value instanceof Map ? value.size : value.length;
const range = (...args) => {
    const [start, end, step] = args.length === 1 ? [0, args[0], 1] : [args[0], args[1], args[2] ?? 1];
    const out = [];
    for(let n = start; step > 0 ? n < end : n > end; n += step) out.push(n);
    return out;
};
const extrema = (fn, args) => fn(...(args.length === 1 && typeof args[0] !== 'number' ? [...iter(args[0])] : args));
const py = { truth, iter, item, setitem, contains, add, multiply, bitand, len, range, Dict,
    list: value => [...iter(value)], set: value => new Set(value === undefined ? [] : iter(value)),
    bool: truth, float: Number, abs: Math.abs, sum: values => [...iter(values)].reduce((a, b) => a + b, 0),
    min: (...args) => extrema(Math.min, args), max: (...args) => extrema(Math.max, args),
    any: values => [...iter(values)].some(truth), all: values => [...iter(values)].every(truth),
    sorted: values => [...iter(values)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0),
    remove: (values, value) => { const index = values.indexOf(value); if(index < 0) throw new Error('BinProp list value is absent.'); values.splice(index, 1); },
    update: (values, added) => { for(const value of iter(added)) values.add(value); } };

const chess = { Board, WHITE: true, BLACK: false, PAWN: 'p', KNIGHT: 'n', BISHOP: 'b', ROOK: 'r', QUEEN: 'q', KING: 'k',
    SQUARES: range(64), D4: 27, E4: 28, D5: 35, E5: 36, Move: { null: () => null },
    square: (file, rank) => rank * 8 + file, square_file: square => square % 8, square_rank: square => Math.floor(square / 8),
    square_distance: (a, b) => Math.max(Math.abs(a % 8 - b % 8), Math.abs(Math.floor(a / 8) - Math.floor(b / 8))) };

export function binPropPerspective(fen, side) {
    if(!['w', 'b'].includes(side)) throw new Error('BinProp needs a valid perspective.');
    const parts = fen.split(' ');
    if(parts.length !== 6) throw new Error('BinProp needs a complete chess position.');
    if(parts[1] !== side) parts[3] = '-';
    parts[1] = side;
    const board = new Chess();
    if(!board.load(parts.join(' '))) throw new Error('Invalid BinProp position.');
    if(parts[3] !== '-' && !board.moves({ verbose: true }).some(move => move.flags.includes('e'))) parts[3] = '-';
    return parts.join(' ');
}

export { chess, py };
