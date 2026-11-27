// Polyglot book data for BookSmith. Needs the classic PolyglotBook.js script loaded first for POLYGLOT_BOOK.
import { Chess } from '../../app/assets/engines/libraries/chessjs/chess.js';

export const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const maxWeight = 100;
export const pgnPlies = 30;

const promotionCodes = { n: 1, b: 2, r: 3, q: 4 };
const promotionLetters = ['', 'n', 'b', 'r', 'q'];
const castleRooks = { e1g1: 'e1h1', e1c1: 'e1a1', e8g8: 'e8h8', e8c8: 'e8a8' };

export function positionKey(fen) {
    const key = POLYGLOT_BOOK.prototype.fenToKey(fen);
    return key === null ? null : key.toString(16).padStart(16, '0');
}

// Polyglot writes castling as king takes rook.
export function bookMove(move) {
    const uci = move.from + move.to;
    return /[kq]/.test(move.flags || '') ? castleRooks[uci] : uci + (move.promotion || '');
}

export function findMove(chess, code) {
    return chess.moves({ verbose: true }).find(move =>
        bookMove(move) === code || move.from + move.to + (move.promotion || '') === code) || null;
}

export function setWeight(book, key, code, weight) {
    let moves = book.get(key);
    if(!moves) book.set(key, moves = new Map());
    moves.set(code, Math.max(0, Math.min(maxWeight, weight)));
}

export function removeMove(book, key, code) {
    const moves = book.get(key);
    if(!moves) return;
    moves.delete(code);
    if(!moves.size) book.delete(key);
}

// Puts every position on the editor's 0 to 100 scale without rounding, so imported ratios survive export.
export function rescale(book) {
    for(const moves of book.values()) rescalePosition(moves);
    return book;
}

export function rescalePosition(moves) {
    if(!moves?.size) return;
    const top = Math.max(...moves.values());
    if(top === maxWeight || top <= 0) return;
    for(const [code, weight] of moves) moves.set(code, weight / top * maxWeight);
}

export function readBin(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if(!bytes.byteLength || bytes.byteLength % 16) throw new Error('Not a Polyglot book');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const square = index => String.fromCharCode(97 + (index & 7)) + ((index >> 3) + 1);
    const book = new Map();
    for(let offset = 0; offset < bytes.byteLength; offset += 16) {
        const key = view.getBigUint64(offset).toString(16).padStart(16, '0');
        const encoded = view.getUint16(offset + 8);
        const code = square((encoded >> 6) & 63) + square(encoded & 63) + (promotionLetters[(encoded >> 12) & 7] || '');
        let moves = book.get(key);
        if(!moves) book.set(key, moves = new Map());
        moves.set(code, (moves.get(code) || 0) + view.getUint16(offset + 10));
    }
    return rescale(book);
}

export function writeBin(book) {
    const square = text => (text.charCodeAt(0) - 97) | ((Number(text[1]) - 1) << 3);
    const records = [];
    for(const [key, moves] of book) {
        const top = Math.max(0, ...moves.values());
        for(const [code, weight] of moves) {
            const encoded = square(code.slice(2, 4)) | (square(code.slice(0, 2)) << 6) | ((promotionCodes[code[4]] || 0) << 12);
            const scaled = top > 0 && weight > 0 ? Math.max(1, Math.round(weight / top * 65535)) : 0;
            records.push([BigInt('0x' + key), encoded, scaled]);
        }
    }
    records.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : b[2] - a[2]);
    const bytes = new Uint8Array(records.length * 16);
    const view = new DataView(bytes.buffer);
    records.forEach(([key, encoded, weight], index) => {
        view.setBigUint64(index * 16, key);
        view.setUint16(index * 16 + 8, encoded);
        view.setUint16(index * 16 + 10, weight);
    });
    return bytes;
}

