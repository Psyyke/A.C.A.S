const square = index => String.fromCharCode(97 + index % 8) + (1 + Math.floor(index / 8));
const policyMoves = [];
for(let from = 0; from < 64; from++) {
    for(let to = 0; to < 64; to++) {
        const x = Math.abs(to % 8 - from % 8), y = Math.abs((to >> 3) - (from >> 3));
        if(from !== to && (!x || !y || x === y || x * y === 2)) policyMoves.push(square(from) + square(to));
    }
}
for(let from = 0; from < 8; from++)
    for(let to = Math.max(0, from - 1); to <= Math.min(7, from + 1); to++)
        for(const piece of ['q', 'r', 'b']) policyMoves.push(square(48 + from) + square(56 + to) + piece);
const policyIndex = new Map(policyMoves.map((move, index) => [move, index]));

export function moveIndex(move, black, castling = false) {
    if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) throw new Error(`Invalid UCI move: ${move}`);
    let encoded = black ? move[0] + (9 - Number(move[1])) + move[2] + (9 - Number(move[3])) + move.slice(4) : move;
    // Lc0's packed knight promotion shares the ordinary from-to index.
    if(encoded.endsWith('n')) encoded = encoded.slice(0, 4);
    // Chess.js encodes standard castling king destinations, Lc0 uses rook squares.
    if(castling && encoded === 'e1g1') encoded = 'e1h1';
    if(castling && encoded === 'e1c1') encoded = 'e1a1';
    const index = policyIndex.get(encoded);
    if(index === undefined) throw new Error(`Move has no Lc0 policy index: ${move}`);
    return index;
}

export function sampleIndices(sample) {
    const fen = sample.history[0], black = fen.split(' ')[1] === 'b';
    const board = fen.split(' ')[0].replace(/[1-8]/g, count => '.'.repeat(Number(count))).replaceAll('/', '');
    const index = move => {
        const from = (8 - Number(move[1])) * 8 + move.charCodeAt(0) - 97;
        const castle = board[from]?.toLowerCase() === 'k' && Math.abs(move.charCodeAt(0) - move.charCodeAt(2)) === 2;
        return moveIndex(move, black, castle);
    };
    const legal = sample.legalMoves.map(index), target = legal.indexOf(index(sample.move));
    if(target < 0 || new Set(legal).size !== legal.length) throw new Error('Training target is missing or legal policy indices are duplicated.');
    return { legal, target };
}

export function encodePlanes(history, repetitions = []) {
    if(!Array.isArray(history) || history.length < 1 || history.length > 8)
        throw new Error('Expected one to eight current-first FEN positions.');
    const planes = new Float32Array(112 * 64);
    const current = history[0].split(' '), black = current[1] === 'b';
    for(let step = 0; step < history.length; step++) {
        const fen = history[step].split(' ');
        let boardIndex = 0;
        for(const char of fen[0]) {
            if(char === '/') continue;
            if(/[1-8]/.test(char)) { boardIndex += Number(char); continue; }
            const kind = 'pnbrqk'.indexOf(char.toLowerCase());
            if(kind < 0 || boardIndex >= 64) throw new Error('Invalid training FEN.');
            const white = char === char.toUpperCase();
            const plane = step * 13 + kind + (white !== black ? 0 : 6);
            const rank = 7 - (boardIndex >> 3), file = boardIndex % 8;
            const oriented = (black ? 7 - rank : rank) * 8 + file;
            planes[plane * 64 + oriented] = 1;
            boardIndex++;
        }
        if(boardIndex !== 64) throw new Error('Invalid training FEN board size.');
        if(repetitions[step]) planes.fill(1, (step * 13 + 12) * 64, (step * 13 + 13) * 64);
    }
    const castling = black ? ['q', 'k', 'Q', 'K'] : ['Q', 'K', 'q', 'k'];
    castling.forEach((right, i) => { if(current[2].includes(right)) planes.fill(1, (104 + i) * 64, (105 + i) * 64); });
    if(black) planes.fill(1, 108 * 64, 109 * 64);
    const clock = Number(current[4]);
    if(!Number.isFinite(clock) || clock < 0) throw new Error('Invalid FEN halfmove clock.');
    planes.fill(clock, 109 * 64, 110 * 64);
    planes.fill(1, 111 * 64);
    return planes;
}
