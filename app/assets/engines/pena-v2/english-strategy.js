// The bigger picture for the English board. BinProp pattern tests pick which strategic topics matter and which side
// they favour, but every sentence Inkling reads is an exact board fact. A topic with no concrete fact behind it is left out.
// Tactical BinProps stay out because the per-piece board and live notes cover those, and pawn structure, king shelter and
// material stay out because the evidence header already states them.
import { Chess, SQUARES } from '../libraries/chessjs/chess.js';
import { binPropValues, pcfBinPropMotifs } from './binprop-full.js';
import { NAMES, SIDE, andList, attackersOf, attacksFrom } from './thought-questions.js';

const other = color => color === 'w' ? 'b' : 'w';
const file = square => square.charCodeAt(0) - 97;
// 1 is the side's own back rank, 8 the far one.
const rank = (square, color) => color === 'w' ? Number(square[1]) : 9 - Number(square[1]);
const name = (chess, square) => `${NAMES[chess.get(square).type]} ${square}`;
const pieces = (chess, color, types = 'pnbrqk') => SQUARES.filter(s => chess.get(s)?.color === color && types.includes(chess.get(s).type));
const FAMILIES = [
    ['development', ['LAG', 'MINOR']],
    ['space', ['AC', 'INF', 'POINT', 'COMPLEX', 'CAMP', 'POS']],
    ['duties', ['DD']],
    ['kingActivity', ['KACT']]
];
const index = Object.fromEntries(pcfBinPropMotifs.map((motif, i) => [motif.code, i]));

function developmentReasons(chess, me) {
    // Late in the game a bishop that never moved is a detail, not a development lead.
    if(Number(chess.fen().split(' ')[5]) > 15) return [];
    const them = other(me), home = them === 'w' ? { b1: 'n', g1: 'n', c1: 'b', f1: 'b' } : { b8: 'n', g8: 'n', c8: 'b', f8: 'b' };
    const idle = Object.entries(home).filter(([s, type]) => chess.get(s)?.type === type && chess.get(s).color === them).map(([s, type]) => `${NAMES[type]} ${s}`);
    const reasons = [];
    if(idle.length) reasons.push(`${SIDE[them]}'s ${andList(idle)} ${idle.length === 1 ? 'is' : 'are'} still on ${idle.length === 1 ? 'its' : 'their'} starting square${idle.length === 1 ? '' : 's'}`);
    const [king] = pieces(chess, them, 'k');
    if(['d', 'e'].includes(king[0]) && rank(king, them) === 1 && pieces(chess, them, 'q').length) reasons.push(`${SIDE[them]}'s king is still in the centre on ${king}`);
    return reasons;
}

function spaceReasons(chess, me) {
    const them = other(me), reasons = [];
    const deep = pieces(chess, me, 'nbrq').filter(s => rank(s, me) >= 6);
    if(deep.length) reasons.push(`${SIDE[me]}'s ${andList(deep.map(s => name(chess, s)))} ${deep.length === 1 ? 'sits' : 'sit'} deep in ${SIDE[them]}'s half`);
    const reach = color => new Set(pieces(chess, color).flatMap(s => attacksFrom(chess, s)).filter(t => rank(t, color) >= 5)).size;
    const mine = reach(me), theirs = reach(them);
    if(mine >= theirs + 4) reasons.push(`${SIDE[me]}'s pieces and pawns reach ${mine} squares in ${SIDE[them]}'s half, ${SIDE[them]}'s reach ${theirs} in ${SIDE[me]}'s`);
    return reasons;
}

function dutyReasons(chess, me) {
    const them = other(me), reasons = [];
    for(const s of pieces(chess, them, 'pnbrq')) {
        if(!attackersOf(chess, s, me).length) continue;
        const guards = attackersOf(chess, s, them);
        if(guards.length === 1 && 'nbrq'.includes(chess.get(guards[0]).type))
            reasons.push(`${SIDE[them]}'s ${name(chess, guards[0])} is the only guard of the attacked ${name(chess, s)}, so it is tied to it`);
    }
    return reasons;
}

function kingActivityReasons(chess, me) {
    if(pieces(chess, 'w', 'q').length || pieces(chess, 'b', 'q').length) return [];
    const them = other(me), [mine] = pieces(chess, me, 'k'), [theirs] = pieces(chess, them, 'k');
    const centre = s => Math.max(Math.abs(file(s) - 3.5), Math.abs(Number(s[1]) - 4.5));
    return centre(mine) < centre(theirs) ? [`${SIDE[me]}'s king on ${mine} is closer to the centre than ${SIDE[them]}'s king on ${theirs}`] : [];
}

const REASONS = { development: developmentReasons, space: spaceReasons,
    duties: dutyReasons, kingActivity: kingActivityReasons };
const TITLE = { development: 'Development', space: 'Space and activity',
    duties: 'Tied-down pieces', kingActivity: 'King activity' };

/** A few plain lines about the bigger picture, or '' when nothing concrete stands out. */
export function englishStrategy(fen) {
    let chess, values;
    try { chess = new Chess(fen); values = { w: binPropValues(fen, 'w'), b: binPropValues(fen, 'b') }; } catch { return ''; }
    const lines = [];
    for(const [family, codes] of FAMILIES) {
        // A topic only counts when the pattern tests point one way. Both sides "winning" it means it is unclear.
        const favoured = ['w', 'b'].filter(color => codes.some(code => values[color][index[code]]));
        if(favoured.length !== 1) continue;
        const reasons = REASONS[family](chess, favoured[0]);
        if(reasons.length) lines.push(`${TITLE[family]}, leaning ${SIDE[favoured[0]]}: ${reasons.slice(0, 3).join('. ')}.`);
    }
    return lines.length ? ['Bigger picture (exact facts, picked by simple pattern tests, so hints for plans, not proof of who is better):', ...lines].join('\n') : '';
}