export function lineMoves(text) {
    let clean = text.replace(/\{[^}]*\}|;[^\n]*/g, ' ');
    while(/\([^()]*\)/.test(clean)) clean = clean.replace(/\([^()]*\)/g, ' ');
    return clean.replace(/\$\d+|\d+\.(\.\.)?|[?!]+|\be\.p\./g, ' ')
        .split(/\s+/).filter(token => token && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token))
        .map(token => token.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O'));
}

const sanPattern = /^([NBRQK])?([a-h])?([1-8])?x?([a-h][1-8])(?:=?([NBRQnbrq]))?[+#]*$/;
const reaches = {
    n: (file, rank) => file * rank === 2,
    b: (file, rank) => file === rank,
    r: (file, rank) => !file || !rank,
    q: (file, rank) => file === rank || !file || !rank,
    k: (file, rank) => file <= 1 && rank <= 1
};

// chess.js tests every candidate for check when parsing SAN, which is slow for long games.
// This finds the moving piece by geometry so chess.js only validates one move.
export function playMove(chess, token) {
    const match = sanPattern.exec(token);
    if(!match) return chess.move(token, { sloppy: true });
    const [, piece, fromFile, fromRank, to, promotion] = match;
    const color = chess.turn();
    const board = chess.board();
    const toFile = to.charCodeAt(0) - 97, toRank = Number(to[1]);
    const forward = color === 'w' ? 1 : -1;
    const at = (file, rank) => board[8 - rank]?.[file];
    const candidates = [];
    if(fromFile && fromRank && !piece) candidates.push(fromFile + fromRank);
    else if(!piece) {
        const file = fromFile ? fromFile.charCodeAt(0) - 97 : toFile;
        const ranks = fromFile && fromFile.charCodeAt(0) - 97 !== toFile ? [toRank - forward] : [toRank - forward, toRank - 2 * forward];
        const rank = ranks.find(value => at(file, value));
        if(rank && at(file, rank).type === 'p' && at(file, rank).color === color) candidates.push(String.fromCharCode(97 + file) + rank);
    } else {
        const type = piece.toLowerCase();
        for(let rank = 1; rank <= 8; rank++) {
            for(let file = 0; file < 8; file++) {
                const square = at(file, rank);
                if(square?.type !== type || square.color !== color) continue;
                if(fromFile && file !== fromFile.charCodeAt(0) - 97 || fromRank && rank !== Number(fromRank)) continue;
                if(reaches[type](Math.abs(file - toFile), Math.abs(rank - toRank))) candidates.push(String.fromCharCode(97 + file) + rank);
            }
        }
    }
    for(const from of candidates) {
        const move = chess.move({ from, to, promotion: promotion?.toLowerCase() });
        if(move) return move;
    }
    return chess.move(token, { sloppy: true });
}

// Adds SAN or UCI moves from a position. Counting is for building weights from games,
// and sides limits counting to the moves of those colors.
export function addLine(book, moves, { fen = startFen, weight = maxWeight, count = false, sides = null, onInvalidMove = null } = {}) {
    const chess = new Chess();
    if(!chess.load(fen)) throw new Error('Invalid starting position');
    const keys = [];
    for(const token of moves) {
        const key = positionKey(chess.fen());
        const turn = chess.turn();
        let move;
        try {
            move = key && playMove(chess, token);
        } catch(error) {
            if(!onInvalidMove) throw error;
            onInvalidMove({ token, parsed: keys.length, reason: error.message });
            break;
        }
        if(!move) {
            onInvalidMove?.({ token, parsed: keys.length, reason: key ? 'Invalid or unsupported move' : 'Unsupported position' });
            break;
        }
        keys.push(key);
        if(sides && !sides.includes(turn)) continue;
        const code = bookMove(move);
        const current = book.get(key)?.get(code);
        if(count) {
            let entries = book.get(key);
            if(!entries) book.set(key, entries = new Map());
            entries.set(code, (current || 0) + 1);
        } else if(current === undefined) setWeight(book, key, code, weight);
    }
    return keys.length;
}

const playerName = name => name && name !== '?' ? name.trim() : '';

// Splits PGN text into games. Exports with game links skip repeated games.
export function readGames(text) {
    const games = [];
    const seen = new Set();
    for(const chunk of text.replace(/\r/g, '').split(/\n\s*\n(?=\s*\[)/)) {
        const tags = {};
        for(const [, name, value] of chunk.matchAll(/^\s*\[(\w+)\s+"((?:\\.|[^"\\])*)"\s*\]\s*$/gm))
            tags[name] = value.replace(/\\(["\\])/g, '$1');
        const moves = lineMoves(chunk.replace(/^\s*\[[^\]]*\]\s*$/gm, ''));
        if(!moves.length) continue;
        const link = [tags.Link, tags.Site].find(url => /^https?:\/\/[^/]+\/\w/.test(url || ''));
        if(link && seen.has(link)) continue;
        if(link) seen.add(link);
        games.push({ white: playerName(tags.White), black: playerName(tags.Black), fen: tags.FEN || startFen, moves });
    }
    return games;
}

export function gamePlayers(games) {
    const players = new Map();
    for(const game of games) {
        for(const name of new Set([game.white, game.black].filter(Boolean))) {
            const id = name.toLowerCase();
            const player = players.get(id) || { name, games: 0 };
            player.games++;
            players.set(id, player);
        }
    }
    return [...players.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
}

// Export Matches names files site-username[-category][-partial].pgn. Otherwise pick whoever is in most games.
export function guessPlayer(fileName, players, total) {
    const named = /^(?:lichess|chesscom)-(.+?)(?:-(?:ultrabullet|bullet|blitz|rapid|classical|correspondence|daily))?(?:-partial)?$/i
        .exec(fileName.replace(/\.[^.]+$/, ''))?.[1]?.toLowerCase();
    const match = named && players.find(player => player.name.toLowerCase() === named);
    if(match) return match.name;
    return players[0] && players[0].games > total / 2 ? players[0].name : '';
}

// Counts game moves into a book. With a player, only their moves count, from either color.
export function addGames(book, games, { player = '', side = '', plies = pgnPlies, onIssue = null } = {}) {
    const target = player.toLowerCase();
    let used = 0;
    for(const game of games) {
        let sides = target ? ['w', 'b'].filter(color => (color === 'w' ? game.white : game.black).toLowerCase() === target) : ['w', 'b'];
        if(side) sides = sides.filter(color => color === side);
        if(!sides.length) continue;
        const report = issue => {
            console.warn('BookSmith could not read a complete game:', issue);
            onIssue?.(issue);
        };
        try {
            if(addLine(book, game.moves.slice(0, plies), {
                fen: game.fen, count: true, sides, onInvalidMove: report
            })) used++;
        } catch(error) {
            report({ token: null, parsed: 0, reason: error.message });
        }
    }
    return used;
}

// Drops moves seen in fewer than min games, then scales the counts into weights.
export function finishBook(book, min = 1) {
    for(const [key, moves] of book) {
        for(const [code, count] of moves) if(count < min) moves.delete(code);
        if(!moves.size) book.delete(key);
    }
    return rescale(book);
}

export function readPgn(text, plies = pgnPlies, onIssue = null) {
    const book = new Map();
    addGames(book, readGames(text), { plies, onIssue });
    if(!book.size) throw new Error('No moves found');
    return finishBook(book);
}

export async function readEpd(text) {
    const { default: EpdBook } = await import('../../app/assets/js/misc/EpdBook.js');
    const epd = new EpdBook(text);
    const book = new Map();
    for(const position of epd.positions.keys()) {
        const fen = position.split(' ').slice(0, 4).join(' ') + ' 0 1';
        const chess = new Chess();
        const key = chess.load(fen) && positionKey(fen);
        if(!key) continue;
        for(const move of epd.getMoves(fen)) {
            const legal = findMove(chess, move.from + move.to + (move.promotion?.toLowerCase() || ''));
            if(legal) setWeight(book, key, bookMove(legal), maxWeight);
        }
    }
    if(!book.size) throw new Error('No moves found');
    return book;
}

export async function readBook(name, data, { onIssue = null } = {}) {
    if(/\.epd$/i.test(name)) return readEpd(new TextDecoder().decode(data));
    if(/\.(pgn|txt)$/i.test(name)) return readPgn(new TextDecoder().decode(data), pgnPlies, onIssue);
    return readBin(data);
}

function layerShare(layers, layer, mode) {
    return mode === 'blend' ? layers.length - layers.indexOf(layer) : 1;
}

// Layers are ordered top first. Priority lets the top book with moves decide.
// Blend gives books shares of n, n-1 ... 1, and Equal gives each book the same share.
export function mergePosition(layers, key, mode) {
    const present = layers.filter(layer => layer.book.has(key));
    const moves = new Map();
    for(const layer of mode === 'priority' ? present.slice(0, 1) : present) {
        const entries = layer.book.get(key);
        const total = [...entries.values()].reduce((sum, weight) => sum + weight, 0);
        const share = layerShare(layers, layer, mode);
        for(const [code, weight] of entries) {
            const move = moves.get(code) || { code, weight: 0, parts: [] };
            const part = total > 0 ? share * weight / total : 0;
            move.weight += part;
            move.parts.push({ layer, weight: part });
            moves.set(code, move);
        }
    }
    const total = [...moves.values()].reduce((sum, move) => sum + move.weight, 0);
    const share = value => total > 0 ? value / total : 0;
    return [...moves.values()].map(move => ({
        code: move.code, share: share(move.weight),
        parts: move.parts.map(part => ({ layer: part.layer, share: share(part.weight) }))
    })).sort((a, b) => b.share - a.share);
}

export function mergeBooks(layers, mode) {
    const book = new Map();
    for(const key of new Set(layers.flatMap(layer => [...layer.book.keys()]))) {
        const moves = mergePosition(layers, key, mode);
        const top = Math.max(0, ...moves.map(move => move.share));
        book.set(key, new Map(moves.map(move => [move.code, top > 0 ? move.share / top * maxWeight : 0])));
    }
    return book;
}

export function layerShares(layers, mode) {
    if(mode === 'priority') return layers.map(() => null);
    const total = layers.reduce((sum, layer) => sum + layerShare(layers, layer, mode), 0);
    return layers.map(layer => layerShare(layers, layer, mode) / total);
}

// Indexes named openings by position so the editor can name and extend lines.
export function indexOpenings(records) {
    const names = new Map();
    const lines = [];
    for(const record of records) {
        const chess = new Chess();
        const keys = [];
        const codes = [];
        for(const san of lineMoves(record.pgn)) {
            const key = positionKey(chess.fen());
            const move = chess.move(san);
            if(!move) break;
            keys.push(key);
            codes.push(bookMove(move));
        }
        const key = positionKey(chess.fen());
        if(!names.has(key)) names.set(key, record.name);
        lines.push({ name: record.name, eco: record.eco, pgn: record.pgn, keys, codes, end: key });
    }
    return { names, lines };
}

// Adds every named line through a position. Weights follow how many lines share a move.
export function addOpeningsFrom(book, lines, key) {
    const counts = new Map();
    for(const line of lines) {
        const start = line.keys.indexOf(key);
        if(start < 0) continue;
        for(let index = start; index < line.codes.length; index++) {
            let moves = counts.get(line.keys[index]);
            if(!moves) counts.set(line.keys[index], moves = new Map());
            moves.set(line.codes[index], (moves.get(line.codes[index]) || 0) + 1);
        }
    }
    rescale(counts);
    let added = 0;
    for(const [position, moves] of counts) {
        for(const [code, weight] of moves) {
            if(book.get(position)?.has(code)) continue;
            setWeight(book, position, code, weight);
            added++;
        }
    }
    return added;
}
