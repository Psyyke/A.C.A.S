// Answers the board questions Inkling asks itself mid-thought ("From d6, queen attacks b8?", "Is a6 defended?").

export const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export const SIDE = { w: 'White', b: 'Black' };
const FILES = 'abcdefgh';
const TYPE = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };

export const sq = (f, r) => FILES[f] + (r + 1);
export const fr = s => [FILES.indexOf(s[0]), Number(s[1]) - 1];
export const allSquares = () => Array.from({ length: 64 }, (_, i) => sq(i % 8, Math.floor(i / 8)));
export function attacksFrom(chess, from) {
    const piece = chess.get(from); if(!piece) return [];
    const [f, r] = fr(from), out = [];
    const on = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8;
    const step = deltas => deltas.forEach(([dx, dy]) => on(f + dx, r + dy) && out.push(sq(f + dx, r + dy)));
    const slide = deltas => deltas.forEach(([dx, dy]) => {
        for(let x = f + dx, y = r + dy; on(x, y); x += dx, y += dy) { out.push(sq(x, y)); if(chess.get(sq(x, y))) break; }
    });
    const diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]], line = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    if(piece.type === 'p') step(piece.color === 'w' ? [[1, 1], [-1, 1]] : [[1, -1], [-1, -1]]);
    if(piece.type === 'n') step([[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]);
    if(piece.type === 'k') step([...diag, ...line]);
    if(piece.type === 'b' || piece.type === 'q') slide(diag);
    if(piece.type === 'r' || piece.type === 'q') slide(line);
    return out;
}
export const attackersOf = (chess, target, color) => allSquares().filter(s => chess.get(s)?.color === color && attacksFrom(chess, s).includes(target));
export const andList = items => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
const who = (chess, s) => { const p = chess.get(s); return `${SIDE[p.color]}'s ${NAMES[p.type]} on ${s}`; };
const short = (chess, s) => { const p = chess.get(s); return `${NAMES[p.type]} ${s}`; };

export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
// A pinned piece shields a king, or something worth more than the pinning piece.
export function pinOf(chess, s) {
    const piece = chess.get(s); if(!piece) return null;
    for(const from of allSquares()) {
        const enemy = chess.get(from);
        if(!enemy || enemy.color === piece.color || !'brq'.includes(enemy.type) || !attacksFrom(chess, from).includes(s)) continue;
        const [fx, fy] = fr(from), [tx, ty] = fr(s), dx = Math.sign(tx - fx), dy = Math.sign(ty - fy);
        for(let x = tx + dx, y = ty + dy; x >= 0 && x < 8 && y >= 0 && y < 8; x += dx, y += dy) {
            const behind = chess.get(sq(x, y));
            if(!behind) continue;
            if(behind.color === piece.color && VALUE[behind.type] > VALUE[enemy.type] && VALUE[behind.type] > VALUE[piece.type]) return `pinned by ${who(chess, from)} to the ${NAMES[behind.type]} on ${sq(x, y)}`;
            break;
        }
    }
    return null;
}

// Finds the piece the question is about: "queen d6", "queen on d6", "f4 pawn", "from d6, queen", or a unique "the queen".
// The earliest mention wins, later ones are usually targets.
function subject(chess, text) {
    const forms = [
        [/\b(pawn|knight|bishop|rook|queen|king)\s+(?:on\s+|from\s+|at\s+)?([a-h][1-8])\b/i, 1, 2],
        [/\b([a-h][1-8])\s+(pawn|knight|bishop|rook|queen|king)\b/i, 2, 1],
        [/\bfrom\s+([a-h][1-8]),?\s+(?:the\s+)?(pawn|knight|bishop|rook|queen|king)\b/i, 2, 1]
    ].map(([re, t, s]) => { const m = text.match(re); return m && { index: m.index, type: TYPE[m[t].toLowerCase()], square: m[s] }; }).filter(Boolean);
    if(forms.length) { const first = forms.sort((a, b) => a.index - b.index)[0]; return { type: first.type, square: first.square }; }
    const only = text.match(/\b(?:the\s+|my\s+|your\s+|white\s+|black\s+)?(knight|bishop|rook|queen|king)\b/i);
    if(!only) return null;
    const type = TYPE[only[1].toLowerCase()];
    const color = /\bwhite\b/i.test(text) ? 'w' : /\bblack\b/i.test(text) ? 'b' : null;
    const hits = allSquares().filter(s => chess.get(s)?.type === type && (!color || chess.get(s).color === color));
    return hits.length === 1 ? { type, square: hits[0] } : null;
}

