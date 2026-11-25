import { Chess, SQUARES } from '../libraries/chessjs/chess.js';
import CaptureExchange from '../../js/misc/captureExchange.js';
import { CommentaryStream } from './commentary.js';
import { moveFacts } from './position.js';
import { moveRationale } from './coaching.js';

// Pena was trained on one fixed prompt, so free-form question text barely changes its answer.
// Questions are understood here and turned into the position Pena should actually analyze.

const PIECES = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', horse: 'n', pawn: 'p' };
const NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const colorName = color => color === 'w' ? 'White' : 'Black';
const other = color => color === 'w' ? 'b' : 'w';
const intentCue = /\b(?:play(?:ing|ed)?|move|go(?:es|ing)?|push|what if|what about|how about|why not|instead|can (?:i|we|he|she|they)|could (?:i|we)|should (?:i|we)|is (?:it|that|this)?\s*(?:good|bad|ok(?:ay)?|fine|possible|playable|legal|safe|sound|better|worse|a (?:good|bad) (?:idea|move)|a mistake|a blunder)|take|capture|try|thinking of|considering|planning|why|good|bad|better|worse|best|mistake|blunder|work|threat\w*|reply|respond)\b/i;

function board(fen) {
    const chess = new Chess();
    if(!chess.load(fen)) throw new Error('Pena needs a valid position to answer questions.');
    return chess;
}

export function flipTurn(fen) {
    const chess = board(fen);
    if(chess.in_check()) return null;
    const fields = fen.split(' ');
    fields[1] = other(fields[1]);
    fields[3] = '-';
    const flipped = new Chess();
    return flipped.load(fields.join(' ')) ? flipped.fen() : null;
}

