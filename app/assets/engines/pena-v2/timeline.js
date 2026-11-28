// The game so far, for questions about the past ("what did I do wrong", "when did it go wrong", "gg").
// Training data and the browser build these notes with the same functions, so Pena reads the past the same way in both.
import { Chess } from '../libraries/chessjs/chess.js';
import { sanLine, numberedLine } from './factsheet.js';

const sides = { w: 'White', b: 'Black' };
const other = color => color === 'w' ? 'b' : 'w';
const severity = { Catastrophic: 4, Blunder: 3, Mistake: 2, Inaccuracy: 1 };
const red = '#ff6b6b', green = '#69db7c';

// Pawns as a number from White's side, a mate counts as a decided game.
export function whiteValue(score, turn) {
    if(!score) return 0;
    const value = score.mate !== null && score.mate !== undefined ? (score.mate > 0 ? 3000 : -3000) : score.cp ?? 0;
    return turn === 'w' ? value : -value;
}

function standing(value, color) {
    const mine = color === 'w' ? value : -value;
    const size = Math.abs(mine);
    if(size < 60) return 'equal';
    const word = size < 150 ? 'slightly better' : size < 350 ? 'better' : 'winning';
    if(mine > 0) return word;
    return word === 'winning' ? 'losing' : word.replace('better', 'worse');
}

const view = (color, playerColor) => playerColor ? (color === playerColor ? 'you' : 'the opponent') : sides[color];
const standingText = (value, playerColor) => {
    const words = standing(value, playerColor || 'w');
    if(words === 'equal') return 'equal';
    return `${playerColor ? 'you were' : 'White was'} ${words}`;
};

/**
 * Board result when the board itself shows the end. Resignations and flags never reach the board,
 * so those stay unknown and Pena hears about them from the player.
 */
export function boardResult(fen) {
    const board = new Chess(fen);
    if(board.in_checkmate()) return { over: true, winner: other(board.turn()), reason: 'checkmate' };
    if(board.in_stalemate()) return { over: true, winner: null, reason: 'stalemate' };
    if(board.insufficient_material()) return { over: true, winner: null, reason: 'insufficient material' };
    return { over: false };
}

/**
 * Grades every move of a game. fens runs from the first position to the current one.
 * engine is { lines(fen, { depth, multipv, isCurrent }), compare(best, played, forced, runner) }, the same shape the chat uses.
 * Each position is searched once, the next search doubles as the score of the move that led there.
 * @returns {Promise<{ ply: number, color: 'w'|'b', san: string, uci: string, beforeFen: string, label: string, reason: string,
 *   bestUci: string|null, pv: string[], value: number }[]>}
 */
export async function gradeGame(engine, fens, { depth = 12, known = [], isCurrent = () => true } = {}) {
    const moves = [...known];
    const search = async fen => {
        if(!isCurrent()) throw new DOMException('Game grading cancelled', 'AbortError');
        const board = new Chess(fen);
        if(board.game_over()) return { board, lines: [] };
        const lines = await engine.lines(fen, { depth, multipv: Math.min(2, board.moves().length), isCurrent });
        if(!isCurrent()) throw new DOMException('Game grading cancelled', 'AbortError');
        return { board, lines };
    };
    let current = fens.length > known.length ? await search(fens[known.length]) : null;
    for(let index = known.length; index < fens.length - 1; index++) {
        const next = await search(fens[index + 1]);
        const played = findMove(fens[index], fens[index + 1]);
        const [best, runner] = current.lines;
        if(!played || !best) { current = next; continue; }
        const uci = played.from + played.to + (played.promotion || '');
        const reply = next.lines[0]?.score;
        const mated = next.board.in_checkmate();
        const score = mated ? { cp: null, mate: 1 } : next.board.game_over() ? { cp: 0, mate: null }
            : { cp: reply?.cp == null ? null : -reply.cp, mate: reply?.mate == null ? null : -reply.mate };
        const forced = current.board.moves().length === 1;
        const grade = engine.compare({ ...best.score, move: best.move, depth: best.depth }, { ...score, move: uci, depth: best.depth },
            forced, runner ? { ...runner.score, move: runner.move, depth: runner.depth } : null);
        moves.push({ ply: index + 1, color: played.color, san: played.san, uci, beforeFen: fens[index], label: grade.label,
            reason: grade.reason, bestUci: best.move, pv: best.pv || [best.move], value: mated ? (played.color === 'w' ? 3000 : -3000) : whiteValue(score, played.color) });
        current = next;
    }
    return moves;
}