// boards: [{ label, chess }], most specific first. Returns { text } or null.
export function answerQuestion(question, boards) {
    const q = question.replace(/\s+/g, ' ').trim();
    if(q.length < 6) return null;
    // Hypothetical moves are the move spotter's job, answering them against a fixed board misleads.
    if(/\b(would|will)\b|\b[KQRBN]x?[a-h][1-8]\b|\b[a-h]x[a-h][1-8]\b|\b(to|onto|into)\s+[a-h][1-8]\b|[a-h][1-8]-[a-h][1-8]/i.test(q)) return null;

    if(/\bin check\b/i.test(q)) {
        const board = boards[0];
        return { text: `${board.label}: ${board.chess.in_check() ? `yes, ${SIDE[board.chess.turn()]} is in check` : 'nobody is in check'}.` };
    }

    const status = q.match(/\b(defended|protected|guarded|attacked|pinned|safe|hanging|loose)\b/i);
    const target = [...new Set([...q.matchAll(/\b([a-h][1-8])\b/g)].map(m => m[1]))];
    const verb = q.match(/\b(attacks?|hits?|eyes?|sees?|takes?|captures?|guards?|defends?|protects?|reach(?:es)?)\b/i);
    // When both boards fit, the one where the other mentioned squares are occupied is the one the model is picturing.
    const occupied = b => target.filter(t => b.chess.get(t)).length;
    const found = boards.map(b => ({ b, s: subject(b.chess, q) })).filter(({ b, s }) => s && b.chess.get(s.square)?.type === s.type)
        .sort((x, y) => occupied(y.b) - occupied(x.b))[0];
    const sub = found?.s;

    // A named piece that is not there on any board we know is a misidentification worth fixing, an empty square is just a hypothetical.
    if(!found) {
        const guess = subject(boards[0].chess, q);
        if(guess && boards.every(b => b.chess.get(guess.square) && b.chess.get(guess.square).type !== guess.type))
            return { text: `${boards[0].label}: there is no ${NAMES[guess.type]} on ${guess.square}, that square holds ${who(boards[0].chess, guess.square)}.` };
        // "Rook b1 is defended?" about a board we are not tracking. Answering about another square would mislead.
        if(guess && boards.every(b => !b.chess.get(guess.square))) return null;
    }

    if(status && !(verb && sub && target.some(t => t !== sub.square))) {
        // "b7 is attacked by bishop d5?" and "is b7 pinned to rook a8?" are about the first square named before the status word.
        const lead = target.find(t => q.search(new RegExp(`\\b${t}\\b`)) < status.index && boards.some(b => b.chess.get(t)));
        const sqr = lead || sub?.square || target.find(t => boards.some(b => b.chess.get(t)));
        if(!sqr) return null;
        const board = (found && found.s.square === sqr && found.b) || boards.find(b => b.chess.get(sqr));
        const piece = board.chess.get(sqr);
        if(!piece) return null;
        const opp = piece.color === 'w' ? 'b' : 'w';
        const att = attackersOf(board.chess, sqr, opp).map(s => short(board.chess, s));
        const def = attackersOf(board.chess, sqr, piece.color).map(s => short(board.chess, s));
        const pin = pinOf(board.chess, sqr);
        return { text: `${board.label}: ${who(board.chess, sqr)} is attacked by ${att.length ? andList(att) : 'nothing'} and defended by ${def.length ? andList(def) : 'nothing'}${pin ? `, and it is ${pin}` : /pinned/i.test(status[1]) ? ', and it is not pinned' : ''}.` };
    }

    // "It attacks White knight f3?" names the target, not the attacker.
    if(verb && sub && (verb.index < q.search(new RegExp(`\\b${sub.square}\\b`)) || /\bit\b/i.test(q.slice(0, verb.index))) && !/^\s*(does|can|is)\b(?!\s+it)/i.test(q)) return null;

    if(verb && sub) {
        const chess = found.b.chess, me = chess.get(sub.square), label = found.b.label;
        const seen = attacksFrom(chess, sub.square);
        const others = target.filter(t => t !== sub.square);
        if(others.length) {
            const yes = others.filter(t => seen.includes(t)), no = others.filter(t => !seen.includes(t));
            const name = t => chess.get(t) ? `${short(chess, t)}` : t;
            if(!no.length) return { text: `${label}: yes, ${who(chess, sub.square)} reaches ${yes.length > 3 ? 'all of those squares' : andList(yes.map(name))}.` };
            const parts = [];
            // A target hidden behind one the piece hits is an x-ray (pin or skewer), worth saying plainly.
            const behind = no.filter(t => chess.get(t) && yes.some(y => attacksFrom({ get: s => s === y ? null : chess.get(s) }, sub.square).includes(t)));
            const missed = no.filter(t => !behind.includes(t));
            if(yes.length) parts.push(`it does reach ${andList(yes.map(name))}${behind.length ? `, with ${andList(behind.map(name))} lined up behind` : ''}`);
            if(missed.length) parts.push(`it does not reach ${andList(missed.map(name))}`);
            return { text: `${label}: ${who(chess, sub.square)}, ${parts.join(', but ')}.` };
        }
        const enemies = seen.filter(t => chess.get(t) && chess.get(t).color !== me.color).map(t => short(chess, t));
        const friends = seen.filter(t => chess.get(t) && chess.get(t).color === me.color).map(t => short(chess, t));
        return { text: `${label}: ${who(chess, sub.square)} attacks ${enemies.length ? andList(enemies) : 'no enemy piece'} and guards ${friends.length ? andList(friends) : 'nothing'}.` };
    }
    return null;
}
