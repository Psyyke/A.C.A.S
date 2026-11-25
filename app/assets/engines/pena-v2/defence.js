import { Chess } from '../libraries/chessjs/chess.js';
import { Facts } from './concepts.js';

// When the opponent has a real threat, the natural ways to meet it are tested with the engine,
// so Pena can say which defence works and which tempting one fails instead of guessing.
// Same code for the live app and the training data.

const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const uciOf = move => move.from + move.to + (move.promotion || '');
const value = score => score?.cp ?? (score?.mate > 0 ? 3000 - score.mate : score?.mate < 0 ? -3000 - score.mate : 0);

export const realThreat = threat => Boolean(threat?.pv?.length && ((threat.gain ?? 0) >= 150 || threat.score?.mate > 0));

function between(from, to) {
    const df = Math.sign(to.charCodeAt(0) - from.charCodeAt(0)), dr = Math.sign(to[1] - from[1]);
    const files = Math.abs(to.charCodeAt(0) - from.charCodeAt(0)), ranks = Math.abs(to[1] - from[1]);
    if(files && ranks && files !== ranks) return [];
    const squares = [];
    for(let step = 1; step < Math.max(files, ranks); step++)
        squares.push(String.fromCharCode(from.charCodeAt(0) + df * step) + (Number(from[1]) + dr * step));
    return squares;
}

/**
 * The defences worth testing, at most one of each kind next to the engine's own top choices.
 * @returns {{ uci: string, kind: 'engine'|'away'|'guard'|'capture'|'block'|'king', how: string }[]}
 */
export function defenceCandidates(fen, threat, lines = []) {
    if(!realThreat(threat)) return [];
    const board = new Chess(fen);
    if(board.in_check()) return [];
    const turn = board.turn();
    const moves = board.moves({ verbose: true });
    const threatMove = threat.pv[0];
    const from = threatMove.slice(0, 2), to = threatMove.slice(2, 4);
    const attacker = board.get(from);
    const target = board.get(to);
    const before = new Facts(fen);
    const guards = target?.color === turn ? before.attackers(to, turn).length : 0;
    const found = new Map();
    const add = (move, kind, how) => { if(move && !found.has(uciOf(move))) found.set(uciOf(move), { uci: uciOf(move), kind, how }); };
    for(const line of lines.slice(0, 2)) add(moves.find(move => uciOf(move) === line.move), 'engine', '');
    const after = move => { board.move(move); const facts = new Facts(board.fen()); board.undo(); return facts; };
    if(target?.color === turn && target.type !== 'k') {
        const away = moves.filter(move => move.from === to).find(move => !after(move).attackers(move.to, attacker?.color || (turn === 'w' ? 'b' : 'w')).length);
        add(away, 'away', `moves the ${names[target.type]} away from ${to}`);
        const guard = moves.find(move => move.from !== to && move.to !== to && after(move).attackers(to, turn).length > guards);
        add(guard, 'guard', `guards ${to}`);
    }
    add(moves.find(move => move.to === from), 'capture', `takes the ${names[attacker?.type] || 'piece'} on ${from} that makes the threat`);
    if(attacker && ['b', 'r', 'q'].includes(attacker.type)) {
        const gaps = between(from, to);
        add(moves.find(move => gaps.includes(move.to) && move.piece !== 'k'), 'block', `blocks the line from ${from} to ${to}`);
    }
    if(threat.score?.mate > 0) {
        const king = before.find(['k'], turn)[0];
        const luft = moves.find(move => move.piece === 'p' && king && Math.abs(move.from.charCodeAt(0) - king.square.charCodeAt(0)) <= 1
            && Math.abs(move.from[1] - king.square[1]) === 1);
        add(luft, 'king', 'gives the king an escape square');
        add(moves.find(move => move.piece === 'k' && !move.flags.includes('k') && !move.flags.includes('q')), 'king', 'moves the king out of the mating net');
    }
    // The engine moves first, then the most natural human tries.
    const order = ['engine', 'away', 'guard', 'capture', 'block', 'king'];
    return [...found.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).slice(0, 6);
}

/**
 * Tests each candidate with one engine search and keeps up to two defences that hold and one that fails.
 * @param {(fen: string, options: { depth: number, multipv?: number, moves?: string[] }) => Promise<{ move: string, pv: string[], score: object }[]>} search
 * @returns {Promise<{ uci: string, kind: string, how: string, verdict: 'holds'|'fails', score: object, pv: string[], loss: number }[]>}
 */
export async function testDefences(fen, threat, lines, search, { depth = 14 } = {}) {
    const candidates = defenceCandidates(fen, threat, lines);
    if(!candidates.length || !lines?.[0]) return [];
    const best = value(lines[0].score);
    const tested = [];
    for(const candidate of candidates) {
        const known = lines.find(line => line.move === candidate.uci);
        const line = known || (await search(fen, { depth: Math.max(8, depth - 2), multipv: 1, moves: [candidate.uci] }))[0];
        if(!line?.score) continue;
        const loss = Math.max(0, best - value(line.score));
        const pv = line.pv?.[0] === candidate.uci ? line.pv : [candidate.uci];
        // A failed defence only teaches something when the same threat still lands right after it.
        const verdict = loss <= 70 ? 'holds' : loss >= 150 && pv[1] === threat.pv[0] ? 'fails' : null;
        const rank = lines.slice(0, 2).findIndex(item => item.move === candidate.uci);
        const board = new Chess(fen);
        board.move({ from: candidate.uci.slice(0, 2), to: candidate.uci.slice(2, 4), promotion: candidate.uci[4] });
        const stops = !board.moves({ verbose: true }).some(move => uciOf(move) === threat.pv[0]);
        if(verdict) tested.push({ ...candidate, verdict, score: line.score, pv, loss, stops, ...(rank >= 0 ? { engineRank: rank + 1 } : {}) });
    }
    // A defence that only works because the engine found something else is still a defence, but a
    // named human idea that works teaches more, so it goes before a second engine move.
    const holds = tested.filter(item => item.verdict === 'holds');
    const named = holds.find(item => item.kind !== 'engine');
    const keep = [holds[0], named && named !== holds[0] ? named : holds[1]].filter(Boolean);
    const fail = tested.filter(item => item.verdict === 'fails' && item.kind !== 'engine')[0];
    return [...keep, fail].filter(Boolean);
}