function findMove(before, after) {
    const board = new Chess(before);
    const target = after.split(' ').slice(0, 4).join(' ');
    for(const move of board.moves({ verbose: true })) {
        board.move(move);
        const match = board.fen().split(' ').slice(0, 4).join(' ') === target;
        board.undo();
        if(match) return move;
    }
    return null;
}

const moveNumber = fen => Number(fen.split(' ')[5]) || 1;
const cleanReason = reason => reason ? ` (${reason.replace(/\.$/, '').replace(/’/g, "'")})` : '';

// A whole game in a few words: how the balance moved and how many slips each side made.
function story(moves, playerColor, result) {
    const segments = [];
    for(const move of moves) {
        const words = standingText(move.value, playerColor);
        if(segments.at(-1)?.words === words) continue;
        segments.push({ words, move });
    }
    // Short swings that came straight back are noise, a game story keeps the lasting ones.
    const lasting = segments.filter((segment, index) => {
        const next = segments[index + 1];
        return !next || next.move.ply - segment.move.ply >= 4 || index === segments.length - 1;
    }).filter((segment, index, list) => index === 0 || segment.words !== list[index - 1].words);
    const parts = lasting.slice(-5).map((segment, index) => index === 0 && segment.move.ply <= 2 ? `${segment.words} from the start`
        : `${segment.words} after ${numberedLine(segment.move.beforeFen, sanLine(segment.move.beforeFen, [segment.move.uci], 1))}`);
    const plural = { Catastrophic: 'catastrophic moves', Blunder: 'blunders', Mistake: 'mistakes', Inaccuracy: 'inaccuracies' };
    const count = color => {
        const tally = Object.keys(severity).map(label => [label, moves.filter(move => move.color === color && move.label === label).length])
            .filter(([, amount]) => amount);
        return tally.length ? tally.map(([label, amount]) => amount === 1 ? `1 ${label === 'Catastrophic' ? 'catastrophic move' : label.toLowerCase()}`
            : `${amount} ${plural[label]}`).join(', ') : 'no clear slips';
    };
    const sidesText = playerColor ? `you made ${count(playerColor)}, the opponent ${count(other(playerColor))}`
        : `White made ${count('w')}, Black ${count('b')}`;
    const ending = result?.over ? `, the game ended in ${result.winner ? `${result.reason} for ${view(result.winner, playerColor)}` : `a draw by ${result.reason}`}` : '';
    return `over ${Math.ceil(moves.length / 2)} moves the balance went ${parts.join(', then ') || 'nowhere much'}${ending}. In graded moves ${sidesText}`;
}

function moment(move, playerColor, moves) {
    const [played] = sanLine(move.beforeFen, [move.uci], 1);
    const better = move.bestUci && move.bestUci !== move.uci ? sanLine(move.beforeFen, move.pv?.[0] === move.bestUci ? move.pv : [move.bestUci], 3) : [];
    const before = moves.find(item => item.ply === move.ply - 1);
    const answer = moves.find(item => item.ply === move.ply + 1);
    const who = view(move.color, playerColor);
    const from = before && standingText(before.value, playerColor), to = standingText(move.value, playerColor);
    const swing = !before ? '' : from === to ? ', the balance did not change' : `, the balance went from ${from} to ${to}`;
    let text = `move ${moveNumber(move.beforeFen)}, ${who} played ${numberedLine(move.beforeFen, [played])}, rated ${move.label}${cleanReason(move.reason)}`
        + `${better.length ? `, ${numberedLine(move.beforeFen, better.slice(0, 1))} was better${better.length > 1 ? ` with the line ${numberedLine(move.beforeFen, better)}` : ''}` : ''}${swing}`;
    const line = [played, ...better];
    // When the opponent slipped, what the player did next decides whether the chance was taken.
    if(playerColor && move.color !== playerColor && answer) {
        const [reply] = sanLine(answer.beforeFen, [answer.uci], 1);
        if(reply) {
            const taken = !severity[answer.label];
            text += `, you answered ${numberedLine(answer.beforeFen, [reply])}, rated ${answer.label}, ${taken ? 'taking the chance' : 'missing the chance'}`;
            line.push(reply);
        }
    }
    return { kind: 'game moment', side: move.color, weight: 0, line, text,
        moment: { fen: move.beforeFen, played, better, number: moveNumber(move.beforeFen) },
        references: { squares: [], regions: [], relations: [], moves: [], frames: [] } };
}

