import { Chess } from '../libraries/chessjs/chess.js';
import { NAMES, SIDE, VALUE, attacksFrom, attackersOf, allSquares, andList, answerQuestion } from './thought-questions.js';
import { asksLastMove, currentClaim, gamePlies, pastCheck, pastMention, pastNote, timeQuestion } from './thought-time.js';
import { moveClaim } from './move-claims.js';

// Live thought evidence. While Inkling thinks, Pena spots the moves it imagines, pauses the stream,
// adds rule-checked facts about that future board, and lets the same thought continue from there.
// The engine only supplies reasons (what a line wins, threatens or stops). Explaining them is Inkling's job.

const list = items => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
export const nullMove = fen => { const parts = fen.split(' '); parts[1] = parts[1] === 'w' ? 'b' : 'w'; parts[3] = '-'; return parts.join(' '); };
const tryOnce = (fen, san) => { try { const chess = new Chess(fen); const move = chess.move(san, { sloppy: true }); return move ? { chess, move } : null; } catch { return null; } };
// Models often drop the x on captures, so Qf4 also matches Qxf4.
export const tryMove = (fen, san) => tryOnce(fen, san) || (/^[KQRBN][a-h]?[1-8]?[a-h][1-8]/.test(san) ? tryOnce(fen, san.replace(/([a-h][1-8][+#]?)$/, 'x$1')) : null);
const bare = san => san.replace(/[+#]/g, '');
const other = color => color === 'w' ? 'b' : 'w';
const forSide = (score, color) => color === 'w' ? score : -score;
// Winning chances on a -1..1 scale (the Lichess curve), so half a pawn at +12 is not graded like half a pawn at 0.
const chances = pawns => 2 / (1 + Math.exp(-0.368208 * pawns)) - 1;

// ---------- what a line actually does ----------
function materialWords(n) {
    return { 1: 'a pawn', 2: 'two pawns', 3: 'a piece', 4: 'a piece and a pawn', 5: 'a rook' }[n] || (n >= 9 ? 'a queen' : `about ${n} pawns of material`);
}

// Plays a line until the captures settle and reports who came out ahead.
export function lineOutcome(fen, sans, maxPlies = 6) {
    const chess = new Chess(fen), gains = { w: 0, b: 0 }, played = [];
    let settled = { w: 0, b: 0 }, settledAt = 0, mate = null;
    const moves = sans.slice(0, maxPlies);
    for(let i = 0; i < moves.length; i++) {
        const color = chess.turn(), move = chess.move(moves[i], { sloppy: true });
        if(!move) break;
        played.push(color === 'b' ? `...${move.san}` : move.san);
        if(move.captured) gains[color] += VALUE[move.captured];
        if(move.promotion) gains[color] += VALUE[move.promotion] - 1;
        if(chess.in_checkmate()) { mate = color; settled = { ...gains }; settledAt = played.length; break; }
        const next = moves[i + 1] ? tryOnce(chess.fen(), moves[i + 1])?.move : null;
        if(!next?.captured) { settled = { ...gains }; settledAt = played.length; if(!next) break; }
    }
    return { line: played.slice(0, Math.max(1, settledAt)).join(' '), mate, net: color => settled[color] - settled[other(color)] };
}

// Names what the first move of a line newly hits, so "the problem is Rd5" becomes a reason.
export function replyHits(fen, san) {
    const played = tryOnce(fen, san);
    if(!played) return '';
    const { chess, move } = played, opp = other(move.color);
    const previously = new Set(move.piece === 'p' ? [] : attacksFrom(new Chess(fen), move.from));
    const hits = attacksFrom(chess, move.to)
        .filter(s => chess.get(s)?.color === opp && !previously.has(s))
        .filter(s => chess.get(s).type === 'k' || VALUE[chess.get(s).type] >= 3 || !attackersOf(chess, s, opp).length);
    if(!hits.length) return '';
    const names = hits.map(s => chess.get(s).type === 'k' ? 'the king (check)' : `the ${NAMES[chess.get(s).type]} on ${s}`);
    return `${move.color === 'b' ? '...' : ''}${move.san} hits ${andList(names)}${hits.length > 1 ? ' at once' : ''}.`;
}

// Stockfish's view of the imagined move, turned into board reasons a coach can explain.
// engine.search(fen) resolves { score (White pawns), best, pv (SAN) } or null.
export async function engineNote(engine, beforeFen, afterFen, move, { nameMoves = true } = {}) {
    const mover = move.color, opp = other(mover);
    const checkNow = new Chess(afterFen).in_check(), checkBefore = new Chess(beforeFen).in_check();
    const before = await engine.search(beforeFen), after = await engine.search(afterFen);
    if(!before || !after) return null;
    const bestScore = forSide(before.score, mover), gotScore = forSide(after.score, mover);
    const cost = Math.max(0, bestScore - gotScore), lost = chances(bestScore) - chances(gotScore);
    const isBest = bare(move.san) === bare(before.best || '');
    const bestLabel = mover === 'b' ? `...${before.best}` : before.best;
    const reply = after.pv.length ? lineOutcome(afterFen, after.pv) : null;
    const reasons = [];

    if(gotScore >= 90) return { salient: true, text: `Engine: this forces mate${reply ? `, for example ${reply.line}` : ''}.` };
    if(gotScore <= -90 && bestScore > -90) return { salient: true, text: `Engine: this allows a forced mate${reply ? `, starting ${reply.line}` : ''}.` };

    if(cost >= 0.7 && lost >= 0.1) {
        const size = cost >= 3 && lost >= 0.3 ? 'a serious mistake' : cost >= 1.5 && lost >= 0.2 ? 'a mistake' : 'an inaccuracy';
        let why = '';
        if(reply?.mate === opp) why = ` The problem is ${reply.line}, which ends in mate.`;
        else if(reply && reply.net(opp) >= 1) why = ` The problem is ${reply.line}, and ${SIDE[opp]} comes out ${materialWords(reply.net(opp))} ahead in that line.`;
        else if(reply) why = ` ${SIDE[opp]}'s best answer is ${reply.line}.`;
        const hit = after.pv[0] ? replyHits(afterFen, after.pv[0]) : '';
        if(hit) why += ` The key is that ${hit}`;
        else if(reply && !reply.mate && reply.net(opp) < 1) why += ' Ask what that reply attacks or opens up.';
        const still = gotScore >= 2.5 ? ` ${SIDE[mover]} is still winning after it though.` : '';
        return { salient: true, text: `Engine: ${size}${nameMoves && before.best ? `, ${bestLabel} was better` : ''}.${why}${still}` };
    }

    // A good move: say what it threatens and what it stops, so the coach can explain the point.
    const threat = checkNow ? null : await engine.search(nullMove(afterFen));
    if(threat?.pv.length && forSide(threat.score, mover) - gotScore >= 1) {
        const idea = lineOutcome(nullMove(afterFen), threat.pv);
        const label = mover === 'b' ? `...${threat.best}` : threat.best;
        if(idea.mate === mover) reasons.push(/#$/.test(threat.best) ? `The point is that it threatens ${label}, which is checkmate.` : `The point is that it threatens ${label} with mate to follow.`);
        else if(idea.net(mover) >= 1) reasons.push(`The point is that it threatens ${label}, winning ${materialWords(idea.net(mover))}.`);
    }
    const danger = checkBefore ? null : await engine.search(nullMove(beforeFen));
    if(danger?.pv.length && forSide(danger.score, opp) - forSide(before.score, opp) >= 1) {
        const old = lineOutcome(nullMove(beforeFen), danger.pv);
        const label = opp === 'b' ? `...${danger.best}` : danger.best;
        const stillWorks = after.best && bare(after.best) === bare(danger.best) && reply?.net(opp) >= 1;
        if(!stillWorks && (old.mate === opp || old.net(opp) >= 1))
            reasons.push(`It also deals with ${SIDE[opp]}'s threat of ${label}, which would have ${old.mate === opp ? 'led to mate' : `won ${materialWords(old.net(opp))}`}.`);
    }
    if(reply && !reasons.length && (reply.net(opp) >= 1 || /[+#]/.test(reply.line)))
        reasons.push(`${SIDE[opp]}'s best answer is ${reply.line}.`);
    const verdict = isBest ? 'this is the best move here' : cost < 0.3 || lost < 0.03 ? 'this is as good as the best move' : `this is fine, a little weaker than ${nameMoves ? bestLabel : 'the best move'}`;
    return { salient: isBest || reasons.length > 0, text: `Engine: ${verdict}.${reasons.length ? ` ${reasons.join(' ')}` : ''}` };
}

// Open questions about danger rarely make Inkling imagine the opponent's move, so the threat is checked up front.
export const THREAT_QUESTION = /\b(watch out|careful|danger|threat|threaten|opponent (want|plan|do|going)|what (does|is) (white|black|my opponent|the opponent|he|she|they) (want|plan|threat|doing)|should i worry|anything (to )?worry)/i;

// What the opponent would do if it were their move, with the board reason behind it.
export async function rootThreat(engine, fen) {
    const chess = new Chess(fen);
    if(chess.in_check() || chess.game_over()) return null;
    const me = chess.turn(), opp = other(me), flipped = nullMove(fen);
    const [now, threat] = await Promise.all([engine.search(fen), engine.search(flipped)]);
    if(!now || !threat?.pv.length) return null;
    const idea = lineOutcome(flipped, threat.pv);
    const label = opp === 'b' ? `...${threat.best}` : threat.best;
    const gain = forSide(threat.score, opp) - forSide(now.score, opp);
    if(idea.mate === opp) {
        const hit = replyHits(flipped, threat.best);
        return `Threat check: if ${SIDE[opp]} could move now, ${label} would lead to mate (${idea.line}).${hit ? ` The key is that ${hit}` : ''}`;
    }
    if(gain >= 1 && idea.net(opp) >= 1) {
        const hit = replyHits(flipped, threat.best);
        return `Threat check: if ${SIDE[opp]} could move now, ${label} would win ${materialWords(idea.net(opp))} (${idea.line}).${hit ? ` The key is that ${hit}` : ''}`;
    }
    if(gain >= 1.5) return `Threat check: ${SIDE[opp]}'s most dangerous idea is ${label} (${idea.line}). It wins no material at once, so ask what it attacks or opens up.`;
    return `Threat check: ${SIDE[opp]} has no immediate tactical threat right now, nothing wins material if it were their move. Look at slower plans and weak spots instead.`;
}

// ---------- rule-checked facts about the imagined board ----------
// Limited to what the move changed. Returns null for quiet moves so the thinking is not flooded.
export async function factsAfter(lineSans, chess, move, beforeFen, { engine = null, force = false, nameMoves = true } = {}) {
    const mover = move.color, opp = other(mover), to = move.to;
    const parts = [`Board after ${lineSans.join(' ')}: ${SIDE[mover]}'s ${NAMES[move.piece]} is now on ${to}`
        + (move.captured ? `, having taken the ${NAMES[move.captured]}` : '') + '.'];
    if(chess.in_checkmate()) return parts.concat('That is checkmate.').join(' ');
    let salient = Boolean(move.captured) || force;
    if(chess.in_check()) { parts.push('It gives check.'); salient = true; }
    const previously = new Set(attacksFrom(new Chess(beforeFen), move.from));
    const hits = attacksFrom(chess, to).filter(s => chess.get(s)?.color === opp && chess.get(s).type !== 'k' && !(previously.has(s) && move.piece !== 'p'));
    const bigHits = hits.filter(s => VALUE[chess.get(s).type] >= 3 || !attackersOf(chess, s, opp).length);
    if(bigHits.length) { parts.push(`From ${to} it now attacks ${andList(bigHits.map(s => `the ${NAMES[chess.get(s).type]} on ${s}`))}.`); salient = true; }
    // A retreat that keeps its target is easy to misread as giving it up, so the note says what it still hits and what it dropped.
    if(move.piece !== 'p') {
        const now = attacksFrom(chess, to), enemy = s => chess.get(s)?.color === opp && chess.get(s).type !== 'k';
        const kept = now.filter(s => previously.has(s) && enemy(s) && VALUE[chess.get(s).type] >= 3);
        const dropped = [...previously].filter(s => !now.includes(s) && s !== to && enemy(s));
        if(kept.length) parts.push(`From ${to} it still attacks ${andList(kept.map(s => `the ${NAMES[chess.get(s).type]} on ${s}`))}.`);
        if(dropped.length) parts.push(`It no longer attacks ${andList(dropped.map(s => `the ${NAMES[chess.get(s).type]} on ${s}`))}.`);
    }
    const had = new Set(new Chess(nullMove(beforeFen)).moves({ verbose: true }).map(m => bare(m.san)));
    const legal = chess.moves({ verbose: true });
    const takers = legal.filter(m => m.to === to && m.captured);
    if(takers.length) {
        const recaptures = new Set();
        for(const take of takers) {
            const next = new Chess(chess.fen()); next.move(take.san);
            next.moves({ verbose: true }).filter(m => m.to === to && m.captured).forEach(m => recaptures.add(m.san));
        }
        parts.push(`${SIDE[opp]} can take it there with ${list(takers.map(m => m.san))}`
            + (recaptures.size ? `, and ${SIDE[mover]} could recapture with ${list([...recaptures])}.` : `, and ${SIDE[mover]} cannot recapture.`));
        salient = true;
    }
    // A capture that just loses the capturing piece is noise, the model reads "allows Nxd4" as "wins a pawn".
    const winning = m => VALUE[m.captured] > VALUE[m.piece] || !attackersOf(chess, m.to, mover).length;
    const newTakes = legal.filter(m => m.captured && m.to !== to && !had.has(bare(m.san)) && winning(m)).slice(0, 3);
    if(newTakes.length) {
        salient = true;
        parts.push(`It newly allows ${SIDE[opp]} ${andList(newTakes.map(m => `${m.san} taking the ${NAMES[m.captured]} on ${m.to}${attackersOf(chess, m.to, mover).length ? '' : ' for free'}`))}.`);
    }
    const newChecks = legal.filter(m => /[+#]/.test(m.san) && !m.captured && !had.has(bare(m.san))).slice(0, 2);
    if(newChecks.length) { salient = true; parts.push(`It newly allows the ${SIDE[opp]} check ${list(newChecks.map(m => m.san))}.`); }
    const still = legal.filter(m => m.captured && m.to !== to && had.has(bare(m.san)) && winning(m)).slice(0, 2);
    if(still.length) { salient = true; parts.push(`${SIDE[opp]} can still play ${andList(still.map(m => `${m.san} taking the ${NAMES[m.captured]} on ${m.to}`))}.`); }
    if(!takers.length && salient) parts.push(`No ${SIDE[opp]} piece can take it on ${to}.`);
    if(engine) {
        const verdict = await engineNote(engine, beforeFen, chess.fen(), move, { nameMoves }).catch(() => null);
        if(verdict?.salient) salient = true;
        if(verdict?.text && salient) parts.push(verdict.text);
    }
    return salient ? parts.join(' ') : null;
}

function correction(san, fen, side) {
    const type = san[0].toLowerCase();
    const chess = new Chess(side === new Chess(fen).turn() ? fen : nullMove(fen));
    const own = allSquares().filter(s => chess.get(s)?.type === type && chess.get(s)?.color === side);
    if(!own.length) return `${san} is impossible, ${SIDE[side]} has no ${NAMES[type]}.`;
    const reach = [...new Set(chess.moves({ verbose: true }).filter(m => m.piece === type).map(m => m.to))];
    return `${san} is not a legal move for ${SIDE[side]} here. ${SIDE[side]}'s ${NAMES[type]}${own.length > 1 ? 's are' : ' is'} on ${andList(own)}`
        + (reach.length ? ` and can only go to ${andList(reach)}.` : ' and has no legal move.');
}

// ---------- spotting imagined moves in the stream ----------
const SAN = /(?<![A-Za-z0-9])(?:\d+\.(?:\.\.)?\s*)?(?:\.\.\.)?(O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=?[QRBN])?|[a-h][1-8](?:=?[QRBN])?)[+#]?(?=[\s,.;:!?)'"])/g;
const PHRASE = /\b(knight|bishop|rook|queen|king)\s+(?:on\s+([a-h][1-8])\s+)?(?:to|goes to|jumps to|lands on|moves to|went to|go to|comes to|came to)\s+([a-h][1-8])(?=[\s,.;:!?)])/gi;
const PUSH_CONTEXT = /\b(play|plays|played|playing|push|pushes|after|if|then|move|moves|reply|replies|answer|with)\W*$/i;
const PLACE = /\b(knight|bishop|rook|queen)\s+(?:lands\s+|landing\s+|sitting\s+|sits\s+)?on\s+([a-h][1-8])\s+(?:would|could|will|might)\b/gi;
const LETTER = { knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' };

export function questionMoves(fen, question) {
    const out = [];
    for(const m of String(question || '').matchAll(SAN)) {
        const hit = tryMove(fen, m[1]);
        if(hit) out.push(bare(hit.move.san));
    }
    return out;
}

// SAN of the moves between consecutive history positions, so replayed game moves are not "corrected".
export function historySans(fens) {
    const out = [];
    for(let i = 0; i + 1 < fens.length; i++) {
        const board = fens[i + 1].split(' ')[0];
        try {
            const move = new Chess(fens[i]).moves({ verbose: true }).find(m => { const c = new Chess(fens[i]); c.move(m.san); return c.fen().split(' ')[0] === board; });
            if(move) out.push(bare(move.san));
        } catch {}
    }
    return out;
}

export class Spotter {
    constructor(rootFen, { history = [], plies = [], promptText = '', targets = [], engine = null, nameMoves = true } = {}) {
        this.root = rootFen; this.line = []; this.lines = []; this.seen = new Set(); this.noted = new Set();
        this.plies = plies; this.history = new Set([...history, ...plies.map(ply => ply.san)]);
        this.promptText = promptText; this.targets = new Set(targets);
        this.visited = [rootFen, nullMove(rootFen)]; this.engine = engine; this.nameMoves = nameMoves;
        this.covered = new Set(); this.notedAt = -1e9; this.movedAt = -1e9;
    }
    // The imagined line Inkling is still talking about, or null once it has moved on.
    recentLine(at, span = 300) {
        if(!this.line.length || this.line.includes(null) || at - Math.max(this.notedAt, this.movedAt) >= span) return null;
        return { label: this.label(this.line).join(' '), fen: this.lineFen() };
    }
    fenOf(line) { let fen = this.root; for(const san of line) fen = san === null ? nullMove(fen) : tryMove(fen, san).chess.fen(); return fen; }
    lineFen() { return this.fenOf(this.line); }
    label(line) {
        let fen = this.root; const out = [];
        for(const san of line) {
            if(san === null) { fen = nullMove(fen); continue; }
            out.push(new Chess(fen).turn() === 'b' ? `...${san}` : san);
            fen = tryMove(fen, san).chess.fen();
        }
        return out;
    }
    // Returns a note, or null when the move needs nothing.
    async consider(san, isPush, { force = false, side = null } = {}) {
        const rootTurn = new Chess(this.root).turn();
        const fits = fen => !side || new Chess(fen).turn() === side;
        let line = null;
        // A move named in the question means the question's own move, even mid-line.
        const atRoot = fits(this.root) && tryMove(this.root, san);
        const preferRoot = atRoot && (force || this.targets.has(bare(atRoot.move.san)));
        // The current line first, then earlier lines (newest first), the root, and a threat line from the root.
        for(const base of preferRoot ? [[]] : [this.line, ...[...this.lines].reverse(), [], [null]]) {
            if(base.filter(Boolean).length >= 3 || !fits(this.fenOf(base))) continue;
            const hit = tryMove(this.fenOf(base), san);
            if(hit) { line = [...base, hit.move.san]; break; }
        }
        if(!line) {
            if(isPush || !/^[KQRBN]/.test(san) || this.history.has(bare(san))) return null;
            // "Nd7" for a knight already standing on d7 is a location, not a move.
            const dest = san.match(/([a-h][1-8])[+#]?$/)?.[1];
            if(dest && [this.root, this.lineFen()].some(fen => new Chess(fen).get(dest)?.type === san[0].toLowerCase())) return null;
            // Moves quoted from engine lines or reachable after a skipped reply are real, just not tracked.
            if(this.promptText.includes(san)) return null;
            for(const fen of [this.lineFen(), ...this.visited]) {
                if(tryMove(fen, san) || new Chess(fen).moves().some(reply => tryMove(tryMove(fen, reply).chess.fen(), san))) return null;
            }
            const key = `bad:${san}`;
            if(this.seen.has(key)) return null;
            this.seen.add(key);
            return correction(san, this.root, rootTurn);
        }
        const plies = line.filter(Boolean).length;
        if(plies > 3) return null;
        this.line = line; this.lines.push(line);
        let fen = this.root, last, beforeFen;
        for(const s of line) { if(s === null) { fen = nullMove(fen); continue; } beforeFen = fen; last = tryMove(fen, s); fen = last.chess.fen(); }
        this.visited.push(fen, nullMove(fen));
        if(this.seen.has(fen)) return null;
        this.seen.add(fen);
        // Threat lines start from an illegal null-move board, so the engine has nothing fair to say there.
        const real = line[0] !== null;
        const key = last.move.from + last.move.to;
        if(!real && this.noted.has(key)) return null;
        const target = real && plies === 1 && (force || this.targets.has(bare(last.move.san)));
        const note = await factsAfter(this.label(line), last.chess, last.move, beforeFen,
            { engine: real ? this.engine : null, force: target, nameMoves: this.nameMoves });
        if(note) { this.noted.add(key); if(target) this.covered.add(bare(last.move.san)); }
        return note;
    }
}

export async function spot(thought, from, spotter) {
    const text = thought.slice(from), found = [];
    // "28.g3" is White's move and "28...Qd2" or "...Qd2" Black's, so a quoted engine line is followed on the right side.
    for(const m of text.matchAll(SAN)) {
        const numbered = /^\d+\./.test(m[0]), side = /^\d*\.\.\./.test(m[0].replace(/\s+/g, '')) ? 'b' : numbered ? 'w' : null;
        found.push({ index: m.index, end: m.index + m[0].length, san: m[1], side, numbered, isPush: /^[a-h][1-8]/.test(m[1]) && !m[1].includes('x') });
    }
    for(const m of text.matchAll(PHRASE))
        found.push({ index: m.index, end: m.index + m[0].length, san: LETTER[m[1].toLowerCase()] + (m[2] || '') + m[3], isPush: false,
            pastVerb: /\b(went|came) to\b/i.test(m[0]) });
    // "a knight on d5 would ..." is a hypothetical placement, never worth a correction if it is not a real move.
    for(const m of text.matchAll(PLACE))
        found.push({ index: m.index, end: m.index + m[0].length, san: LETTER[m[1].toLowerCase()] + m[2], isPush: true, place: true });
    found.sort((a, b) => a.index - b.index);
    for(const f of found) {
        // A move from the game so far is history, never an imagined move, even when it would be legal again now.
        const mention = pastMention(thought, from + f.index, from + f.end)
            || (f.pastVerb && !/\b(?:if|would|could)\b[^.!?\n]*$/i.test(thought.slice(Math.max(0, from + f.index - 60), from + f.index)) ? { strong: false } : null);
        const past = pastCheck(f.san, mention, spotter.plies, spotter.seen);
        if(past?.text) return { end: from + f.end, trigger: f.san, text: past.text, past: true };
        if(past) continue;
        const before = thought.slice(Math.max(0, from + f.index - 24), from + f.index);
        if(f.isPush && !f.place && !f.numbered && !PUSH_CONTEXT.test(before)) continue;
        // Squares named as plain locations like "knight on c3".
        if(/\b(on|at|from|square|squares)\s*$/i.test(before) && !/^[KQRBN]/.test(f.san)) continue;
        const tracked = spotter.lines.length;
        const note = await spotter.consider(f.san, f.isPush, { side: f.side });
        if(spotter.lines.length > tracked) spotter.movedAt = from + f.end;
        if(note) return { end: from + f.end, trigger: f.san, text: note };
    }
    return found.length ? { end: from + found.at(-1).end, text: null } : null;
}

// Inkling asks itself short board questions mid-thought ("Is d4 defended?"). Answer the concrete ones.
export function selfQuestion(thought, from, spotter) {
    const end = thought.lastIndexOf('?');
    if(end < from) return null;
    const start = Math.max(from, thought.slice(0, end).search(/[^.!?\n:]*$/));
    const question = thought.slice(start, end + 1).trim();
    // Questions that name a time (the last move, a board after some moves, before a move, or "right now") get that board or nothing.
    if(question.length <= 140) {
        const timed = timeQuestion(question, { rootFen: spotter.root, plies: spotter.plies, line: spotter.recentLine(start) });
        if(timed?.text) return { end: end + 1, trigger: question, text: timed.text, question: true };
        if(timed) return null;
    }
    if(question.length > 110 || /\bif\b|;|\b(after|once|would|empty|gone|then)\b/i.test(question) || new Set(question.match(/\b[a-h][1-8]\b/g)).size > 3
        || !/\b[a-h][1-8]\b|\b(queen|rook|bishop|knight|king)\b/i.test(question)) return null;
    if(!/\b(defended|protected|guarded|attacked|pinned|safe|hanging|loose|in check|attacks?|hits?|eyes?|sees?|guards?|defends?|protects?|reach(?:es)?)\b/i.test(question)) return null;
    const current = { label: 'Current board', chess: new Chess(spotter.root) };
    const line = spotter.recentLine(start);
    let reply;
    if(!line) reply = answerQuestion(question, [current]);
    else {
        // Mid-line the question may be about the imagined board or the real one. Only a fact that holds on the board it can
        // only mean, or on both alike, is answered. Anything else could put a fact on the wrong board.
        const lined = { label: `Board after ${line.label}`, chess: new Chess(line.fen) };
        const onLine = answerQuestion(question, [lined]), onCurrent = answerQuestion(question, [current]);
        const facts = answer => answer?.text.replace(/^[^:]+:\s*/, '');
        if(onLine && onCurrent && facts(onLine) === facts(onCurrent))
            reply = { text: `Board after ${line.label}, same as on the current board: ${facts(onLine)}` };
        else if(onLine && !onCurrent) reply = onLine;
        else return null;
    }
    if(!reply) return null;
    // "Queen e3 attacks e1?" about a square a queen could move to is a hypothetical, not a misidentified piece.
    const missing = reply.text.match(/there is no (\w+) on ([a-h][1-8])/);
    if(missing) {
        const type = ({ knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k', pawn: 'p' })[missing[1]];
        const fens = [spotter.root, ...spotter.visited.filter((_, i) => i % 2 === 0)];
        if(fens.some(fen => new Chess(fen).moves({ verbose: true }).some(m => m.to === missing[2] && m.piece === type))) return null;
    }
    return { end: end + 1, trigger: question, text: reply.text, question: true };
}

// The move Inkling settles on at the end of its thinking, checked once more before it answers.
const VERDICT = /\b(?:recommend(?:ing)?|suggest(?:ing)?|best (?:move )?is|go with|should play|i'?d play|the move is|answer(?: is)?:?|so)\s+(?:\d+\.(?:\.\.)?\s*)?(?:\.\.\.)?(O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=?[QRBN])?|[a-h][1-8](?:=?[QRBN])?)[+#]?/gi;
export function finalChoice(thought, rootFen) {
    const tail = thought.slice(-500);
    const picks = [...tail.matchAll(VERDICT)].map(m => m[1]).filter(san => tryMove(rootFen, san));
    return picks.at(-1) || null;
}

// ---------- guards ----------
// Token ids for "[" and " [" in Inkling's vocabulary. Banned while notes exist so it cannot write its own.
export const BRACKET_BIAS = [[58, false], [196989, false]];
export const END_MESSAGE = 200010, END_TURN = 200006;
const WRAPPER = 'Rule-checked future board, not the current one.';
export const PRIVATE = '\nThe bracketed checks above are my private scratch work, the player cannot see them. In the reply I coach: I explain WHY in concrete board terms, which piece, which square, what it attacks, what the opponent wants and what the move stops. '
    + '"Good move" or "develops" or "controls the center" is never the explanation by itself. When a check shows that a move loses material or allows mate, I say so plainly and show the reply that punishes it. I use the checked lines only as support, quote at most one short line, and never mention checks, notes, brackets, evidence or Stockfish. '
    + 'I never guess what move was just played.\n';
const FLAGGED = /^Board after ((?:\.\.\.)?\S+): .*Engine: (an inaccuracy|a mistake|a serious mistake|this allows)/;
const THREAT = /^Threat check: if (?:White|Black) could move now, (\S+) would (lead to mate|win [^(]+?) \(/;
// Moves from the current board that the checks showed losing, restated at the end so the reply never sells them as good ideas.
// A real opponent threat is the headline of the reply, so it is restated first.
export function flaggedReminder(checks) {
    const threat = checks.map(c => c.note.match(THREAT)).find(Boolean);
    const lead = threat ? `The most urgent thing is the threat ${threat[1]}, which would ${threat[2]}. My reply starts with it and how to meet it.\n` : '';
    const bad = [...new Set(checks.filter(c => !c.question).map(c => c.note.match(FLAGGED)?.[1]).filter(Boolean))];
    if(!bad.length) return lead;
    return lead + `My checks showed that ${andList(bad)} ${bad.length > 1 ? 'are mistakes' : 'is a mistake'} here. If I bring ${bad.length > 1 ? 'them' : 'it'} up, I warn against ${bad.length > 1 ? 'them' : 'it'} and show the reply that punishes ${bad.length > 1 ? 'them' : 'it'}, never as a good idea.\n`;
}
const FORGE = /\[\s*(Verified|Board after|Checked|Rule-checked)|Verified by the move generator|real future board|Rule-checked future board|\[\s*Rule-checked,|\bEngine: (this|about|fine|a bit|an inaccuracy|a mistake|a serious)|\bThreat check:/i;

// A verbatim quote of a real note, or part of one, is fine. Anything else in note format is invented evidence.
export function forgery(text, wrappers) {
    let covered = -1;
    for(const m of text.matchAll(new RegExp(FORGE.source, 'gi'))) {
        if(m.index < covered) continue;
        const tail = text.slice(m.index).replace(/^\[\s*/, '');
        let span = 0;
        for(const w of wrappers) {
            const i = w.indexOf(tail.slice(0, Math.min(tail.length, 30)));
            if(i < 0) continue;
            const rest = w.slice(i);
            let common = 0;
            while(common < tail.length && common < rest.length && tail[common] === rest[common]) common++;
            // Still streaming the quote, or the quote stopped cleanly at a word boundary.
            if(common === tail.length || common === rest.length || (common >= 12 && !/[A-Za-z0-9]/.test(tail[common]) && !/[A-Za-z0-9]/.test(rest[common]))) { span = common; break; }
        }
        if(!span) return m;
        covered = m.index + span + 1;
    }
    return null;
}

// ---------- answer cleanup ----------
const SOURCE = '(?:supplied|provided|given|attached|available)\\s+(?:evidence|facts|data|information|notes|board facts)';
const capitalize = text => text.replace(/^([a-z])(?=[a-z])/, c => c.toUpperCase());
// Evidence ids like (F1) or [L1, Q2] mean nothing to the player.
const REF = '(?:[A-Z]\\d{1,2}|C\\.[a-z]+)';
export const stripRefs = text => String(text).replace(new RegExp(`\\s*[\\[(]${REF}(?:\\s*,\\s*${REF})*[\\])]`, 'g'), '');
// "The supplied evidence shows..." talks about the prompt instead of the chess. Used for every answer.
export function cleanEvidenceTalk(text) {
    return stripRefs(text)
        .replace(/\bthe (?:supplied|provided|given|attached) (?:engine )?lines\b/gi, 'the engine lines')
        // Bare ids the brackets missed: "F1: ...", "L1/L2 point to", and a list cut off at the end like "(F7, F11".
        .replace(new RegExp(`(^|\\n|[.!?]\\s+)${REF}(?:\\s*[/,&]\\s*${REF})*\\s*:\\s*`, 'g'), '$1')
        .replace(new RegExp(`\\s*[\\[(]\\s*${REF}(?:\\s*,\\s*${REF})*,?\\s*(?=$|\\n)`, 'g'), '')
        .replace(/(^|[.!?]\s+|\n)?\bL\d{1,2}(\s*(?:\/|,|and|&)\s*L\d{1,2})*\b/g, (_, lead, more) => lead === undefined
            ? `the engine line${more ? 's' : ''}` : `${lead}The engine line${more ? 's' : ''}`)
        .replace(/\b(engine) (?:evidence|data|facts)\b/gi, '$1')
        .replace(new RegExp(`(^|[.!?]\\s+|\\n)(?:according to|per|based on|from|going by|looking at) the ${SOURCE},?\\s*`, 'gi'), (_, lead) => lead + '\u0000')
        .replace(new RegExp(`,?\\s*(?:according to|per|based on|going by) the ${SOURCE}\\b`, 'gi'), '')
        .replace(new RegExp(`(^|[.!?]\\s+|\\n)the ${SOURCE}\\s+(?:says?|shows?|confirms?|points? out|notes?|indicates?|mentions?|tells? us|lists?)(?: that)?\\s*`, 'gi'), (_, lead) => lead + '\u0000')
        .replace(new RegExp(`\\bthe ${SOURCE}\\b`, 'gi'), 'the position')
        .replace(/\u0000(\S+)/g, (_, word) => /^[a-h][1-8]/.test(word) ? word : capitalize(word));
}

// Sentences that talk about the private notes instead of the chess.
const LEAK = /threat check|verified|move generator|rule-checked|future board|checked (board|lines?)|without checking|scratch work|the notes?\b|\b(your|my) notes?\b|engine notes?\b|notes?\s+(say|said|show)|bracket/i;
export function cleanCoachAnswer(text) {
    text = cleanEvidenceTalk(text).replace(/,?\s*(per|according to|from|in) the (engine |checked )?notes?\b/gi, '').replace(/\bengine notes?\b/gi, 'engine');
    // "..." before a move is notation, not a sentence end.
    return text.split(/\n/).map(paragraph => (paragraph.match(/(?:[^.!?]|\.{3}(?=[KQRBNa-hO])|(?<=\d)\.(?=[KQRBNa-hO\d]))+[.!?]*["')]*\s*/g) || [paragraph])
        .filter(sentence => !LEAK.test(sentence)).join('').trim()).filter((p, i, all) => p || (i && all[i - 1])).join('\n').trim();
}

// ---------- the live loop ----------
const ANSWER_PREFIX = '<|end_message|><|message_model|><|content_text|>';
export const THINK_PREFIX = '<|message_model|><|content_thinking|>';
const MAX_NOTES = 5, MAX_ANSWERS = 4, MAX_FORGERIES = 3, VISIBLE_LAG = 40;

/**
 * One thinking-and-answer turn with live evidence.
 * complete({ prompt, n_predict, temperature, seed, logit_bias, signal, onData }) streams llama-server /completion events
 * ({ content, tokens, stop, stop_type }) and settles when the stream ends or is aborted.
 * Callbacks: onThought(text) for visible thinking, onCheck(note), onAnswer(delta), onFirstToken().
 */
export async function liveThinking({ complete, prompt, rootFen, question = '', history = [], promptText = '', engine = null,
    thinkBudget, answerBudget, room, temperature = 0.3, seed = 42, nameMoves = true, signal,
    onThought = () => {}, onCheck = () => {}, onAnswer = () => {}, onFirstToken = () => {} }) {
    const targets = questionMoves(rootFen, question);
    const plies = gamePlies(history, rootFen);
    const spotter = new Spotter(rootFen, { history: historySans(history), plies, promptText, targets, engine, nameMoves });
    engine?.warm?.(rootFen);
    // Started now so the search overlaps with the first tokens, injected once the first thought sentence is done.
    let threatNote = engine && !targets.length && THREAT_QUESTION.test(question)
        ? rootThreat(engine, rootFen).catch(() => null) : null;
    // A question about the move just played gets what that move did, read off the real boards.
    let lastMoveNote = null;
    if(asksLastMove(question, plies, rootFen)) {
        lastMoveNote = pastNote(plies.at(-1));
        spotter.seen.add(`past:${plies.at(-1).afterFen}`);
    }
    const claimed = new Set(), given = new Set(), moved = new Set();
    const base = prompt + THINK_PREFIX;
    let thought = '', answer = '', phase = 'think', thinkTokens = 0, answerTokens = 0, extraChars = 0, notes = 0, answered = 0, forged = 0;
    let scanFrom = 0, guardFrom = 0, questionFrom = 0, claimFrom = 0, moveFrom = 0, posted = 0, finalChecked = false, firstToken = false, finishReason = 'stop';
    const wrappers = [], checks = [];
    const used = () => thinkTokens + answerTokens + Math.ceil(extraChars / 3);
    const showThought = (all = false) => {
        const upto = all ? thought.length : thought.length - VISIBLE_LAG;
        if(upto > posted) { onThought(thought.slice(posted, upto)); posted = upto; }
    };
    const addNote = (note, { end = thought.length, trigger, question: isQuestion = false, past = false, final = false } = {}) => {
        thought = thought.slice(0, Math.max(end, posted));
        showThought(true);
        const wrapper = trigger === 'threat' ? `Rule-checked, current board. ${note}]` : past ? `Rule-checked, real game history. ${note}]`
            : isQuestion ? `Rule-checked, ${note}]` : `${WRAPPER} ${note}]`;
        thought += `\n[${wrapper}\n`;
        posted = thought.length;
        extraChars += wrapper.length + 3;
        wrappers.push(wrapper);
        checks.push({ trigger, note, question: isQuestion, past, final });
        onCheck(note);
        scanFrom = guardFrom = questionFrom = claimFrom = moveFrom = thought.length;
        if(!isQuestion && !past) spotter.notedAt = thought.length;
    };
    const closeThinking = () => {
        phase = 'answer';
        showThought(true);
        if(wrappers.length) {
            const reminder = PRIVATE + flaggedReminder(checks);
            thought += reminder; posted = thought.length; extraChars += reminder.length;
        }
    };

    while(true) {
        signal?.throwIfAborted();
        const thinking = phase === 'think';
        const left = thinking ? thinkBudget - thinkTokens : answerBudget - answerTokens;
        const nPredict = Math.max(16, Math.min(left, room - used()));
        const controller = new AbortController();
        const queue = [];
        let wake = null, ended = false, failure = null;
        const request = complete({ prompt: thinking ? base + thought : base + thought + ANSWER_PREFIX + answer,
            n_predict: nPredict, temperature, seed: seed + wrappers.length + 100 * forged,
            logit_bias: thinking && wrappers.length ? BRACKET_BIAS : [],
            signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
            onData: event => { queue.push(event); wake?.(); } })
            .catch(error => { if(!controller.signal.aborted || signal?.aborted) failure = error; })
            .finally(() => { ended = true; wake?.(); });
        // Events queue up while a scan waits for the engine, so the stream never has to pause per token.
        let stop = null;
        while(!stop) {
            if(!queue.length) {
                if(ended) break;
                await new Promise(resolve => { wake = resolve; });
                wake = null;
                continue;
            }
            const event = queue.shift(), tokens = event.tokens || [];
            if(!firstToken) { firstToken = true; onFirstToken(); }
            if(!thinking) {
                answerTokens += Math.max(1, tokens.length);
                if(tokens.includes(END_MESSAGE) || tokens.includes(END_TURN)) { stop = { done: true }; break; }
                const delta = event.content || '';
                answer += delta;
                if(delta) onAnswer(delta);
                if(event.stop) { stop = { done: true }; if(event.stop_type === 'limit') finishReason = 'length'; }
                continue;
            }
            thinkTokens += Math.max(1, tokens.length);
            if(tokens.includes(END_MESSAGE) || tokens.includes(END_TURN)) { stop = { end: true }; break; }
            thought += event.content || '';
            if(wrappers.length) {
                const fake = forgery(thought.slice(guardFrom), wrappers);
                if(fake) { thought = thought.slice(0, Math.max(posted, guardFrom + fake.index)); stop = { forged: true }; break; }
            }
            if(threatNote && thought.length >= 60 && /[.!?:]\s$|\n$/.test(thought)) {
                const note = await threatNote;
                threatNote = null;
                if(note) { stop = { note, end: thought.length, trigger: 'threat' }; break; }
            }
            if(lastMoveNote && !threatNote && thought.length >= 60 && /[.!?:]\s$|\n$/.test(thought)) {
                stop = { note: lastMoveNote, end: thought.length, trigger: 'last move', past: true };
                lastMoveNote = null;
                break;
            }
            if(notes < MAX_NOTES && used() + 200 < room) {
                const hit = await spot(thought, scanFrom, spotter);
                if(hit) scanFrom = hit.end;
                if(hit?.text) {
                    // The opponent's threat is the headline of a danger question, so it goes in before any move note.
                    const threat = threatNote && await threatNote;
                    threatNote = null;
                    stop = { note: hit.text, end: hit.end, trigger: hit.trigger, past: Boolean(hit.past), ...(threat ? { threat } : {}) };
                    break;
                }
            }
            if(answered < MAX_ANSWERS && used() + 200 < room && (event.content || '').includes('?')) {
                const hit = selfQuestion(thought, questionFrom, spotter);
                questionFrom = thought.length;
                // Asking the same thing again gets nothing new, the answer is already in the thinking above.
                if(hit && !given.has(hit.text)) { given.add(hit.text); answered++; stop = { note: hit.text, end: hit.end, trigger: hit.trigger, question: true }; break; }
            }
            if(answered < MAX_ANSWERS && used() + 200 < room && /[.!\n]/.test(event.content || '')) {
                const hit = currentClaim(thought, claimFrom, rootFen, { lastLineAt: Math.max(spotter.notedAt, spotter.movedAt), checked: claimed });
                claimFrom = Math.max(claimFrom, thought.search(/[^.!?\n]*$/));
                if(hit && !given.has(hit.text)) { given.add(hit.text); answered++; stop = { note: hit.text, end: hit.end, trigger: hit.trigger, question: true }; break; }
            }
            // Claims about what a named move does ("...Re5 can be taken by the bishop on d5"), checked once the sentence ends.
            if(answered < MAX_ANSWERS && used() + 200 < room && /[.!?]\s$|\n$/.test(thought)) {
                const hit = moveClaim(thought, moveFrom, rootFen, { lineFen: spotter.recentLine(thought.length)?.fen, checked: moved });
                moveFrom = thought.length;
                if(hit && !given.has(hit.text)) { given.add(hit.text); answered++; stop = { note: hit.text, end: hit.end, trigger: hit.trigger, question: true }; break; }
            }
            if(event.stop || thinkTokens >= thinkBudget) { stop = { end: true }; break; }
            showThought();
        }
        controller.abort();
        await request;
        if(signal?.aborted) throw signal.reason || new DOMException('Cancelled.', 'AbortError');
        if(failure) throw failure;

        if(!thinking) {
            if(stop?.done || answerTokens >= answerBudget || used() >= room || queue.length === 0 && ended) {
                if(!stop?.done) finishReason = 'length';
                break;
            }
            continue;
        }
        if(stop?.note) {
            if(stop.threat) { addNote(stop.threat, { end: stop.end, trigger: 'threat' }); stop.end = thought.length; }
            if(stop.question) addNote(stop.note, { end: stop.end, trigger: stop.trigger, question: true });
            else if(stop.past) { notes++; addNote(stop.note, { end: stop.end, trigger: stop.trigger, past: true }); }
            else { notes++; addNote(stop.note, { end: stop.end, trigger: stop.trigger }); }
            if(thinkBudget < 1400) thinkBudget += stop.question ? 60 : 120;
            // Once every move the player asked about has its note, the facts are in and a short wrap-up is enough.
            if(targets.length && targets.every(t => spotter.covered.has(t))) thinkBudget = Math.min(thinkBudget, thinkTokens + 400);
            continue;
        }
        if(stop?.forged) {
            if(++forged > MAX_FORGERIES) closeThinking();
            scanFrom = Math.min(scanFrom, thought.length);
            questionFrom = Math.min(questionFrom, thought.length);
            continue;
        }
        // Thinking is over. One last look at the move it settled on, if nobody checked it yet.
        if(!finalChecked && engine && used() + 300 < room) {
            finalChecked = true;
            const pick = finalChoice(thought, rootFen), hit = pick && tryMove(rootFen, pick);
            if(hit && !spotter.noted.has(hit.move.from + hit.move.to)) {
                const note = await spotter.consider(hit.move.san, false, { force: true });
                if(note && /Engine: (an inaccuracy|a mistake|a serious mistake|this allows)/.test(note)) {
                    addNote(note, { trigger: pick, final: true });
                    thinkBudget = thinkTokens + 250;
                    continue;
                }
            }
        }
        closeThinking();
    }
    return { thought, answer: wrappers.length ? cleanCoachAnswer(answer.trim()) : cleanEvidenceTalk(answer.trim()), raw: answer.trim(),
        checks, thinkTokens, answerTokens, tokens: thinkTokens + answerTokens, finishReason };
}