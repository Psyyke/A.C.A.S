// Claims about what one named move does: "...Re5 can be taken by the bishop on d5", "Bd7 hits the knight on b5",
// "Ba4 gives up the pressure on c6". Each claim is replayed on every board where the move is legal (the real board,
// the opponent's turn on it, the line being discussed), and only counts as wrong when it is wrong on all of them.
import { Chess } from '../libraries/chessjs/chess.js';
import { NAMES, SIDE, andList, attackersOf, attacksFrom } from './thought-questions.js';

const SAN = String.raw`(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=?[QRBN])?|[a-h][1-8](?:=?[QRBN])?)[+#]?`;
// A square right after these words names a place, not a move ("the knight on e5", "from d5").
const NOT_MOVE = String.raw`(?<!\b(?:on|from|to|the|of|at|via|toward|towards|into|onto|square|squares|pawn|knight|bishop|rook|queen|king|reach|reaches|with|by)\s)`;
const PLAYED = String.raw`${NOT_MOVE}(?<![\w-])((?:\.\.\.\s*)?${SAN})(?![\w-])`;
const LIST = String.raw`(?:\s*,\s*|\s+(?:and|or)\s+|\s*,\s*(?:and|or)\s+)`;
const TYPE = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
const PIECE = String.raw`(?:(?:the|your|my|their|white's|black's|a|an|that)\s+)?(?:(?:white|black|enemy)\s+)?(pawn|knight|bishop|rook|queen|king)\s+on\s+([a-h][1-8])`;
// The same, but a bare square is fine too.
const TARGET = String.raw`(?:(?:the|your|my|their|white's|black's|a|an|that)\s+)?(?:(?:white|black|enemy)\s+)?(?:(pawn|knight|bishop|rook|queen|king)\s+on\s+)?([a-h][1-8])`;
const TAKEN = new RegExp(String.raw`${PLAYED}((?:${LIST}(?:\.\.\.\s*)?${SAN}(?![\w-]))*)\s+(?:can|could|would|will|may|might)\s+(?:just\s+|simply\s+|then\s+|still\s+|easily\s+)?be\s+(taken|captured|grabbed|hit|attacked)\s+by\s+`
    + String.raw`(?:${PIECE}|((?:\.\.\.\s*)?${SAN}(?![\w-])(?:${LIST}(?:\.\.\.\s*)?${SAN}(?![\w-]))*))`, 'gi');
const SUBJECT = String.raw`(?:${PLAYED}|\b(?:after|if)\s+((?:\.\.\.\s*)?${SAN})(?![\w-]),?\s+(?:it|the\s+(?:pawn|knight|bishop|rook|queen|king)))`;
const HITS = new RegExp(String.raw`${SUBJECT}\s+(?:also\s+|now\s+|then\s+|would\s+|will\s+|immediately\s+|directly\s+)?(attacks|hits|threatens|targets|eyes|forks|attack|hit|threaten|target|eye|fork)\s+([^.;:!?]*)`, 'gi');
const DROPS = new RegExp(String.raw`${SUBJECT}\s+(?:would\s+|will\s+|also\s+)?(?:(?:gives?|giving)\s+up|releases?|abandons?|ends?)\s+(?:the\s+|its\s+|all\s+|any\s+)?(?:pressure|attack|hold|grip|x-ray)\s+on\s+${TARGET}`
    + String.raw`|${SUBJECT}\s+(?:would\s+|will\s+)?(?:no\s+longer|stops?|ceases?\s+to|does\s+not|doesn't|would\s+not|wouldn't|will\s+not|won't)\s+(?:attack|hit|eye|target|pressure|guard|defend|protect)\w*\s+${TARGET}`, 'gi');
