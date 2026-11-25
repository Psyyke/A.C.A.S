import { SQUARES } from '../libraries/chessjs/chess.js';
import { Facts, ownerColor, negatedConcept } from './concepts.js';
import { pcfBinPropMotifs } from './binprop-full.js';

const blue = '#74c0fc', red = '#ff6b6b', green = '#69db7c', orange = '#ffa94d';
const other = color => color === 'w' ? 'b' : 'w';
const value = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const relativeRank = (square, color) => color === 'w' ? Number(square[1]) : 9 - Number(square[1]);
const distance = (a, b) => Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));
const arrow = (from, to, color) => Object.assign([from, to], { color });
const region = (label, squares, color = blue) => ({ label, squares: [...new Set(squares)], anchor: squares[0], color });

// These are explanatory witnesses, not a reimplementation or certification of BinProp scores.
export const strategicVisualFamilies = Object.freeze([
    { codes: ['AC', 'COMPLEX', 'POINT'], recipe: 'squares', pattern: /\b(?:permanent holes?|holes? in (?:the|your|their|white's|black's) (?:position|camp)|weak (?:color|colour|square) complex(?:es)?|(?:light|dark)[- ]square weaknesses|pressure points?|control of (?:the )?(?:light|dark) squares)\b/gi },
    { codes: ['PS', 'PASS', 'WEDGE', 'OVER'], recipe: 'pawns', pattern: /\b(?:pawn (?:health|skeleton|wedge)|(?:central|protected|connected) passers?|passed[- ]pawn (?:edge|strength)|(?:overextended|over-extended|vulnerable|healthy|healthier) pawns?|pawn[- ]structure (?:advantage|edge)|superior pawn structure)\b/gi },
    { codes: ['KZ', 'SHEL'], recipe: 'king', pattern: /\b(?:king[- ]zone (?:pressure|attack)|(?:pressure|attack|attacking) (?:around|against|on|near) (?:the|your|their|white's|black's) king|(?:missing|absent|damaged) (?:pawn )?(?:shield|shelter)|pawn (?:shield|cover)|king (?:exposure|vulnerability)|(?:stranded|unsheltered|unsafe|vulnerable) king)\b/gi },
    { codes: ['DD'], recipe: 'duties', pattern: /\b(?:defensive duties|defensive jobs|defending duties|tied (?:down|up)(?: to defend)?|overload(?:ed|ing)?|overworked)\b/gi },
    { codes: ['MAT', 'IMB', 'HIDDEN'], recipe: 'material', pattern: /\b(?:(?:material|piece) (?:advantage|edge|deficit|imbalance|balance)|hidden material|extra (?:pawn|piece|rook|queen)|(?:up|down) (?:a|an|two|three|\w+ points? of) (?:pawn|piece|rook|queen|material))\b/gi },
    { codes: ['POS', 'CAMP'], recipe: 'control', pattern: /\b(?:positional (?:advantage|edge|dominance)|space (?:advantage|edge)|central control|control (?:of|over) (?:the )?cent(?:er|re)|(?:low|little|no) (?:enemy|opponent) pressure|safe camp|room to man(?:eu|oe)vre)\b/gi },
    { codes: ['INF'], recipe: 'infiltration', pattern: /\b(?:infiltrat(?:e[sd]?|ion|ing)|penetrat(?:e[sd]?|ion|ing)|(?:rook|rooks|pieces?) (?:in|inside) (?:the )?(?:enemy|opponent's) camp)\b/gi },
    { codes: ['FORCE', 'CHECK', 'CAP', 'LOSS'], recipe: 'forcing', pattern: /\b(?:forcing (?:moves|resources|options)|checking (?:initiative|resources|moves)|(?:checks? and captures|captures and checks?)|capture[- ]exchange gain|material exposure|reply material exposure)\b/gi },
    { codes: ['LAG', 'MINOR'], recipe: 'mobility', pattern: /\b(?:mobilization (?:lag|advantage)|development (?:lag|lead|advantage)|behind in development|(?:passive|restricted|constrained|immobile|bad|inactive|poorly placed) (?:minor pieces?|pieces?|bishop|knight|rook)s?|minor[- ]piece disadvantage|piece mobility|limited mobility)\b/gi },
    { codes: ['WEAK', 'PP'], recipe: 'weaknesses', pattern: /\b(?:multiple weaknesses|two weaknesses|weak targets|targets to attack|weak pawn pressure|pressure on weak pawns)\b/gi },
    { codes: ['QH'], recipe: 'queen', pattern: /\b(?:queen harassment|harass(?:ing|es)? (?:the|your|their) queen|(?:chase|chasing|attack|attacking|hit|hitting) (?:the|your|their|white's|black's) queen)\b/gi },
    { codes: ['FORK', 'TEMPO'], recipe: 'attacks', pattern: /\b(?:double[- ]attack threat|new threat creation|creates? (?:a )?new threats?|gains? (?:a )?tempo|with tempo)\b/gi },
    { codes: ['TRAP'], recipe: 'trap', pattern: /\b(?:trapped|trapping|nowhere to go|no safe squares?|no escape squares?)\b/gi },
    { codes: ['KACT'], recipe: 'kingActivity', pattern: /\b(?:king activity|active king|king centralization|centralized king|king (?:joins|enters) (?:the )?fight)\b/gi },
    { codes: ['XRAY'], recipe: 'xray', pattern: /\b(?:x[- ]?rays?|x[- ]?ray pressure|line pressure|pin and x[- ]?ray)\b/gi }
]);
const known = new Set(pcfBinPropMotifs.map(motif => motif.code));
const mapped = strategicVisualFamilies.flatMap(family => family.codes);
if(mapped.length !== known.size || new Set(mapped).size !== known.size || mapped.some(code => !known.has(code)))
    throw new Error('Strategic teaching must cover each BinProp family exactly once.');

export function strategicCues(text, at, moves = [], existing = [], { hideMoves = false } = {}) {
    const cues = [];
    for(const family of strategicVisualFamilies) for(const match of text.matchAll(family.pattern)) {
        const index = match.index, end = index + match[0].length;
        if(hideMoves && family.recipe === 'forcing') continue;
        if(negatedConcept(text.slice(0, index)) || existing.some(cue => cue.index <= index && cue.end >= end
            && (cue.references.regions.length || cue.references.relations.length))) continue;
        const position = at(index);
        const subject = position.bind(index, end);
        const binding = ['duties', 'mobility', 'trap', 'queen', 'infiltration', 'xray', 'attacks'].includes(family.recipe)
            || family.recipe === 'pawns' && (subject?.square || subject?.file) ? subject : null;
        if(binding && binding.status !== 'resolved') continue;
        const clause = text.slice(0, index).split(/[.!?;]|\b(?:but|while|whereas)\b/i).at(-1);
        const named = [...clause.matchAll(/\b(white(?:'s)?|black(?:'s)?|your|you|their|they|opponent's)\b/gi)].at(-1)?.[1];
        const local = match[0].match(/\b(your|their|white's|black's)\b/i)?.[1];
        const side = local ? ownerColor(local, position.root) : named ? ownerColor(/^(?:they)$/i.test(named) ? 'their' : named, position.root)
            : binding?.entities[0]?.color || position.subject || position.color;
        if(!side) continue;
        const facts = new Facts(position.fen);
        const selected = binding?.entities.map(piece => piece.square);
        const focused = piece => !selected?.length || selected.includes(piece.square);
        const refs = { squares: [], regions: [], relations: [] };
        let positionFen = position.fen;
        const add = (label, pieces, color) => {
            if(pieces.length) refs.regions.push(region(label, pieces.map(piece => typeof piece === 'string' ? piece : piece.square), color));
        };
        const targets = (piece, enemy = true) => facts.find(null, enemy ? other(piece.color) : piece.color)
            .filter(target => target.square !== piece.square && facts.attackers(target.square, piece.color).includes(piece.square));
        const pressure = (pieces, label, color = red) => {
            for(const piece of pieces) {
                const attackers = facts.attackers(piece.square, other(piece.color));
                if(attackers.length) {
                    add(label, [piece], color);
                    attackers.slice(0, 3).forEach(source => refs.relations.push(arrow(source, piece.square, color)));
                }
            }
        };
        if(family.recipe === 'material') {
            for(const color of ['w', 'b']) {
                const pieces = facts.find(['p', 'n', 'b', 'r', 'q'], color);
                add(`${color === 'w' ? 'White' : 'Black'}: ${pieces.reduce((sum, piece) => sum + value[piece.type], 0)} material points`, pieces,
                    color === 'w' ? blue : red);
            }
        } else if(family.recipe === 'control' || family.recipe === 'squares') {
            const shade = match[0].match(/\b(light|dark)\b/i)?.[1]?.toLowerCase();
            const central = /centr/i.test(match[0]);
            const ours = facts.find('p', side), enemy = facts.find('p', other(side));
            const squares = SQUARES.filter(square => {
                if(central && !['d4', 'e4', 'd5', 'e5'].includes(square)) return false;
                if(!central && relativeRank(square, side) < 5) return false;
                if(shade && ((square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 1) !== (shade === 'dark')) return false;
                if(family.recipe === 'squares' && enemy.some(pawn => Math.abs(pawn.square.charCodeAt(0) - square.charCodeAt(0)) === 1
                    && relativeRank(pawn.square, side) > relativeRank(square, side))) return false;
                if(facts.board.get(square)?.color === other(side)) return false;
                return facts.attackers(square, side).length > 0
                    && (family.recipe === 'squares' || !ours.some(pawn => pawn.square[0] === square[0]
                        && relativeRank(pawn.square, side) > relativeRank(square, side)));
            });
            add(central ? 'Central control' : family.recipe === 'squares' ? 'Controlled holes' : 'Controlled space', squares, blue);
        } else if(family.recipe === 'pawns') {
            const pawns = facts.find('p', side).filter(focused);
            const list = /wedge/i.test(match[0]) ? pawns.filter(pawn => 'de'.includes(pawn.square[0]) && relativeRank(pawn.square, side) >= 5)
                : /passer|passed/i.test(match[0]) ? pawns.filter(pawn => facts.passed(pawn))
                    : /vulnerable|overextended/i.test(match[0]) ? pawns.filter(pawn => relativeRank(pawn.square, side) >= 5
                        && facts.attackers(pawn.square, other(side)).length) : pawns;
            add(/wedge/i.test(match[0]) ? 'Central pawn wedge' : /passer|passed/i.test(match[0]) ? 'Passed pawns' : 'Pawn structure', list, green);
            if(/passer|passed/i.test(match[0])) for(const pawn of list)
                refs.relations.push(arrow(pawn.square, pawn.square[0] + (side === 'w' ? '8' : '1'), green));
            if(/vulnerable|overextended/i.test(match[0])) pressure(list, 'Advanced pawn pressure');
        } else if(family.recipe === 'king' || family.recipe === 'kingActivity') {
            const king = facts.find('k', side)[0];
            if(!king) continue;
            const zone = SQUARES.filter(square => distance(square, king.square) <= 1);
            add(family.recipe === 'kingActivity' ? 'King activity' : 'King zone', zone, blue);
            if(family.recipe === 'king') {
                const shield = facts.find('p', side).filter(pawn => Math.abs(pawn.square.charCodeAt(0) - king.square.charCodeAt(0)) <= 1
                    && relativeRank(pawn.square, side) > relativeRank(king.square, side)
                    && relativeRank(pawn.square, side) <= relativeRank(king.square, side) + 2);
                add('Pawn shield', shield, green);
                for(const square of zone) facts.attackers(square, other(side)).filter(source => facts.board.get(source)?.type !== 'k')
                    .slice(0, 2).forEach(source => refs.relations.push(arrow(source, square, red)));
            } else {
                const routes = facts.board.moves({ verbose: true }).filter(move => move.from === king.square).map(move => move.to);
                add('Legal king squares', routes, green);
            }
        } else if(family.recipe === 'infiltration') {
            const pieces = facts.find(['n', 'b', 'r', 'q'], side).filter(focused).filter(piece => relativeRank(piece.square, side) >= 5);
            add('Pieces in the enemy camp', pieces, blue);
            for(const piece of pieces) targets(piece).slice(0, 3).forEach(target => refs.relations.push(arrow(piece.square, target.square, red)));
        } else if(family.recipe === 'mobility' || family.recipe === 'trap') {
            const type = match[0].match(/\b(bishop|knight|rook)s?\b/i)?.[1]?.toLowerCase();
            const pieces = facts.find(type ? { bishop: 'b', knight: 'n', rook: 'r' }[type] : ['n', 'b', 'r', 'q'], side).filter(focused);
            for(const piece of pieces) {
                const destinations = SQUARES.filter(square => facts.board.get(square)?.color !== side
                    && facts.attackers(square, side).includes(piece.square));
                const safe = destinations.filter(square => !facts.attackers(square, other(side)).length);
                if(family.recipe === 'trap' && (safe.length || !facts.attackers(piece.square, other(side)).length)) continue;
                if(family.recipe === 'mobility' && !selected?.length && destinations.length > 4) continue;
                add(family.recipe === 'trap' ? 'Attacked, no unattacked destinations' : 'Piece mobility', [piece], orange);
                add('Unattacked destinations (geometric)', safe, green);
                add('Contested destinations', destinations.filter(square => !safe.includes(square)), red);
            }
        } else if(family.recipe === 'duties') {
            for(const piece of facts.find(null, side).filter(focused).filter(piece => piece.type !== 'k')) {
                const defended = targets(piece, false).filter(target => facts.attackers(target.square, other(side)).length
                    && facts.attackers(target.square, side).length === 1);
                if(!defended.length || /overload|overwork/i.test(match[0]) && defended.length < 2) continue;
                add('Defensive duties', [piece, ...defended], orange);
                defended.forEach(target => refs.relations.push(arrow(piece.square, target.square, green)));
            }
        } else if(family.recipe === 'weaknesses') {
            pressure(facts.find(null, side).filter(focused).filter(piece => piece.type !== 'k'
                && (facts.hanging(piece).length || piece.type === 'p' && (facts.isolated(piece) || facts.backward(piece)))), 'Attacked weaknesses');
        } else if(family.recipe === 'queen') {
            pressure(facts.find('q', side).filter(focused), 'Queen under attack');
        } else if(family.recipe === 'attacks') {
            const frame = moves.filter(move => move.end <= index && !/[.!?;]/.test(text.slice(move.end, index))).at(-1);
            const source = frame?.to || position.actor;
            const piece = facts.pieces.find(piece => piece.square === source);
            if(piece) {
                const hit = targets(piece);
                add('Attacked targets', hit, red);
                hit.forEach(target => refs.relations.push(arrow(source, target.square, red)));
            }
        } else if(family.recipe === 'forcing') {
            const frame = moves.find(move => move.index >= end && move.index - end < 35 && !/[.!?;]/.test(text.slice(end, move.index)));
            if(frame && (frame.captured || /[+#]/.test(frame.san))) {
                positionFen = frame.beforeFen;
                refs.relations.push(arrow(frame.from, frame.to, red));
                add(frame.captured ? 'Capture' : 'Checking move', [frame.to], red);
            } else {
                pressure(facts.find(null, other(side)).filter(piece => piece.type !== 'k'), 'Capture targets');
                pressure(facts.find('k', other(side)), 'King in check');
            }
        } else if(family.recipe === 'xray') {
            const rays = facts.rays().filter(line => line.slider.color === side && (!selected?.length
                || [line.slider.square, line.front.square, line.back.square].some(square => selected.includes(square))));
            for(const { slider, front, back } of rays) {
                add('X-ray (blocked line)', [slider, front, back], blue);
                refs.relations.push(arrow(slider.square, back.square, blue));
            }
            for(const [back, front] of facts.batteries(side).filter(pair => !selected?.length || pair.some(square => selected.includes(square))))
                refs.relations.push(arrow(back, front, blue));
        }
        if(refs.regions.length || refs.relations.length) cues.push({ index, end, references: refs, family: family.recipe, positionFen });
    }
    return cues;
}