/**
 * Picks the moments worth talking about: the player's worst slips, the opponent's biggest slip and
 * whether it was punished, and the largest swing when the game had no real mistakes.
 */
export function timelineFacts(moves, { playerColor = null, result = null, limit = 3, focus = [], opening = false, keep = [] } = {}) {
    if(!moves?.length) return [];
    const ranked = color => moves.filter(move => move.color === color && severity[move.label])
        .sort((a, b) => severity[b.label] - severity[a.label] || a.ply - b.ply);
    const kept = keep.map(ply => moves.find(move => move.ply === ply)).filter(Boolean);
    // Moments already shown in this chat keep their tags, so "H1" means the same move for the whole conversation.
    limit = Math.min(4, Math.max(limit, kept.length + focus.length));
    const picked = [...kept];
    const add = move => move && !picked.includes(move) && picked.length < limit && picked.push(move);
    // Moves the player pointed at come first, then the ones that mattered most.
    focus.forEach(add);
    if(playerColor) {
        ranked(playerColor).slice(0, 2).forEach(add);
        add(ranked(other(playerColor))[0]);
        ranked(playerColor).slice(2).forEach(add);
    } else for(const move of [...ranked('w'), ...ranked('b')].sort((a, b) => severity[b.label] - severity[a.label])) add(move);
    if(!picked.length) {
        const swings = moves.slice(1).map((move, index) => ({ move, change: Math.abs(move.value - moves[index].value) }))
            .sort((a, b) => b.change - a.change);
        if(swings[0]?.change >= 80) add(swings[0].move);
    }
    const facts = [{ id: 'H0', kind: 'game story', side: null, weight: 0, line: [], text: story(moves, playerColor, result) + (opening ? openingText(moves, playerColor) : ''),
        references: { squares: [], regions: [], relations: [], moves: [], frames: [] } }];
    const fresh = picked.slice(kept.length).sort((a, b) => a.ply - b.ply);
    [...kept, ...fresh].forEach((move, index) => facts.push({ id: `H${index + 1}`, ply: move.ply, ...moment(move, playerColor, moves) }));
    return facts;
}

const openingMoves = 12;
// How the first moves went, for "was my opening ok".
function openingText(moves, playerColor) {
    const early = moves.filter(move => moveNumber(move.beforeFen) <= openingMoves && (!playerColor || move.color === playerColor));
    const slips = early.filter(move => severity[move.label]);
    const last = moves.filter(move => moveNumber(move.beforeFen) <= openingMoves).at(-1);
    const after = last ? `, after move ${Math.min(openingMoves, moveNumber(last.beforeFen))} ${standingText(last.value, playerColor)}` : '';
    return `. In the first ${openingMoves} moves ${playerColor ? 'you' : 'the players'} made ${slips.length ? slips.map(move => `${/^[aeiou]/i.test(move.label) ? 'an' : 'a'} ${move.label.toLowerCase()} with ${move.san} on move ${moveNumber(move.beforeFen)}`).join(', ') : 'no clear slips'}${after}`;
}

const openingAsk = /\b(?:my|the|this) opening\b|\bopening (?:moves|phase)\b|\bfirst (?:few |\d+ )?moves\b|\bstart of the game\b/i;
const sanAsk = /\b(O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|[a-h][1-8])\b/g;