// Squares in these spots are where the piece stands or goes, not what it attacks.
const PLACE = /\b(?:from|via|through|to|toward|towards|into|onto|behind|after|before|on the way to|then)\s+(?:the\s+)?(?:[\w-]+\s+)?$/i;
const STOP = /\b(?:but|so|which|while|because|since|though|although|when|if|unless|until|whereas|yet|defended|guarded|protected|covered|defends|guards|protects)\b|\(|,\s*(?!and\b|or\b|the\b|your\b|their\b|my\b|both\b|[a-h][1-8]\b|(?:white|black)\b)/i;
const SUBJECT_START = /(?:^|[.!?,;:(]|\b(?:and|but|so|while|though|although|because|since|or|then|also|meanwhile|whereas|plus|that|now|maybe|perhaps|if|after)\b)\s*$/i;

const other = color => color === 'w' ? 'b' : 'w';
const swap = fen => { const parts = fen.split(' '); parts[1] = other(parts[1]); parts[3] = '-'; return parts.join(' '); };
const clean = san => san.replace(/^\.\.\.\s*/, '').replace(/[+#]$/, '');

function play(fen, san) {
    for(const text of [clean(san), clean(san).replace(/^([KQRBN][a-h]?[1-8]?)([a-h][1-8])/, '$1x$2')]) {
        try {
            const chess = new Chess(fen), move = chess.move(text);
            if(move) return { chess, move };
        } catch {}
    }
    return null;
}
// A bare pawn push like "e5" is only read as a move when "..." or a move word sits right before it.
const isMove = (san, before) => /^\.\.\./.test(san) || !/^[a-h][1-8]/.test(san) || /\b(?:if|after|play|plays|playing|played|push|pushing|then)\s+$/i.test(before);
const label = (fen, san) => (fen.split(' ')[1] === 'b' ? '...' : '') + clean(san);
const who = (chess, s) => { const p = chess.get(s); return `${SIDE[p.color]}'s ${NAMES[p.type]} on ${s}`; };

function tried(boards, san) {
    const out = [];
    for(const fen of new Set(boards.filter(Boolean))) {
        if(/^\.\.\./.test(san) && fen.split(' ')[1] !== 'b') continue;
        const hit = play(fen, san);
        if(hit) out.push({ fen, ...hit });
    }
    return out;
}

function takenWrong(claim, boards) {
    const moves = [claim[1], ...(claim[2].match(new RegExp(`(?:\\.\\.\\.\\s*)?${SAN}`, 'g')) || [])];
    const capture = /taken|captured|grabbed/i.test(claim[3]);
    const replies = claim[6] ? claim[6].match(new RegExp(`(?:\\.\\.\\.\\s*)?${SAN}`, 'g')) : null;
    for(const san of moves) {
        const runs = tried(boards, san);
        if(!runs.length) continue;
        const ok = runs.some(({ chess, move }) => {
            if(replies) return replies.every(reply => {
                // "attacked by h3 pawn" names the piece standing on h3, not the push h3.
                const standing = /^[a-h][1-8]$/.test(clean(reply)) && chess.get(clean(reply));
                if(standing && standing.color !== move.color) return capture
                    ? chess.moves({ verbose: true }).some(m => m.from === clean(reply) && m.to === move.to)
                    : attacksFrom(chess, clean(reply)).includes(move.to);
                const answer = play(chess.fen(), reply);
                return answer && (answer.move.to === move.to || !capture && attacksFrom(answer.chess, answer.move.to).includes(move.to));
            });
            const square = claim[5].toLowerCase(), piece = chess.get(square);
            if(!piece || piece.type !== TYPE[claim[4].toLowerCase()] || piece.color === move.color) return false;
            return capture ? chess.moves({ verbose: true }).some(m => m.from === square && m.to === move.to) : attacksFrom(chess, square).includes(move.to);
        });
        if(ok) continue;
        const { fen, chess, move } = runs[0];
        const takers = chess.moves({ verbose: true }).filter(m => m.to === move.to && m.captured).map(m => m.san);
        const named = replies ? andList(replies.map(clean)) : `the ${claim[4].toLowerCase()} on ${claim[5].toLowerCase()}`;
        return `Board after ${label(fen, san)}: ${named} cannot ${capture ? 'take' : 'hit'} the ${NAMES[move.piece]} on ${move.to}. `
            + (takers.length ? `${SIDE[chess.turn()]} can take it with ${andList(takers)}.` : `No ${SIDE[chess.turn()]} piece can take it there.`);
    }
    return null;
}

function targetsOf(object) {
    const cut = object.search(STOP);
    const text = cut >= 0 ? object.slice(0, cut) : object;
    const out = [];
    for(const m of text.matchAll(/(?:\b(pawn|knight|bishop|rook|queen|king)\s+on\s+)?\b([a-h][1-8])\b/gi))
        if(!PLACE.test(text.slice(0, m.index))) out.push({ type: m[1] && TYPE[m[1].toLowerCase()], square: m[2].toLowerCase() });
    return out;
}

function hitsWrong(claim, boards, before) {
    const san = claim[1] || claim[2];
    if(!isMove(san, before) || /\b(?:discover|uncover|unmask|open)/i.test(claim[0])) return null;
    const runs = tried(boards, san);
    if(!runs.length) return null;
    for(const target of targetsOf(claim[4]).filter(target => !runs.some(({ move }) => move.to === target.square))) {
        // "attacks its own pawn on b2" is muddled wording about guarding, not a claim worth a correction.
        if(runs.some(({ chess, move }) => chess.get(target.square)?.color === move.color)) continue;
        const ok = runs.some(({ chess, move }) => {
            const there = chess.get(target.square);
            if(target.type && there?.type !== target.type) return false;
            return attackersOf(chess, target.square, move.color).length > 0;
        });
        if(ok) continue;
        const { fen, chess, move } = runs[0];
        const there = chess.get(target.square);
        if(target.type && there?.type !== target.type)
            return `Board after ${label(fen, san)}: ${there ? `${target.square} holds ${who(chess, target.square)}` : `${target.square} is empty`}, not a ${NAMES[target.type]}.`;
        const hit = attacksFrom(chess, move.to).filter(s => chess.get(s) && chess.get(s).color !== move.color).map(s => `${NAMES[chess.get(s).type]} ${s}`);
        return `Board after ${label(fen, san)}: nothing of ${SIDE[move.color]}'s attacks ${target.square} there. ${SIDE[move.color]}'s ${NAMES[move.piece]} on ${move.to} attacks ${hit.length ? andList(hit) : 'no enemy piece'}.`;
    }
    return null;
}

function dropsWrong(claim, boards, before) {
    const san = claim[1] || claim[2] || claim[5] || claim[6];
    const square = (claim[4] || claim[8]).toLowerCase(), type = claim[3] || claim[7];
    if(!isMove(san, before) || /^O-O/.test(clean(san))) return null;
    const runs = tried(boards, san);
    if(!runs.length) return null;
    // The claim is about the moved piece itself, so it is wrong only if that piece still reaches the square everywhere.
    if(!runs.every(({ chess, move }) => attacksFrom(chess, move.to).includes(square) && (!type || chess.get(square)?.type === TYPE[type.toLowerCase()]))) return null;
    const { fen, chess, move } = runs[0];
    const there = chess.get(square);
    const verb = there && there.color === move.color ? 'guards' : 'attacks';
    return `Board after ${label(fen, san)}: ${SIDE[move.color]}'s ${NAMES[move.piece]} on ${move.to} still ${verb} ${there ? `the ${NAMES[there.type]} on ${square}` : square}.`;
}

/**
 * The first wrong move claim in text, as { index, end, text } with a correction, or null.
 * context is the text right before, so moves named there count as possible boards too.
 */
export function wrongMoveClaim(text, { rootFen, lineFen = null, context = '' }) {
    const found = [];
    for(const [pattern, check] of [[TAKEN, takenWrong], [HITS, hitsWrong], [DROPS, dropsWrong]]) {
        const scan = new RegExp(pattern.source, pattern.flags);
        for(let claim; (claim = scan.exec(text));) {
            const before = text.slice(0, claim.index);
            // The move has to start a clause. In "Bb7 allows Rg8+, and ...Ba6 can be taken" Rg8+ is an object,
            // so the scan steps past it and finds the real claim about ...Ba6.
            if(!SUBJECT_START.test(before)) { scan.lastIndex = claim.index + 1; continue; }
            const note = check(claim, claimBoards(rootFen, lineFen, context + ' ' + before), before);
            if(note) found.push({ index: claim.index, end: claim.index + claim[0].length, text: note });
        }
    }
    return found.sort((a, b) => a.index - b.index)[0] || null;
}

/**
 * Boards a move named in the text could be played on: the real one, the opponent's turn on it, the line in view,
 * and each of those after any move named in the nearby text before the claim ("After ...Re7, Bf6 hits the rook").
 */
export function claimBoards(rootFen, lineFen = null, context = '') {
    const base = [rootFen, swap(rootFen), lineFen, lineFen && swap(lineFen)].filter(Boolean);
    const out = [...base];
    for(const m of context.slice(-300).matchAll(new RegExp(PLAYED, 'g')))
        for(const fen of base) { const hit = play(fen, m[1]); if(hit) out.push(hit.chess.fen(), swap(hit.chess.fen())); }
    return [...new Set(out)];
}

/**
 * Live check for the thinking: finished sentences from `from` on that say something false about a named move.
 * Returns { end, trigger, text } or null. checked collects corrections already given.
 */
export function moveClaim(thought, from, rootFen, { lineFen = null, checked = new Set() } = {}) {
    // "..." before a move and "12." before a move are notation, not sentence ends.
    for(const s of thought.slice(from).matchAll(/(?:[^.!?\n]|\.{3}\s?(?=[KQRBNa-hO])|(?<=\d)\.(?=\s?[KQRBNa-hO\d]))+[.!?](?=\s|$)/g)) {
        if(/\[|\]/.test(s[0])) continue;
        const start = from + s.index;
        const hit = wrongMoveClaim(s[0], { rootFen, lineFen, context: thought.slice(Math.max(0, start - 300), start) });
        if(!hit || checked.has(hit.text)) continue;
        checked.add(hit.text);
        return { end: start + s[0].length, trigger: s[0].slice(hit.index, hit.end).trim(), text: hit.text };
    }
    return null;
}