function specs(question) {
    const found = [];
    const covered = [];
    const add = (match, spec, start = match.index, end = match.index + match[0].length) => {
        if(covered.some(([a, b]) => start < b && end > a)) return;
        covered.push([start, end]);
        found.push({ ...spec, index: start, text: match[0].trim() });
    };
    for(const match of question.matchAll(/\b(short|long|king[ -]?side|queen[ -]?side)\s+castl\w*/gi)) {
        add(match, { castle: /long|queen/i.test(match[1]) ? 'q' : 'k' });
    }
    for(const match of question.matchAll(/\b(?:castl(?:e|es|ing)|o-o(?:-o)?|0-0(?:-0)?)(?:\s+(?:on\s+the\s+)?(king|queen)[ -]?side|\s+(short|long))?/gi)) {
        const long = /o-o-o|0-0-0/i.test(match[0]) || /queen|long/i.test(match[1] || match[2] || '');
        const short = /^(?:o-o|0-0)$/i.test(match[0]) || /king|short/i.test(match[1] || match[2] || '');
        add(match, { castle: long ? 'q' : short ? 'k' : null });
    }
    for(const match of question.matchAll(/\b(?:take|takes|taking|capture|captures|capturing|grab|grabs|eat|eats)\s+(?:on\s+|at\s+)?(?:the\s+\w+\s+(?:on|at)\s+)?([a-h][1-8])\s+with\s+(?:the\s+|my\s+|a\s+)?(?:([a-h])[- ]?pawn|(king|queen|rook|bishop|knight|horse|pawn))(?:\s+(?:on|from)\s+([a-h][1-8]))?/gi)) {
        add(match, { piece: match[2] ? 'p' : PIECES[match[3].toLowerCase()], file: match[2]?.toLowerCase(),
            from: match[4]?.toLowerCase(), capture: true, to: match[1].toLowerCase() });
    }
    for(const match of question.matchAll(/\b(?:take|takes|taking|capture|captures|capturing|grab|grabs|eat|eats)\s+(?:(?:the|that|his|her|their)\s+(?:\w+\s+)?)?(?:on|at)\s+([a-h][1-8])\b/gi)) {
        add(match, { capture: true, to: match[1].toLowerCase() });
    }
    const natural = /\b(?:(?:my|the|your|his|her|their|a|an|white|black|white's|black's)\s+)?(?:([a-h])[- ]?pawn|(king|queen|rook|bishop|knight|horse|pawn))(?:\s+(?:on|from|at|in)\s+([a-h][1-8])|\s+([a-h][1-8]))?(?:\s*(?:->|-)\s*|\s+(?:(?:to|goes to|moves? to|go to|onto|into|over to|up to|down to)\s+)|\s+(takes|captures|x|grabs|eats|wins)(?:\s+(?:on|at))?\s+(?:the\s+(?:\w+\s+)?(?:on|at)\s+)?)([a-h][1-8])\b/gi;
    for(const match of question.matchAll(natural)) {
        add(match, { piece: match[1] ? 'p' : PIECES[match[2].toLowerCase()], file: match[1]?.toLowerCase(),
            from: (match[3] || match[4])?.toLowerCase(), capture: Boolean(match[5]), to: match[6].toLowerCase() });
    }
    for(const match of question.matchAll(/\b(king|queen|rook|bishop|knight|horse)\s+([a-h][1-8])\b/gi)) {
        add(match, { piece: PIECES[match[1].toLowerCase()], to: match[2].toLowerCase(), loose: true });
    }
    for(const match of question.matchAll(/(?<![A-Za-z0-9])([KQRBNP])?([a-h][1-8])[-x]?([a-h][1-8])(?:=?([QRBNqrbn]))?[+#]?(?![A-Za-z0-9])/g)) {
        add(match, { piece: match[1]?.toLowerCase(), from: match[2], to: match[3], promotion: match[4]?.toLowerCase() });
    }
    for(const match of question.matchAll(/(?<![A-Za-z0-9])([KQRBNkqrnb])([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([QRBNqrbn]))?[+#]?(?![A-Za-z0-9])/g)) {
        const letter = match[1];
        const pieceSpec = { piece: letter.toLowerCase(), file: match[2], rank: match[3], capture: Boolean(match[4]), to: match[5] };
        // A lowercase b can be a b-pawn capture (bxc3) or a bishop (bf4), so both readings are tried.
        if(letter === 'b') add(match, { alternatives: [
            ...(match[4] && !match[2] && !match[3] ? [{ piece: 'p', file: 'b', capture: true, to: match[5], promotion: match[6]?.toLowerCase() }] : []),
            pieceSpec] });
        else add(match, pieceSpec);
    }
    for(const match of question.matchAll(/(?<![A-Za-z0-9])([a-h])x([a-h][1-8])(?:=?([QRBNqrbn]))?[+#]?(?![A-Za-z0-9])/g)) {
        add(match, { piece: 'p', file: match[1], capture: true, to: match[2], promotion: match[3]?.toLowerCase() });
    }
    for(const match of question.matchAll(/(?<![A-Za-z0-9-])([a-h][1-8])(?:=?([QRBN]))?[+#]?(?![A-Za-z0-9-])/g)) {
        const before = question.slice(0, match.index);
        if(/\b(?:on|at|from|in|around|near|towards?|against|square|the)\s+$/i.test(before)) continue;
        if(/^\s*(?:square|pawn|knight|bishop|rook|queen|king|file|rank|diagonal)/i.test(question.slice(match.index + match[0].length))) continue;
        add(match, { to: match[1], promotion: match[2]?.toLowerCase(), bare: true });
    }
    return found.sort((a, b) => a.index - b.index);
}

function matching(moves, spec) {
    return moves.filter(move => {
        if('castle' in spec) return /[kq]/.test(move.flags) && (!spec.castle || move.flags.includes(spec.castle));
        return (!spec.to || move.to === spec.to) && (!spec.from || move.from === spec.from)
            && (!spec.piece || move.piece === spec.piece) && (!spec.file || move.from[0] === spec.file)
            && (!spec.rank || move.from[1] === spec.rank) && (!spec.capture || move.captured)
            && (!spec.promotion || move.promotion === spec.promotion);
    });
}

function resolve(spec, fen) {
    const moves = board(fen).moves({ verbose: true });
    for(const variant of spec.alternatives || [spec]) {
        let found = matching(moves, variant);
        // "Takes f6" on an empty square still names the move the player means.
        if(!found.length && variant.capture) found = matching(moves, { ...variant, capture: false });
        if(variant.bare && found.length > 1) {
            const pawns = found.filter(move => move.piece === 'p');
            if(pawns.length) found = pawns;
        }
        if(found.length > 1 && found.every(move => move.promotion)) found = found.filter(move => move.promotion === 'q');
        if(found.length) return found;
    }
    return [];
}

function illegalReason(spec, fen) {
    const chess = board(fen);
    const side = chess.turn();
    const variant = spec.alternatives?.at(-1) || spec;
    if('castle' in variant) {
        const rights = fen.split(' ')[2];
        const wanted = variant.castle ? [variant.castle] : ['k', 'q'];
        const has = wanted.some(right => rights.includes(side === 'w' ? right.toUpperCase() : right));
        const label = variant.castle === 'q' ? 'queenside' : variant.castle === 'k' ? 'kingside' : '';
        if(!has) return `${colorName(side)} can't castle${label ? ' ' + label : ''} anymore because the king or that rook has already moved.`;
        if(chess.in_check()) return `${colorName(side)} can't castle while the king is in check.`;
        return `${colorName(side)} can't castle${label ? ' ' + label : ''} yet. A piece is still in the way or the king would pass through an attacked square.`;
    }
    const type = variant.piece;
    const pieces = chess.board().flat().filter(piece => piece && piece.color === side && (!type || piece.type === type)
        && (!variant.file || piece.square[0] === variant.file));
    const name = type ? NAMES[type] : 'piece';
    if(variant.from) {
        const piece = chess.get(variant.from);
        if(!piece || piece.color !== side) return `There is no ${colorName(side).toLowerCase()} ${name} on ${variant.from}.`;
        return `The ${NAMES[piece.type]} on ${variant.from} can't go to ${variant.to}${blocker(chess, variant.from, variant.to)}.`;
    }
    if(!pieces.length) return type ? `${colorName(side)} has no ${name} that could do that.` : `That move isn't legal here.`;
    if(pieces.length === 1 && type) return `The ${name} on ${pieces[0].square} can't go to ${variant.to}${blocker(chess, pieces[0].square, variant.to)}.`;
    if(!type && variant.bare) return `No ${colorName(side).toLowerCase()} piece can move to ${variant.to} right now.`;
    return `None of ${colorName(side)}'s ${name}s can reach ${variant.to} in one move.`;
}

function blocker(chess, from, to) {
    const target = chess.get(to);
    const piece = chess.get(from);
    if(target?.color === piece.color) return ` because ${to} is taken by its own ${NAMES[target.type]}`;
    const index = square => (8 - Number(square[1])) * 8 + square.charCodeAt(0) - 97;
    const exchange = new CaptureExchange(chess.fen());
    const reaches = piece.type === 'p' ? false : exchange.attackersTo(index(to), piece.color).includes(index(from));
    const enemy = colorName(other(piece.color));
    if(reaches && piece.type === 'k') return ` because ${enemy} covers ${to}, so the king would walk into check`;
    if(reaches && chess.in_check()) return ` because the king is in check and that move doesn't fix it`;
    if(reaches) return ` because it is pinned. Moving it would expose the king`;
    return ' in one move';
}

function readSpec(spec, order, fen, intent) {
    if((spec.bare || spec.loose) && !intent) return null;
    // "Bishop e2" usually names the piece standing there, not a move to it.
    if(spec.loose && board(fen).get(spec.to)?.type === spec.piece) return null;
    for(const [positionFen, opponent] of order) {
        if(!positionFen) continue;
        const moves = resolve(spec, positionFen);
        if(moves.length === 1) return { status: 'move', move: moves[0], fen: positionFen, opponent, spec };
        if(moves.length > 1) return { status: 'ambiguous', moves, fen: positionFen, opponent, spec };
    }
    return null;
}

function questionOrder(question, fen) {
    const flipped = flipTurn(fen);
    const turn = board(fen).turn();
    const named = question.match(/\b(white|black)(?:'s)?\s+(?:plays?|moves?|goes|could|can|would|might|pushes|takes|answers|replies|responds)\b/i)?.[1];
    const theirs = named ? named[0].toLowerCase() !== turn
        : /\b(?:they|he|she|opponent|enemy|them|him|threat\w*|reply|respond\w*|answer)\b/i.test(question)
            && !/\b(?:I|me|my|we)\b/.test(question);
    return theirs ? [[flipped, true], [fen, false]] : [[fen, false], [flipped, true]];
}

const hasIntent = question => intentCue.test(question) || question.replace(/[?!.\s]/g, '').length <= 8;

export function parseQuestionMove(question, fen) {
    const found = specs(question);
    if(!found.length) return { status: 'none' };
    const intent = hasIntent(question);
    const order = questionOrder(question, fen);
    for(const spec of found) {
        const read = readSpec(spec, order, fen, intent);
        if(read) return read;
    }
    const spec = found.find(spec => !spec.bare && !spec.loose) || (intent && found[0]);
    return spec ? { status: 'illegal', spec, reason: illegalReason(spec, fen) } : { status: 'none' };
}

// Every distinct legal move a message names, in order, so "d6 or Nc6?" compares both.
export function parseQuestionMoves(question, fen, limit = 3) {
    const found = specs(question);
    const intent = hasIntent(question) || /\bor\b|\bvs\.?\b|\bversus\b|\binstead\b|\bbetter\b/i.test(question);
    const order = questionOrder(question, fen);
    const moves = [];
    for(const spec of found) {
        const read = readSpec(spec, order, fen, intent);
        if(read?.status !== 'move' || moves.some(item => item.move.san === read.move.san && item.fen === read.fen)) continue;
        moves.push(read);
        if(moves.length >= limit) break;
    }
    return moves;
}

const TOPICS = [
    ['hanging', /\b(?:hanging|en prise|undefended|unprotected|loose (?:pieces?|pawns?)|(?:pieces?|anything) (?:under attack|attacked|in danger))\b/i],
    ['threat', /\b(?:threat\w*|danger\w*|what (?:is|does|did|are|will) (?:my |the )?(?:opponent|enemy|he|she|they|white|black|him|them)\b[^?]*\b(?:want|plan\w*|doing|trying|going|threaten\w*|up to|idea)|what(?:'s| is) (?:white|black|the opponent|my opponent) (?:planning|threatening|up to|trying)|what (?:should|would|can|could|will) (?:white|black|he|she|they|my opponent|the opponent) (?:do|play)|why did (?:he|she|they|the opponent|white|black) play)\b/i],
    ['king', /\b(?:king safety|(?:my|the|white's|black's) king\b|castl\w*|is (?:my|the) king safe|mate|checkmat\w*|attack(?:ed|ing)? (?:my )?king)\b/i],
    ['evaluation', /\b(?:winning|losing|who(?:'s| is) (?:better|winning)|am i (?:better|worse|ok|okay|lost)|how (?:am i|are we) doing|how (?:bad|good) is (?:it|this|my position)|is (?:this|it|my position)(?: position)? (?:good|bad|ok|okay|fine)|(?:good|bad) for me|eval\w*|advantage|equal|ahead|behind|(?<!win )material|score)\b/i],
    ['pawns', /\b(?:pawn structure|pawns?\b|passed pawn|weak(?:ness|nesses)?|isolated|doubled|backward)\b/i],
    ['pieces', /\b(?:(?:my|the|white's|black's) (?:knight|bishop|rook|queen|pieces?)s?|worst piece|which piece|improve (?:my )?pieces?|activate)\b/i],
    ['plan', /\b(?:plan|idea|strategy|what (?:now|next)|what (?:should|can|could|do|would) (?:i|we|you|white|black) (?:do|play)|what (?:to|do i) play|(?:what|which) move|how (?:do|should|can) (?:i|we) (?:continue|proceed|improve|attack|win|play)|best (?:move|thing|plan|option|continuation|choice|way)|good moves?|any (?:good )?(?:moves|ideas|suggestions)|hint|suggest\w*|recommend\w*|help|your (?:move|pick|choice)|tactic\w*|combination|win material|what(?:'s| is) good here)\b/i],
    ['describe', /\b(?:explain|describe|what(?:'s| is) (?:going on|happening)|tell me about|summar\w*|overview|what kind of position)\b/i],
    ['why', /\bwhy\b/i]
];

// Topics that ask Pena what to do, so the answer leads with Pena's move.
const MOVE_TOPICS = new Set(['plan', 'general', 'why', 'describe']);

const topicWords = {
    king: /\b(?:king(?!'s (?:knight|bishop|rook|pawn))|castl\w*|mate|check\w*|shelter|expos\w*|safe\w*)\b/i,
    evaluation: /\b(?:winning|lost|losing|advantage|better|worse|equal\w*|material|decisive\w*|up|down|edge|deficit)\b/i,
    pawns: /\bpawns?\b/i,
    pieces: /\b(?:knight|bishop|rook|queen(?!'s (?:pawn|gambit))|piece|activ\w*|develop\w*)s?\b/i,
    describe: /./,
    threat: /\b(?:threat\w*|attack\w*|win\w*|pressure|target\w*)\b/i
};

export function understandQuestion(question, fen, { bestMove = null } = {}) {
    const text = String(question || '').trim();
    if(!text) throw new Error('Ask a question about this position.');
    const parsed = parseQuestionMove(text, fen);
    const topic = TOPICS.find(([, pattern]) => pattern.test(text))?.[0] || 'general';
    const side = board(fen).turn();
    if(parsed.status === 'illegal') return { kind: 'answer', topic, text: parsed.reason, fen, spec: parsed.spec };
    if(parsed.status === 'ambiguous') {
        const choices = parsed.moves.map(move => /[kq]/.test(move.flags) ? (move.flags.includes('k') ? 'kingside' : 'queenside')
            : `the ${NAMES[move.piece]} on ${move.from}`);
        return { kind: 'answer', topic, fen, moves: parsed.moves, text: `Which one do you mean? ${colorName(parsed.moves[0].color)} could play `
            + `${parsed.moves.map(move => move.san).join(' or ')}, ${/side$/.test(choices[0]) ? 'castling' : 'with'} ${choices.join(' or ')}.` };
    }
    if(parsed.status === 'move')
        return moveIntent(parsed.fen, parsed.move, { topic, opponent: parsed.opponent, bestMove });
    if(topic === 'hanging') {
        const flipped = flipTurn(fen);
        return flipped ? { kind: 'threat', topic, fen, analysisFen: flipped, mover: other(side) }
            : { kind: 'answer', topic, fen, text: `${hangingSentence(fen)} ${colorName(side)} is in check, so the king comes first.` };
    }
    if(topic === 'threat') {
        const named = text.match(/\b(white|black)\b/i)?.[1];
        // "What does White want?" with White to move asks for White's own plan.
        if(named && named[0].toLowerCase() === side) return { kind: 'position', topic: 'plan', fen, analysisFen: fen, mover: side };
        const flipped = flipTurn(fen);
        if(flipped) return { kind: 'threat', topic, fen, analysisFen: flipped, mover: other(side) };
        return { kind: 'answer', topic, fen, text: `${colorName(side)} is in check, so the first job is getting the king out of it.` };
    }
    return { kind: 'position', topic, fen, analysisFen: fen, mover: side };
}

function material(fen) {
    const totals = { w: 0, b: 0 };
    for(const piece of board(fen).board().flat()) if(piece) totals[piece.color] += VALUES[piece.type];
    return totals;
}

function materialSentence(fen) {
    const { w, b } = material(fen);
    const counts = { w: {}, b: {} };
    for(const piece of board(fen).board().flat()) if(piece) counts[piece.color][piece.type] = (counts[piece.color][piece.type] || 0) + 1;
    const extras = color => ['q', 'r', 'b', 'n', 'p'].map(type => {
        const extra = (counts[color][type] || 0) - (counts[other(color)][type] || 0);
        return extra === 1 ? `an extra ${NAMES[type]}` : extra > 1 ? `${extra} extra ${NAMES[type]}s` : null;
    }).filter(Boolean).join(' and ');
    const imbalance = ['w', 'b'].filter(color => extras(color)).map(color => `${colorName(color)} has ${extras(color)}`).join(' and ');
    if(w === b) return imbalance ? `Material is level in points. ${imbalance}.` : 'Material is level.';
    const difference = Math.abs(w - b);
    return `${w > b ? 'White' : 'Black'} is ahead by ${difference} point${difference === 1 ? '' : 's'} of material. ${imbalance}.`;
}

function kingSentence(fen, color) {
    const chess = board(fen);
    const king = chess.board().flat().find(piece => piece?.type === 'k' && piece.color === color);
    const file = king.square.charCodeAt(0) - 97, rank = Number(king.square[1]);
    const forward = color === 'w' ? 1 : -1;
    let shield = 0;
    for(let offset = -1; offset <= 1; offset++) {
        for(const step of [1, 2]) {
            const square = String.fromCharCode(97 + file + offset) + (rank + step * forward);
            if(!/^[a-h][1-8]$/.test(square)) continue;
            const piece = chess.get(square);
            if(piece?.type === 'p' && piece.color === color) { shield++; break; }
        }
    }
    const exchange = new CaptureExchange(chess.fen());
    const index = square => (8 - Number(square[1])) * 8 + square.charCodeAt(0) - 97;
    let attacked = 0;
    for(let dr = -1; dr <= 1; dr++) for(let df = -1; df <= 1; df++) {
        const square = String.fromCharCode(97 + file + df) + (rank + dr);
        if(/^[a-h][1-8]$/.test(square) && exchange.attackersTo(index(square), other(color)).length) attacked++;
    }
    const castled = ['g', 'c', 'b', 'h'].includes(king.square[0]) && [1, 8].includes(rank);
    const parts = [`${colorName(color)}'s king on ${king.square}`];
    parts.push(shield >= 3 ? 'has a full pawn shield' : shield === 2 ? 'has two shield pawns' : shield === 1 ? 'has only one pawn in front of it' : 'has no pawn cover');
    const where = castled ? '' : ['d', 'e'].includes(king.square[0]) && [1, 8].includes(rank) ? ' and is still in the center' : '';
    const pressure = attacked ? `, and ${attacked === 1 ? 'one square' : `${attacked} squares`} around it ${attacked === 1 ? 'is' : 'are'} covered by enemy pieces` : ', and no enemy piece covers the squares around it';
    return `${parts.join(' ')}${where}${pressure}.`;
}

// The intent for one concrete move. `yours` frames it as a reaction to a move just played.
export function moveIntent(beforeFen, move, { topic = 'general', opponent = false, bestMove = null, yours = false } = {}) {
    const after = new Chess(beforeFen);
    const played = after.move(move);
    if(!played) return null;
    const uci = played.from + played.to + (played.promotion || '');
    return { kind: 'move', topic, fen: beforeFen, move: played, uci, opponent, yours, beforeFen,
        analysisFen: after.fen(), mover: played.color, best: !opponent && bestMove === uci,
        bestKnown: !opponent && Boolean(bestMove), bestMove };
}

// Finds the single legal move that leads from one position to the next, if there is one.
export function findPlayedMove(beforeFen, afterFen) {
    const placement = fen => fen.split(' ').slice(0, 2).join(' ');
    const chess = board(beforeFen);
    return chess.moves({ verbose: true }).find(move => {
        const next = new Chess(beforeFen);
        next.move(move);
        return placement(next.fen()) === placement(afterFen);
    }) || null;
}

function moveLead(intent, { checkedCoaching = false } = {}) {
    const { move } = intent;
    if(checkedCoaching || intent.yours && !intent.bestKnown) {
        const reason = moveRationale(intent.beforeFen, intent.uci);
        const explanation = reason ? `${move.san}, ${reason}.` : '';
        return intent.opponent ? [`That would be ${colorName(move.color)}'s move.`, explanation].filter(Boolean).join(' ') : explanation;
    }
    const facts = moveFacts(intent.beforeFen, intent.uci).effects.map(effect => effect.replace(/^It /, '').replace(/\.$/, ''));
    const what = facts.length ? ` ${facts.join(' and ')}` : '';
    const name = intent.yours ? `Your ${move.san}` : move.san;
    const parts = [];
    let best = null;
    if(!checkedCoaching && !intent.opponent && intent.bestKnown && !intent.best)
        best = new Chess(intent.beforeFen).move({ from: intent.bestMove.slice(0, 2), to: intent.bestMove.slice(2, 4), promotion: intent.bestMove[4] });
    if(intent.opponent) parts.push(`That would be ${colorName(move.color)}'s move. ${move.san}${what || ' is one of its options'}.`);
    else if(!checkedCoaching && intent.best) parts.push(intent.yours ? `Nice, ${move.san} was Pena's pick too.` : `${move.san} is Pena's pick too.${what ? ` It${what}.` : ''}`);
    else if(best) parts.push(`${name}${what && !intent.yours ? what + ',' : ' is possible,'} but Pena ${intent.yours ? 'preferred' : 'would rather play'} ${best.san}.`);
    else if(what) parts.push(`${name}${what}.`);
    // A material-only exchange calculation cannot judge compensation for a sacrifice.
    const after = new Chess(intent.analysisFen);
    if(after.in_checkmate()) return parts.join(' ');
    const exchange = new CaptureExchange(after.fen());
    const loss = exchange.captureLoss(move.to);
    const value = VALUES[move.promotion || move.piece];
    // Pena's own pick may be a deliberate sacrifice, so only warn about other moves.
    if(!intent.best && loss >= 1) parts.push(loss >= value
        ? `Careful, the ${NAMES[move.promotion || move.piece]} on ${move.to} can simply be taken.`
        : `Careful, after the trades on ${move.to} ${colorName(move.color)} comes out ${loss === 1 ? 'a pawn' : `${loss} points`} down.`);
    else if(!intent.best) {
        const before = new CaptureExchange(intent.beforeFen.replace(/ [wb] /, ` ${other(move.color)} `));
        const hanging = after.board().flat().filter(piece => piece && piece.color === move.color && piece.type !== 'k'
            && piece.square !== move.to && exchange.captureLoss(piece.square) >= Math.min(3, VALUES[piece.type]))
            .sort((a, b) => VALUES[b.type] - VALUES[a.type])[0];
        if(hanging) parts.push(before.captureLoss(hanging.square) >= 1
            ? `It doesn't deal with the ${NAMES[hanging.type]} on ${hanging.square}, which is still hanging.`
            : `It leaves the ${NAMES[hanging.type]} on ${hanging.square} hanging.`);
    }
    return parts.join(' ');
}

// Pieces that can be won outright right now, the side to move first.
function hangingSentence(fen, { checkedCoaching = false } = {}) {
    const chess = board(fen);
    const side = chess.turn();
    const exchange = new CaptureExchange(fen);
    const loose = color => chess.board().flat()
        .filter(piece => piece && piece.color === color && piece.type !== 'k')
        .map(piece => ({ ...piece, loss: exchange.captureLoss(piece.square) || 0 }))
        .filter(piece => piece.loss >= 1)
        .sort((a, b) => b.loss - a.loss);
    const describe = (pieces, color) => pieces.slice(0, 2).map(piece => `the ${NAMES[piece.type]} on ${piece.square}`).join(' and ');
    const mine = loose(side), theirs = loose(other(side));
    if(checkedCoaching) {
        const parts = [mine.length
            ? `${colorName(side)}'s ${describe(mine).replace(/^the /, '')} ${mine.length > 1 ? 'are' : 'is'} under attack.`
            : 'Nothing stands out in the immediate exchange check.'];
        if(theirs.length) parts.push(`${colorName(other(side))}'s ${describe(theirs).replace(/^the /, '')} ${theirs.length > 1 ? 'are' : 'is'} under attack too.`);
        if(mine.length || theirs.length) parts.push('Taking an attacked piece is not always safe, so check the replies.');
        return parts.join(' ');
    }
    const parts = [mine.length
        ? `${colorName(side)} has something loose: ${describe(mine)} can be won.`
        : `Nothing of ${colorName(side)}'s is hanging right now.`];
    if(theirs.length) parts.push(`${colorName(other(side))}'s ${describe(theirs).replace(/^the /, '')} ${theirs.length > 1 ? 'are' : 'is'} loose, so look at taking ${theirs.length > 1 ? 'them' : 'it'}.`);
    return parts.join(' ');
}

export function questionLead(intent, options = {}) {
    if(intent.kind === 'answer') return intent.text;
    if(intent.kind === 'move') return moveLead(intent, options);
    if(intent.topic === 'hanging') return `${hangingSentence(intent.fen, options)} Here's what ${colorName(intent.mover)} would like to do.`;
    if(intent.kind === 'threat') return `If it were ${colorName(intent.mover)}'s turn, here's the idea.`;
    if(intent.topic === 'evaluation') return materialSentence(intent.fen);
    if(intent.topic === 'king') {
        const chess = board(intent.fen);
        return kingSentence(intent.fen, chess.turn()) + ' ' + kingSentence(intent.fen, other(chess.turn()));
    }
    return '';
}

function nameSides(text, mover) {
    const me = colorName(mover), them = colorName(other(mover));
    return text
        .replace(/\b[Tt]he player's\b/g, `${me}'s`).replace(/\b[Tt]he player\b/g, me)
        .replace(/\b[Tt]he opponent's\b/g, `${them}'s`).replace(/\b[Tt]he opponent\b/g, them);
}

const replyStart = /^(?:\d+\.(?:\.\.)?\s*)?(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8]|O-O(?:-O)?|castle)/;
const playLead = text => !replyStart.test(text) ? text
    : /^castle\b/i.test(text) ? `I'd ${text[0].toLowerCase()}${text.slice(1)}` : `I'd play ${text}`;

// Shapes Pena's analysis of the chosen position into an answer for the question asked.
export class QuestionAnswer {
    constructor(intent, { previous = [], checkedCoaching = false } = {}) {
        this.intent = intent;
        this.checkedCoaching = checkedCoaching;
        this.lead = questionLead(intent, { checkedCoaching });
        // A move or threat question needs the one reply that answers it, not a long line.
        const mode = intent.kind === 'position' ? 'dynamic' : 'brief';
        this.stream = intent.analysisFen && new CommentaryStream({ fen: intent.analysisFen, mode, previous });
        if(this.stream && checkedCoaching && intent.kind === 'move' && !intent.opponent)
            this.stream.ownMove = intent;
    }

    update(raw, final = false, options = {}) {
        if(!this.stream) return { text: this.lead, assessments: [] };
        const { text, assessments } = this.stream.update(raw, final, options);
        let body = text;
        const focus = topicWords[this.intent.topic];
        if(this.intent.kind === 'position' && focus) {
            // Sentences inside a future line describe that line's board, not this one, so they can't stand alone.
            const rawNotation = /\b(?:white|black) (?:pawn|knight|bishop|rook|queen|king) [a-h][1-8]/i;
            const relevant = assessments.filter(item => item.status !== 'contradicted' && item.text && !item.contextual
                && !item.rejectedLine && (!item.omitted
                    || /^(?:Concise coaching budget|Prioritizing the recommendation and its explanation)\./.test(item.omitted))
                && (!this.checkedCoaching || this.stream.mainFound)
                && !item.unresolvedContinuation && !rawNotation.test(item.text) && focus.test(item.text));
            const main = assessments.find(item => item.shown && item.main);
            const picked = [...new Set([...relevant.slice(0, 3), ...(main && !relevant.includes(main) ? [main] : [])])];
            const say = item => item === main ? playLead(item.text) : item.text;
            body = picked.map(say).join(' ');
            if(this.checkedCoaching) {
                this.topicNotes ??= new Map();
                for(const item of picked) if(!this.topicNotes.has(item.index)) this.topicNotes.set(item.index, say(item));
                body = [...this.topicNotes.values()].join(' ');
            }
        }
        if(this.intent.kind === 'move' || this.intent.kind === 'threat') {
            const name = colorName(this.intent.kind === 'move' ? other(this.intent.mover) : this.intent.mover);
            const label = this.intent.kind === 'move'
                ? `After ${this.intent.move.san}, ${name}${this.checkedCoaching ? ' could reply with' : "'s best reply is"}`
                : `${name} would like to play`;
            body = body.split('\n\n').map((paragraph, index) => index === 0 && replyStart.test(paragraph)
                ? `${label} ${paragraph}` : paragraph).join(' ');
            if(this.intent.kind === 'move' && body && !body.startsWith(label))
                body = `After ${this.intent.move.san}, ${/^(?:White|Black|Pena)\b/.test(body) ? body : body[0].toLowerCase() + body.slice(1)}`;
        }
        body = nameSides(body, board(this.intent.analysisFen).turn()).replace(/\s*\n\n\s*/g, ' ').replace(/\b(\w+) \1\b/gi, '$1').trim();
        // "What should I do?" deserves a direct answer, not a sentence that starts with bare notation.
        if(this.intent.kind === 'position' && MOVE_TOPICS.has(this.intent.topic)) body = playLead(body);
        const lead = this.checkedCoaching && this.stream.ownMoveReview !== undefined
            ? this.stream.ownMoveFeedback : this.lead;
        const answer = [lead, body].filter(Boolean).join(' ');
        return { text: answer, assessments,
            presentation: { ...this.stream.presentation,
                emptyReason: answer ? null : this.stream.presentation.emptyReason || 'noRelevantAdvice' } };
    }
}

const misreadOwner = /\b(?:(his|her|their|enemy|opponent'?s?|the opponent'?s|black'?s|white'?s)|(my|our)|(the|that|this))\s+(queen|rook|bishop|knight|horse|pawn)s?\b(?:\s+(?:on|at|in)\s+([a-h][1-8]))?/gi;
const misreadVerb = /\b(?:take|takes|taking|capture|grab|win|winning|eat|trade|trap|hanging|attack|pin|fork|safe|protect|defend|save)\b/i;

/**
 * "Can I take his queen" with no queen left, "is my bishop on c4 safe" when it is on b3: the board says
 * otherwise. Returns one plain sentence for the chat notes, or '' when the message matches the board.
 */
export function boardMisread(message, fen, playerColor = null) {
    const text = String(message || '');
    if(!misreadVerb.test(text)) return '';
    const chess = board(fen);
    const player = playerColor || chess.turn();
    const where = (type, color) => SQUARES.filter(square => chess.get(square)?.type === type && chess.get(square).color === color);
    const describe = square => {
        const piece = chess.get(square);
        return !piece ? `${square} is empty` : `${square} holds ${piece.color === player ? 'your' : 'the opponent\'s'} ${NAMES[piece.type]}`;
    };
    for(const match of text.matchAll(misreadOwner)) {
        const [, theirs, mine, plain, word, square] = match;
        const type = PIECES[word.toLowerCase()];
        let color = theirs ? (/black/i.test(theirs) ? 'b' : /white/i.test(theirs) ? 'w' : other(player)) : mine ? player : null;
        if(!color) {
            const capture = /\b(?:take|takes|taking|capture|grab|win|winning|eat|trade|trap|hanging|pin|fork)\b/i.test(text);
            if(square && chess.get(square)?.type === type) continue;
            // "is the knight safe" could be either side's knight, only a piece nobody has is a misread then.
            if(!capture && !square) {
                if(!where(type, 'w').length && !where(type, 'b').length) return `neither side has a ${NAMES[type]} on the board`;
                continue;
            }
            color = capture ? other(player) : player;
        }
        const owner = color === player ? 'you have' : 'the opponent has';
        const plural = `${NAMES[type]}s`;
        const found = where(type, color);
        if(!found.length) return `${owner} no ${NAMES[type]} on the board`;
        if(square && !found.includes(square)) {
            const listed = found.length === 1 ? `${color === player ? 'your' : 'their'} ${NAMES[type]} is on ${found[0]}`
                : found.length <= 3 ? `${color === player ? 'your' : 'their'} ${plural} are on ${found.join(' and ')}` : '';
            return `${describe(square)}, not ${color === player ? 'your' : 'their'} ${NAMES[type]}${listed ? `, ${listed}` : ''}`;
        }
    }
    return '';
}
