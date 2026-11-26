// Inkling's thoughts move between three boards: the game so far (past), the board on screen (now) and imagined lines (future).
// Every check here answers on exactly one of them, and stays silent when the thought does not make clear which one it means.
// A fact from the wrong board is worse than no fact, so ambiguity always means silence.

import { Chess } from '../libraries/chessjs/chess.js';
import { NAMES, SIDE, VALUE, allSquares, andList, answerQuestion, attackersOf, attacksFrom, pinOf } from './thought-questions.js';

const other = color => color === 'w' ? 'b' : 'w';
const bare = san => san.replace(/[+#]/g, '');
const placement = fen => fen.split(' ').slice(0, 2).join(' ');
const play = (fen, san) => { try { const chess = new Chess(fen); const move = chess.move(san, { sloppy: true }); return move ? { chess, move } : null; } catch { return null; } };
const MOVE = String.raw`(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=?[QRBN])?|[a-h][1-8](?:=?[QRBN])?)[+#]?`;
const MOVES = String.raw`((?:(?:\d+\.(?:\.\.)?\s*)?(?:\.\.\.)?${MOVE}(?:\s*,\s*|\s+(?:and\s+)?|(?=\s*\?)|\s*$)){1,3})`;
// Piece moves and numbered or "..." moves. A bare "e4" is usually a square, so it does not count as a move here.
const PIECE_MOVE = /(?<![A-Za-z0-9])(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|O-O|\.\.\.\s*[a-h][1-8]|\d+\.\s*[a-h][1-8])|\b(?:knight|bishop|rook|queen|king|pawn)\s+(?:\w+\s+)?(?:to|takes|captures)\s+[a-h][1-8]\b/i;

/** The real moves that led to the current board, oldest first. Only an unbroken chain back from the current board counts. */
export function gamePlies(history = [], rootFen) {
    const fens = [...history.filter(fen => typeof fen === 'string'), rootFen];
    const plies = [];
    for(let i = fens.length - 1; i > 0; i--) {
        let found = null;
        try {
            const before = new Chess(fens[i - 1]);
            found = before.moves({ verbose: true }).find(move => {
                before.move(move);
                const same = placement(before.fen()) === placement(fens[i]);
                before.undo();
                return same;
            });
        } catch {}
        if(!found) break;
        const san = bare(found.san);
        plies.unshift({ ...found, san, label: found.color === 'b' ? `...${san}` : san, beforeFen: fens[i - 1], afterFen: fens[i] });
    }
    return plies;
}

/** Does a move as Inkling wrote it ("N1g3", "...a6", "exd5") describe this played move? */
export function sameMove(ply, written) {
    const san = bare(String(written).replace(/^\d*\.*\s*/, ''));
    if(/^O-O/.test(san)) return /^O-O/.test(ply.san) && /O-O-O/.test(san) === /O-O-O/.test(ply.san);
    const to = san.match(/([a-h][1-8])(?:=?[QRBN])?$/)?.[1];
    if(!to || to !== ply.to) return false;
    const piece = /^[KQRBN]/.test(san) ? san[0].toLowerCase() : 'p';
    if(piece !== ply.piece) return false;
    const from = piece === 'p' ? san.match(/^([a-h])x/) : san.match(/^[KQRBN]([a-h])?([1-8])?x?[a-h][1-8]/);
    return !from || (!from[1] || from[1] === ply.from[0]) && (!from[2] || from[2] === ply.from[1]);
}

// ---------- past mentions ----------
const PAST_MARK = /\b(?:just\s+(?:played|moved|went|took|captured|pushed|castled|retreated|traded)|(?:last|previous|most recent)\s+move|(?:has|had)\s+(?:just\s+)?(?:played|moved)|previously|earlier|already\s+(?:played|moved|went|took)|came\s+from)\b/gi;
// Words that put the following move into a plan or a line, so the past marker before them no longer applies.
const PLANNING = /\b(?:if|then|plays?|playing|would|could|can|next|after|reply|replies|answers?|suppose|imagine|wants?|threatens?|idea|line|should|maybe|consider)\b/i;
const PAST_AFTER = /^\s*,?\s*(?:(?:was|has been|had been)\s+(?:just\s+|already\s+)?(?:played|the (?:last|previous) move)|(?:earlier|previously|last move|already)\b)/i;
const clauseOf = (text, index) => {
    const head = text.slice(Math.max(0, index - 90), index);
    let cut = 0;
    for(const m of head.matchAll(/[.!?;\n](?=\s|$)/g)) cut = m.index + 1;
    return head.slice(cut);
};

/**
 * Is the move written at text[index, end) about the game so far? Returns { strong } or null.
 * Strong means "just played" or "last move", a claim about the most recent move that can be checked outright.
 */
export function pastMention(text, index, end) {
    const clause = clauseOf(text, index);
    if(/\b(?:if|would|could|suppose|imagine)\b/i.test(clause)) return null;
    let mark = null;
    for(const m of clause.matchAll(PAST_MARK)) mark = m;
    if(mark) {
        const gap = clause.slice(mark.index + mark[0].length);
        // The marker belongs to the move right after it, not to a square named further on ("last move a6, hitting the bishop on b5").
        if(!PLANNING.test(gap) && !PIECE_MOVE.test(gap) && !/\b[a-h][1-8]\b/.test(gap) && gap.trim().split(/\s+/).filter(Boolean).length <= 4)
            return { strong: /\bjust\b|\b(?:last|previous|most recent)\s+move/i.test(mark[0]) };
    }
    const after = text.slice(end, end + 40).match(PAST_AFTER);
    return after ? { strong: /\bjust\b|last|previous/i.test(after[0]) } : null;
}

/** What the played move did, read off the real boards before and after it. An older move is told in the past tense,
 *  because what it attacked back then may no longer be true on the current board. */
export function pastNote(ply, { last = true, older = false } = {}) {
    const before = new Chess(ply.beforeFen), after = new Chess(ply.afterFen);
    const mover = ply.color, opp = other(mover);
    const heading = older ? `Game history, played earlier: move ${numbered(ply)} by ${SIDE[mover]}`
        : `Game history, already played: ${last ? `the last move was` : 'the move before the last one was'} ${SIDE[mover]}'s ${ply.label}`;
    const parts = [`${heading}, the ${NAMES[ply.piece]} from ${ply.from} to ${ply.to}${ply.captured ? ` taking the ${NAMES[ply.captured]}` : ''}.`];
    if(after.in_checkmate()) parts.push('It gave checkmate.');
    else if(after.in_check()) parts.push('It gave check.');
    const was = new Set(attacksFrom(before, ply.from));
    const worth = (board, s, owner) => VALUE[board.get(s).type] >= 3 || !attackersOf(board, s, owner).length;
    const hits = attacksFrom(after, ply.to).filter(s => after.get(s)?.color === opp && after.get(s).type !== 'k' && !was.has(s) && worth(after, s, opp));
    if(hits.length) parts.push(`${older ? 'Right after it, from' : 'From'} ${ply.to} it ${older ? 'attacked' : 'attacks'} ${andList(hits.map(s => `the ${NAMES[after.get(s).type]} on ${s}`))}.`);
    const dropped = [...was].filter(s => s !== ply.to && after.get(s)?.color === mover && after.get(s).type !== 'k'
        && !attacksFrom(after, ply.to).includes(s) && attackersOf(after, s, opp).length).slice(0, 2);
    if(dropped.length) parts.push(older
        ? `It stopped guarding ${andList(dropped.map(s => `the ${NAMES[after.get(s).type]} on ${s}`))}, which ${SIDE[opp]} attacked at that moment.`
        : `It no longer guards ${andList(dropped.map(s => `the ${NAMES[after.get(s).type]} on ${s}`))}, and ${SIDE[opp]} attacks ${dropped.length > 1 ? 'them' : 'it'}.`);
    // Pieces whose line ran through the square the moved piece left.
    const opened = [];
    for(const s of allSquares()) {
        const piece = after.get(s);
        if(!piece || s === ply.to || !'brq'.includes(piece.type) || before.get(s)?.type !== piece.type || before.get(s)?.color !== piece.color) continue;
        const had = new Set(attacksFrom(before, s));
        for(const t of attacksFrom(after, s)) {
            const target = after.get(t);
            if(had.has(t) || !target || target.color === piece.color || target.type === 'k' || !worth(after, t, target.color)) continue;
            opened.push(`${SIDE[piece.color]}'s ${NAMES[piece.type]} on ${s} ${older ? 'then hit' : 'now hits'} the ${NAMES[target.type]} on ${t}`);
        }
    }
    if(opened.length) parts.push(`Leaving ${ply.from} opened a line: ${andList(opened.slice(0, 2))}.`);
    parts.push(older ? 'That was earlier in the game. Pieces have moved since, so none of this describes the current board.'
        : 'This already happened, the current board is the result, not a future line.');
    return parts.join(' ');
}

const numbered = ply => `${ply.beforeFen.split(' ')[5] || '?'}${ply.color === 'w' ? '.' : '...'}${ply.san}`;

// A question about the game so far, by its words, a move number, or a move that was played and is not playable now.
const HISTORY_WORDS = /\b(?:did|was|were|had|played|earlier|before|previous(?:ly)?|last move|so far|until now|back then|this game|the game|my game|ago|missed|mistakes?|blunder(?:ed)?|went wrong|opening|should(?:'ve| have)|could(?:'ve| have))\b/i;

/**
 * Game history for the English board when the question is about the past: the moves so far, and what each earlier move
 * the question names did at the time. Empty for questions about the current board or a future one.
 */
export function historyNotes(question, history = [], rootFen) {
    const plies = gamePlies(history, rootFen);
    const text = String(question || '');
    if(!plies.length || /^\(played \S+\)$/.test(text.trim())) return '';
    const named = [];
    for(const m of text.matchAll(/\bmove\s+(\d{1,3})\b|\b(\d{1,3})(\.{1,3})\s*(?=[KQRBNOa-h])/gi)) {
        const number = Number(m[1] || m[2]), side = m[3] ? (m[3].length === 1 ? 'w' : 'b') : null;
        named.push(...plies.filter(ply => Number(ply.beforeFen.split(' ')[5]) === number && (!side || ply.color === side)));
    }
    const past = HISTORY_WORDS.test(text) || named.length;
    for(const m of text.matchAll(new RegExp(String.raw`(?<![A-Za-z0-9])(?:\.\.\.)?(${MOVE})`, 'g'))) {
        if(!/^[KQRBNO]/.test(m[1]) && !/^\.\.\./.test(m[0]) && !/\b(?:play(?:ed)?|did|move)\s+$/i.test(text.slice(0, m.index))) continue;
        const played = plies.filter(ply => sameMove(ply, m[1]));
        // Only the question's own past wording makes a played move history, "Should I play Nf3?" is about the future.
        if(played.length && past) named.push(played.at(-1));
    }
    if(!past && !named.length) return '';
    const start = plies[0], shown = plies.slice(-60);
    const moves = shown.map((ply, i) => ply.color === 'w' || i === 0 ? numbered(ply) : ply.san).join(' ');
    const lines = [`Moves so far (H, already played): ${shown.length < plies.length || start.beforeFen !== new Chess().fen() ? '... ' : ''}${moves}.`];
    const last = plies.at(-1);
    for(const ply of [...new Set(named)].slice(0, 3))
        lines.push(ply === last ? pastNote(ply) : pastNote(ply, { older: true }));
    return lines.join('\n');
}

/** A move called "just played" that the game history does not show. */
export function pastCorrection(written, plies) {
    const last = plies.at(-1);
    if(!last) return 'Game history: no earlier move of this game is known here, so what was just played cannot be told and should not be guessed.';
    return `Game history: the last move on the real board was ${SIDE[last.color]}'s ${last.label}, the ${NAMES[last.piece]} from ${last.from} to ${last.to}. `
        + `${written} was not just played.`;
}

/**
 * Checks a move written in a past context. Returns { text } to inject, { skip: true } when it should be left alone
 * (never treated as a future move), or null when it is not about the past at all.
 */
export function pastCheck(written, mention, plies, seen) {
    if(!mention) return null;
    const recent = plies.slice(-2).reverse();
    const ply = recent.find(item => sameMove(item, written));
    if(ply) {
        const key = `past:${ply.afterFen}`;
        if(seen.has(key)) return { skip: true };
        seen.add(key);
        return { text: pastNote(ply, { last: ply === plies.at(-1) }) };
    }
    if(plies.some(item => sameMove(item, written)) || !mention.strong || seen.has('past:wrong')) return { skip: true };
    seen.add('past:wrong');
    return { text: pastCorrection(written, plies) };
}

/** The player asks about the move that was just played, so its effect belongs in the thinking from the start. */
export function asksLastMove(question, plies, rootFen) {
    const last = plies.at(-1);
    if(!last) return false;
    const text = String(question || '');
    if(/^\(played \S+\)$/.test(text.trim())) return true;
    if(/\b(?:just\s+(?:played|moved)|(?:last|previous)\s+move|why\s+did\s+(?:white|black|they|he|she|the opponent|my opponent|it)\s+(?:play|move|go))\b/i.test(text)) return true;
    return [...text.matchAll(new RegExp(String.raw`(?<![A-Za-z0-9])(?:\.\.\.)?(${MOVE})`, 'g'))]
        .some(m => /^[KQRBNa-h]/.test(m[1]) && sameMove(last, m[1]) && !play(rootFen, m[1]));
}

// ---------- self-questions tied to a board in time ----------
const LAST_MOVE_Q = /\b(?:what\s+(?:was|is)\s+the\s+(?:last|previous)\s+move|what\s+did\s+(?:white|black|they|he|she|the opponent|my opponent|the other side)\s+(?:just\s+)?(?:play|move|do)|what\s+did\s+(?:the\s+)?(?:last|previous)\s+move\s+(?:do|change|attack|threaten))\b/i;
const NOW = /\s*,?\s*\b(?:right now|currently|at the moment|on the current board|in the current position|as it stands)\b\s*,?/gi;
const PAST_WORDS = /\b(?:was|were|had|before|previously|earlier|used to|last move|just played)\b/i;
const FUTURE_LEAD = new RegExp(String.raw`^(?:and\s+|so\s+|but\s+|okay,?\s+|ok,?\s+)?(?:after|if|once|following)\s+${MOVES}\s*,?\s*(?:then\s+)?(.+)$`, 'i');
const FUTURE_TAIL = new RegExp(String.raw`^(.+?)\s+(?:after|if|once)\s+${MOVES}\s*\?$`, 'i');
const BEFORE = new RegExp(String.raw`\s*,?\s*\bbefore\s+(?:the\s+last\s+move|(?:(?:white|black)'s\s+|their\s+|his\s+|her\s+|my\s+)?(?:last|previous)\s+move|that\s+move|(?:\.\.\.)?(${MOVE}))\s*,?\s*`, 'i');
const present = text => text.replace(/\bwould\s+(.+?)\s+(?:still\s+)?be\b/i, 'is $1').replace(/\bwill\s+(.+?)\s+(?:still\s+)?be\b/i, 'is $1')
    .replace(/\bwould\s+/i, '').replace(/\bwill\s+/i, '');
const pastToPresent = text => text.replace(/\bwas\b/gi, 'is').replace(/\bwere\b/gi, 'are').replace(/\bhad\b/gi, 'has');
const ask = text => (/\?\s*$/.test(text) ? text : `${text}?`).replace(/^[a-z]/, c => c.toUpperCase());

/**
 * A self-question that names a time: the last move, a board before it, a board after some moves, or explicitly the current board.
 * Returns { text } when answered, { skip: true } when it is about another time and must not be answered on the current board,
 * and null when it is an ordinary current-board question.
 * line: { label, fen } for the imagined line Inkling is in the middle of, or null.
 */
export function timeQuestion(question, { rootFen, plies = [], line = null }) {
    const q = question.replace(/\s+/g, ' ').trim();
    if(LAST_MOVE_Q.test(q)) return { text: plies.length ? pastNote(plies.at(-1)) : pastCorrection('', []) };

    const lead = q.match(FUTURE_LEAD), tail = !lead && q.match(FUTURE_TAIL);
    if(lead || tail) {
        const written = (lead ? lead[1] : tail[2]).split(/[\s,]+|\band\b/).map(s => s.replace(/^\d+\.+/, '').replace(/^\.\.\./, '')).filter(Boolean);
        const rest = lead ? lead[2] : tail[1];
        // Candidate boards: the line being imagined (also when the spotter already followed these moves into it) and the real board.
        // If the moves fit more than one, it is unclear which board Inkling means, so nothing is answered.
        const playFrom = start => {
            let fen = start;
            const labels = [];
            for(const san of written) {
                const hit = play(fen, san);
                if(!hit) return null;
                labels.push(hit.move.color === 'b' ? `...${bare(hit.move.san)}` : bare(hit.move.san));
                fen = hit.chess.fen();
            }
            return { fen, labels };
        };
        const found = [];
        if(line) {
            const sans = line.label.split(' ').map(s => s.replace(/^\.\.\./, ''));
            const tail = sans.slice(-written.length);
            if(tail.length === written.length && tail.every((san, i) => bare(san) === bare(written[i]).replace(/^\.\.\./, '')))
                found.push({ fen: line.fen, label: line.label });
            const next = playFrom(line.fen);
            if(next) found.push({ fen: next.fen, label: [line.label, ...next.labels].join(' ') });
        }
        const fromRoot = playFrom(rootFen);
        if(fromRoot) found.push({ fen: fromRoot.fen, label: fromRoot.labels.join(' ') });
        if(!found.length) return { skip: true };
        const replies = found.map(f => answerQuestion(ask(present(rest)), [{ label: `Board after ${f.label}`, chess: new Chess(f.fen) }]));
        const facts = r => r?.text.replace(/^[^:]+:\s*/, '');
        if(replies.some(r => !r) || replies.some(r => facts(r) !== facts(replies[0]))) return { skip: true };
        return { text: replies[0].text.replace(/^[^:]+:/, found.length > 1 ? `Board after ${written.join(' ')} (from either board)` + ':' : '$&') };
    }

    const before = q.match(BEFORE);
    if(before) {
        const last = plies.at(-1);
        if(!last || before[1] && !sameMove(last, before[1])) return { skip: true };
        const reply = answerQuestion(ask(pastToPresent(q.replace(BEFORE, ' ').trim())), [{ label: `Board before the last move ${last.label}`, chess: new Chess(last.beforeFen) }]);
        return reply ? { text: reply.text } : { skip: true };
    }
    if(PAST_WORDS.test(q)) return { skip: true };

    if(NOW.test(q)) {
        NOW.lastIndex = 0;
        const reply = answerQuestion(ask(q.replace(NOW, ' ').replace(/\s+\?/, '?').trim()), [{ label: 'Current board', chess: new Chess(rootFen) }]);
        return reply ? { text: reply.text } : { skip: true };
    }
    return null;
}

// ---------- plain statements about the current board ----------
const CLAIM = /\b(?:(?:the|my|your|white's|black's|white|black|our|their)\s+)?(?:(pawn|knight|bishop|rook|queen)\s+on\s+([a-h][1-8])|([a-h][1-8])(?:[- ](pawn|knight|bishop|rook|queen))?)\s+(?:is|stays|remains)\s+(?:still\s+|currently\s+|right now\s+|now\s+|completely\s+|totally\s+)?(not\s+)?(undefended|unprotected|unguarded|hanging|loose|defended|protected|guarded|pinned)\b(?!\s+(?:by|to|from|against|twice|once|enough|after|if|when|in)\b)/gi;
const ELSEWHERE = /\b(?:if|after|would|could|then|once|when|will|might|can|next|plays?|playing|reply|replies|line|suppose|imagine|was|were|had|before|previously|earlier|later|becomes?|became|now|still|anymore|any more|no longer)\b/i;
const NEARBY_LINE = /\b(?:if|after|suppose|imagine|line|then|plays?|reply|replies|following)\b/i;
// Plain "now" means the board on screen only when nothing around it moved a piece or went back in time.
// "Just now", "until now", "now that ..." and "from now on" point elsewhere and stay unanswered.
const PLAIN_NOW = /\s*,?\s*(?<!\b(?:until|up to|by|just|from|for)\s)\bnow\b(?!\s+(?:on|that)\b)\s*,?/gi;
const MOVED_NEARBY = /\b(?:takes?|took|captures?|captured|recaptures?|moves?|moved|goes|went|jumps?|jumped|retreats?|retreated|trades?|traded|exchanges?|pushes|pushed|castles|castled|lands?|comes|came|played|was|were|had|earlier|previously|before)\b/i;
const TYPES = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q' };

/**
 * "The bishop on b5 is defended." stated about the current board when it is not true.
 * Only sentences with no move, no line and no other time nearby are checked, and only wrong claims get a note.
 * Returns { end, trigger, text } or null. checked collects squares already corrected.
 */
export function currentClaim(thought, from, rootFen, { lastLineAt = -1e9, checked = new Set() } = {}) {
    const root = new Chess(rootFen);
    for(const s of thought.slice(from).matchAll(/[^.!?\n]+[.!](?=\s|$)/g)) {
        const start = from + s.index, sentence = s[0];
        const explicit = NOW.test(sentence);
        NOW.lastIndex = 0;
        let plain = sentence.replace(NOW, ' ');
        NOW.lastIndex = 0;
        const now = !explicit && PLAIN_NOW.test(plain);
        PLAIN_NOW.lastIndex = 0;
        if(now) plain = plain.replace(PLAIN_NOW, ' ');
        PLAIN_NOW.lastIndex = 0;
        if(ELSEWHERE.test(plain) || PIECE_MOVE.test(plain) || /\[|\]/.test(sentence)) continue;
        if(!explicit) {
            const nearby = thought.slice(Math.max(0, start - 300), start);
            if(start - lastLineAt < 400 || NEARBY_LINE.test(nearby) || PIECE_MOVE.test(nearby) || /\[/.test(nearby)) continue;
            // After a described move or a look back, "now" is the board after that, not the one on screen.
            if(now && (MOVED_NEARBY.test(nearby) || MOVED_NEARBY.test(plain))) continue;
        }
        for(const claim of plain.matchAll(CLAIM)) {
            const square = (claim[2] || claim[3]).toLowerCase(), named = claim[1] || claim[4];
            const piece = root.get(square);
            if(!piece || piece.type === 'k' || named && TYPES[named.toLowerCase()] !== piece.type) continue;
            const status = claim[6].toLowerCase(), negated = Boolean(claim[5]);
            const pinned = status === 'pinned';
            const key = `${square}:${pinned ? 'pin' : 'guard'}`;
            if(checked.has(key)) continue;
            const att = attackersOf(root, square, other(piece.color)).length, def = attackersOf(root, square, piece.color).length;
            const pin = Boolean(pinOf(root, square));
            const says = pinned ? (negated ? 'free' : 'pinned') : /undefended|unprotected|unguarded|loose/.test(status) || negated ? 'undefended'
                : status === 'hanging' ? 'hanging' : 'defended';
            const wrong = says === 'pinned' ? !pin : says === 'free' ? pin : says === 'undefended' ? def > 0 : says === 'hanging' ? def > 0 || !att : !def;
            if(!wrong) continue;
            checked.add(key);
            const reply = answerQuestion(`Is ${square} ${pinned ? 'pinned' : 'defended'}?`, [{ label: 'Current board', chess: root }]);
            if(reply) return { end: start + sentence.length, trigger: claim[0].trim(), text: reply.text };
        }
    }
    return null;
}