// The moves a message points at: "move 14", "when I played Nd5", "the opening".
function focusOf(message, moves, playerColor) {
    const text = String(message || '');
    const focus = [];
    const mine = list => list.filter(move => !playerColor || move.color === playerColor);
    for(const match of text.matchAll(/\bmove (\d{1,3})\b/gi)) {
        const at = moves.filter(move => moveNumber(move.beforeFen) === Number(match[1]));
        focus.push((mine(at)[0] || at[0]));
    }
    for(const match of text.matchAll(sanAsk)) {
        const san = match[1].replace(/[+#]/g, '');
        const played = moves.filter(move => move.san.replace(/[+#]/g, '') === san);
        focus.push(mine(played).at(-1) || played.at(-1));
    }
    const opening = openingAsk.test(text);
    if(opening) focus.push(mine(moves.filter(move => moveNumber(move.beforeFen) <= openingMoves && severity[move.label]))
        .sort((a, b) => severity[b.label] - severity[a.label])[0]);
    return { focus: [...new Set(focus.filter(Boolean))].slice(0, 2), opening };
}

// Words that mean the player is asking about what already happened, or wants the game summed up.
const pastWords = /\b(?:did i|did you|did he|did she|did they|was (?:that|it|my|this)|were (?:my|those)|what went|went wrong|go wrong|do wrong|did wrong|what happened|earlier|back then|back there|before that|at some point|moves? ago|so far|until now|this game|that game|the game|my game|last (?:few )?moves|previous|should(?:'ve| have| i have)|could(?:'ve| have| i have)|would(?:'ve| have| i have)|missed|miss (?:something|anything)|blunder(?:ed)?|mistakes?|lost|losing it|threw|thrown|messed up|screwed up|turning point|review|recap|summar(?:y|ise|ize)|how did i|where did i|when did i|gg|good game|i resigned|resign(?:ed)?|on time|flagged|i won|i lost|we won|we lost|draw(?:n)?)\b/i;

export function pastTopic(message) {
    return pastWords.test(String(message || '')) || /\bmove \d{1,3}\b/i.test(String(message || '')) || openingAsk.test(String(message || ''));
}

/**
 * Timeline notes for one message. Once the past came up in a chat it stays for the follow ups,
 * and a finished game always has them. Returns { text, facts } or null.
 */
export function timelineNotes(message, timeline, { playerColor = null, previous = false, keep = [] } = {}) {
    if(!timeline?.moves?.length) return null;
    const over = Boolean(timeline.result?.over);
    if(!over && !previous && !pastTopic(message)) return null;
    const facts = timelineFacts(timeline.moves, { playerColor, result: timeline.result, keep, ...focusOf(message, timeline.moves, playerColor) });
    if(!facts.length) return null;
    const status = over ? `Game over: ${timeline.result.winner ? `${view(timeline.result.winner, playerColor)} won by ${timeline.result.reason}` : `draw by ${timeline.result.reason}`}.`
        : 'Game in progress, the board does not show resignations or the clock.';
    const owner = fact => !playerColor || !fact.side ? '' : fact.side === playerColor ? ' (you)' : ' (opponent)';
    const text = ['Game so far:', status, ...facts.map(fact => `[${fact.id}] ${fact.kind}${owner(fact)}: ${fact.text}.`)].join('\n');
    return { text, facts, over };
}

// Chain options for a stored chat or a training setup: a "what if" question pins its moment and carries the graded alternative.
export const pastOptions = setup => ({ playerColor: setup.playerColor,
    ...(setup.alternative ? { keep: [setup.alternative.ply], alternatives: [setup.alternative] } : {}) });

export function timelineChain(messages, timeline, options = {}) {
    let previous = Boolean(options.keep?.length);
    let keep = options.keep || [];
    const alternatives = options.alternatives || [];
    return messages.map(message => {
        const notes = timelineNotes(message, timeline, { ...options, previous, keep });
        if(notes) {
            previous = true;
            keep = notes.facts.filter(fact => /^H[1-9]$/.test(fact.id) && fact.ply != null).map(fact => fact.ply);
            for(const alternative of alternatives) alternativeNote(notes, alternative, options.playerColor);
        }
        return notes;
    });
}

/**
 * Adds "if you had played X instead" to the H moment of that ply. alternative is { ply, fen, color, uci, label, reason, pv },
 * graded at the position back then. The likely line goes into the moment so the board can replay it after the real move.
 */
export function alternativeNote(notes, alternative, playerColor = null) {
    const fact = notes?.facts.find(item => item.ply === alternative.ply && item.moment);
    if(!fact || fact.moment.alternative) return false;
    const { fen, uci } = alternative;
    const line = sanLine(fen, alternative.pv?.[0] === uci ? alternative.pv : [uci], 4);
    if(!line.length) return false;
    const who = !playerColor || playerColor === alternative.color ? 'you' : 'the opponent';
    const before = fact.text;
    fact.text += `. If ${who} had played ${numberedLine(fen, line.slice(0, 1))} instead, it would have been rated ${alternative.label}${cleanReason(alternative.reason)}`
        + (line.length > 1 ? `, the likely line ${numberedLine(fen, line)}` : '');
    fact.line = [...(fact.line || []), ...line];
    fact.moment = { ...fact.moment, alternative: line };
    notes.text = notes.text.replace(`${before}.`, `${fact.text}.`);
    return true;
}
