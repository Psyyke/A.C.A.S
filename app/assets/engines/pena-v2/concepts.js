import { Chess, SQUARES } from '../libraries/chessjs/chess.js';
import CaptureExchange from '../../js/misc/captureExchange.js';
import { glossaryMentions } from './glossary.js';

// Turns chess vocabulary into board facts the narrator can highlight, using the
// position being discussed at that point of the sentence.
const types = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' };
const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const toIndex = square => (8 - Number(square[1])) * 8 + square.charCodeAt(0) - 97;
const toSquare = index => 'abcdefgh'[index % 8] + (8 - Math.floor(index / 8));
const other = color => color === 'w' ? 'b' : 'w';
const owner = '(white(?:\'s)?|black(?:\'s)?|(?:the )?player\'s|your|own|(?:the )?opponent\'s|enemy|opposing)';
const red = '#ff6b6b', green = '#69db7c', blue = '#74c0fc';
export const negatedConcept = prefix => /\b(?:not|never|without|no|isn't|aren't|wasn't|weren't|wouldn't|won't|doesn't|don't|didn't|can't|cannot|couldn't|avoid|avoids|avoiding|rather than|instead of)\s+(?:\w+\s+){0,3}$/i.test(prefix);

export function ownerColor(word, root) {
    if(!word) return null;
    word = word.toLowerCase();
    if(/^(?:white|black)(?:'s)?$/.test(word)) return word[0];
    return /opponent|enemy|opposing|their|his|her/.test(word) ? other(root) : root;
}

// "your king is safely castled" or "while Black has not castled": the nearest side named in the same clause.
export function clauseSide(text, index, root) {
    const clause = text.slice(0, index).split(/[.!?;]|\b(?:while|whereas|but)\b/i).at(-1);
    const word = [...clause.matchAll(/\b(white|black|your|you|their|they|opponent's|opponent)\b/gi)].at(-1)?.[1].toLowerCase();
    return !word || !root && !/^(?:white|black)$/.test(word) ? null
        : ownerColor(word === 'you' ? 'your' : word === 'they' || word === 'opponent' ? 'their' : word, root);
}

function arrow(from, to, color) {
    return Object.assign([from, to], { color });
}

export class Facts {
    constructor(fen) {
        this.board = new Chess(fen);
        this.exchange = new CaptureExchange(fen);
        this.pieces = SQUARES.map(square => ({ square, ...this.board.get(square) })).filter(piece => piece.type);
    }

    find(type, color) {
        return this.pieces.filter(piece => (!type || type.includes(piece.type)) && (!color || piece.color === color));
    }

    attackers(square, color) {
        return this.exchange.attackersTo(toIndex(square), color).map(toSquare);
    }

    capturers(square, color) {
        const fields = this.board.fen().split(' ');
        if(fields[1] !== color) { fields[1] = color; fields[3] = '-'; }
        return new Chess(fields.join(' ')).moves({ verbose: true })
            .filter(move => move.to === square && move.captured).map(move => move.from);
    }

    passed(pawn) {
        const forward = pawn.color === 'w' ? 1 : -1;
        return !this.pieces.some(piece => piece.type === 'p' && piece.color !== pawn.color
            && Math.abs(piece.square.charCodeAt(0) - pawn.square.charCodeAt(0)) <= 1
            && (Number(piece.square[1]) - Number(pawn.square[1])) * forward > 0);
    }

    isolated(pawn) {
        return !this.pieces.some(piece => piece.type === 'p' && piece.color === pawn.color
            && Math.abs(piece.square.charCodeAt(0) - pawn.square.charCodeAt(0)) === 1);
    }

    doubled(pawn) {
        return this.pieces.some(piece => piece.type === 'p' && piece.color === pawn.color
            && piece.square !== pawn.square && piece.square[0] === pawn.square[0]);
    }

    backward(pawn) {
        const forward = pawn.color === 'w' ? 1 : -1;
        const adjacent = this.find('p', pawn.color).filter(other =>
            Math.abs(other.square.charCodeAt(0) - pawn.square.charCodeAt(0)) === 1);
        const next = pawn.square[0] + (Number(pawn.square[1]) + forward);
        return adjacent.length > 0 && adjacent.every(other =>
            (Number(other.square[1]) - Number(pawn.square[1])) * forward > 0)
            && /^[a-h][2-7]$/.test(next) && !this.board.get(next)
            && this.attackers(next, other(pawn.color)).some(square => this.board.get(square)?.type === 'p');
    }

    hanging(piece) {
        const attackers = this.attackers(piece.square, other(piece.color));
        if(!attackers.length || piece.type === 'k') return [];
        const defended = this.attackers(piece.square, piece.color).length > 0;
        const cheaper = attackers.filter(square => values[this.board.get(square).type] < values[piece.type]);
        return defended ? cheaper : attackers;
    }

    targets(square) {
        const piece = this.board.get(square);
        if(!piece) return [];
        return this.find(null, other(piece.color)).filter(target => target.type !== 'p' || !this.attackers(target.square, target.color).length)
            .filter(target => this.attackers(target.square, piece.color).includes(square));
    }

    rays() {
        const found = [];
        for(const slider of this.find(['b', 'r', 'q'])) {
            const directions = { b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]] };
            for(const [dx, dy] of slider.type === 'q' ? [...directions.b, ...directions.r] : directions[slider.type]) {
                const hits = [];
                for(let step = 1; step < 8 && hits.length < 2; step++) {
                    const file = slider.square.charCodeAt(0) - 97 + dx * step, rank = Number(slider.square[1]) + dy * step;
                    if(file < 0 || file > 7 || rank < 1 || rank > 8) break;
                    const square = 'abcdefgh'[file] + rank;
                    const piece = this.board.get(square);
                    if(piece) hits.push({ square, ...piece });
                }
                const [front, back] = hits;
                if(front && back) found.push({ slider, front, back });
            }
        }
        return found;
    }

    // Pins and skewers: a slider hits an enemy piece with a more (pin) or less (skewer) valuable enemy piece behind it.
    lines() {
        const found = [];
        for(const { slider, front, back } of this.rays()) {
                if(!front || !back || front.color === slider.color || back.color === slider.color) continue;
                if(values[back.type] > values[front.type] && ['r', 'q', 'k'].includes(back.type))
                    found.push({ kind: 'pin', slider: slider.square, front: front.square, back: back.square, color: slider.color });
                else if(values[front.type] > values[back.type] && ['q', 'k'].includes(front.type))
                    found.push({ kind: 'skewer', slider: slider.square, front: front.square, back: back.square, color: slider.color });
        }
        return found;
    }

    batteries(color) {
        const found = [];
        const pieces = this.find(['q', 'r', 'b'], color);
        for(const first of pieces) for(const second of pieces) {
            if(first.square >= second.square || first.type === second.type && first.type === 'b') continue;
            const dx = second.square.charCodeAt(0) - first.square.charCodeAt(0), dy = Number(second.square[1]) - Number(first.square[1]);
            const straight = dx === 0 || dy === 0, diagonal = Math.abs(dx) === Math.abs(dy);
            const fits = piece => piece.type === 'q' || (straight ? piece.type === 'r' : diagonal && piece.type === 'b');
            if(!(straight || diagonal) || !fits(first) || !fits(second)) continue;
            const steps = Math.max(Math.abs(dx), Math.abs(dy));
            const clear = Array.from({ length: steps - 1 }, (_, step) => String.fromCharCode(first.square.charCodeAt(0) + Math.sign(dx) * (step + 1))
                + (Number(first.square[1]) + Math.sign(dy) * (step + 1))).every(square => !this.board.get(square));
            if(clear) found.push([first.square, second.square]);
        }
        return found;
    }
}

function promotionSquare(pawn) {
    return pawn.square[0] + (pawn.color === 'w' ? '8' : '1');
}

function region(label, squares, color) {
    return { label, squares, anchor: squares[0], color };
}

const properties = 'undefended|unprotected|hanging|loose|isolated|doubled|backward|passed|pinned|advanced|central|active|remaining|dangerous';
const piecePattern = new RegExp(`\\b(?:(?<determiner>both|two|all|the|that|this|its|his|her|their|an?)\\s+)?`
    + `(?:(?<property>${properties})\\s+)?(?:(?<owner>${owner.slice(1, -1)})\\s+)?(?:(?<other>other)\\s+)?`
    + `(?:(?<propertyAfter>${properties})\\s+)?(?:(?<shade>light|dark)[- ]squared?\\s+)?`
    + `(?:(?<group>minor|major|active)\\s+pieces?|(?<pair>bishop pair|pair of bishops)|(?<name>king|queen|rook|bishop|knight|pawn|piece)(?<plural>s)?)`
    + `(?:\\s+(?:on|at|from)\\s+(?<square>[a-h][1-8])\\b)?(?!-)\\b`, 'gi');

export function pieceMentions(text) {
    const mentions = [];
    const filePawn = new RegExp(`\\b(?:(?<owner>${owner.slice(1, -1)})\\s+)?`
        + `(?:(?<property>${properties})\\s+)?(?<file>[a-h])[- ]pawn(?<plural>s)?\\b`, 'gi');
    for(const match of text.matchAll(filePawn))
        mentions.push({ ...match.groups, name: 'pawn', index: match.index, end: match.index + match[0].length });
    const squareFirst = new RegExp(`\\b(?:${owner}\\s+)?([a-h][1-8])[- ](king|queen|rook|bishop|knight|pawn)(?:'s)?\\b`, 'gi');
    for(const match of text.matchAll(squareFirst))
        mentions.push({ index: match.index, end: match.index + match[0].length, owner: match[1], square: match[2], name: match[3].toLowerCase() });
    for(const match of text.matchAll(piecePattern)) {
        const end = match.index + match[0].length;
        if(mentions.some(item => item.index < end && item.end > match.index)) continue;
        const spec = match.groups;
        const home = /^\s+(?:(?:is|are|remain|remains)\s+)?(?:still\s+)?(?:at home|undeveloped)\b/i.test(text.slice(end));
        mentions.push({ ...spec, name: spec.name?.toLowerCase(), index: match.index, end,
            property: spec.property || spec.propertyAfter || (home ? 'undeveloped' : undefined) });
    }
    return mentions.sort((a, b) => a.index - b.index);
}

const description = `(?:(?:the|an?|both|two|all)\\s+)?(?:(?<owner>${owner.slice(1, -1)})\\s+)?`
    + `(?:(?<squareFirst>[a-h][1-8])[- ](?<firstType>king|queen|rook|bishop|knight|pawn)|`
    + `(?<type>king|queen|rook|bishop|knight|pawn|piece)(?<plural>s)?(?:\\s+(?:on|at)\\s+(?<square>[a-h][1-8]))?)\\b`;
const followingDescription = new RegExp(`^\\s+(?:(?:right now|now|here)\\s+)?(?:(?:is|are)\\s+)?${description}`, 'i');
const precedingDescription = new RegExp(`\\b${description}\\s+(?:(?:is|are|was|were|remains?|still|looks?|seems?|now|simply|just|also|completely|currently|sits?|sitting|stands?|standing|left|attacked and|(?:passed|isolated|doubled|backward|weak|undefended|unprotected|hanging|pinned|advanced|loose|exposed),? (?:but|and|yet))\\s+)*$`, 'i');
const captureWords = /\b(?:captur\w*|tak\w*|win\w*|eliminat\w*|remov\w*|grab\w*|collect\w*)\s+(?:(?:the|an?|your|their|white(?:'s)?|black(?:'s)?|opponent's)\s+)?(?:(?:undefended|unprotected|hanging|loose|advanced|passed|isolated|doubled|backward|weak)\s+)*$/i;

function boundPieces(text, match, position, color) {
    const end = match.index + match[0].length;
    const resolved = position.bind(match.index, end);
    // An ambiguous subject still gets a chance below, where the concept itself narrows the candidates.
    if(resolved && (resolved.status === 'resolved' || resolved.status === 'contradicted')) return { facts: new Facts(resolved.fen), pieces: resolved.status === 'resolved' ? resolved.entities : [],
        name: resolved.name, plural: Boolean(resolved.plural || resolved.group || resolved.pair), square: resolved.square,
        vague: resolved.evidence === 'contextual predicate subject' && !resolved.antecedentSquare,
        captured: resolved.fen === position.beforeFen && Boolean(position.captured), end: Math.max(end, resolved.end) };
    const after = text.slice(end).match(followingDescription);
    const before = !after && text.slice(0, match.index).split(/[.!?;,]/).at(-1).match(precedingDescription);
    const inside = !after && !before && match[0].match(new RegExp(`\\b${description}$`, 'i'));
    const found = after || before || inside;
    if(!found) {
        // "b7 is loose": a bare square standing in for the piece on it.
        const bare = text.slice(0, match.index).split(/[.!?;,]/).at(-1)
            .match(/(?:^|\s)([a-h][1-8])\s+(?:is|are|was|remains?|still|looks?|now|just|also|sits?|left|completely)\s+(?:(?:still|now|just|also|completely|left)\s+)*$/i);
        const facts = new Facts(position.fen);
        const piece = bare && facts.board.get(bare[1]);
        if(!piece) return null;
        return { facts, pieces: [{ square: bare[1], ...piece }], name: { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[piece.type],
            plural: false, square: bare[1], captured: false, end };
    }
    const spec = found.groups;
    const name = (spec.type || spec.firstType).toLowerCase();
    const suffix = inside && text.slice(end).match(/^\s+(?:on|at)\s+([a-h][1-8])\b/i);
    const square = spec.square || spec.squareFirst || suffix?.[1];
    color = ownerColor(spec.owner, position.root) || color;
    const capturedSquare = position.capturedSquare || position.focus;
    const captured = Boolean(position.beforeFen && position.captured && (!types[name] || types[name] === position.captured)
        && (!square || square === capturedSquare) && captureWords.test(text.slice(0, match.index)));
    const facts = new Facts(captured ? position.beforeFen : position.fen);
    let pieces = facts.find(types[name] || ['n', 'b', 'r', 'q'], color);
    if(square) pieces = pieces.filter(piece => piece.square === square);
    else if(captured) pieces = pieces.filter(piece => piece.square === capturedSquare);
    else if(!spec.plural && pieces.some(piece => piece.square === position.focus)) pieces = pieces.filter(piece => piece.square === position.focus);
    return { facts, pieces, name, plural: Boolean(spec.plural), square, captured,
        end: after ? end + after[0].length : suffix ? end + suffix[0].length : end };
}

export function pieceCues(text, at) {
    const cues = [];
    for(const mention of pieceMentions(text)) {
        const resolved = at(mention.index).resolve(mention);
        if(resolved.status !== 'resolved') continue;
        const squares = resolved.entities.map(entity => entity.square);
        const references = { squares, square: squares.length === 1 ? squares[0] : undefined };
        if(mention.pair && squares.length === 2) references.regions = [region('Bishop pair', squares, blue)];
        cues.push({ index: mention.index, end: mention.end, resolution: resolved, references });
    }
    return cues;
}

const conceptPattern = new RegExp(`\\b(?:${owner}\\s+)?(?:(passed(?:[- ]pawns?)?|pawns? with no enemy pawns? ahead)|(isolated(?:[- ](?:pawns?|queen'?s? pawn))?)|(doubled(?:[- ]pawns?)?)|(weak[- ]pawns?|backward(?:[- ]pawns?)?)|(promot\\w*|queening square)|(hanging|undefended|unprotected|loose(?: (?:pieces?|pawns?))?)|(threat\\w*)|(fork\\w*|double attack)|(pin|pins|pinned|pinning|skewer\\w*)|(battery)|((?:half[- ]|semi[- ])?open files?)|(seventh|second|first|eighth) rank|(uncastled|exposed king|king(?:'s)? (?:position|cover|safety))|(castl\\w*)|((?:(?:king|queen)[- ]?side )?pawn[- ](?:majority|chain|structure|islands?|storm)|(?:connected|linked|supporting)[- ]pawns?|pawns?\\s+(?:(?:that|are)\\s+)?(?:protect\\w*|defend\\w*|support\\w*)\\s+(?:each other|one another)(?:\\s+diagonally)?)|(advanced(?:[- ]pawns?)?)|((?:weak|key|critical|strong)[- ](?:squares?|points?)|outposts?)|(discover\\w* (?:attacks?|checks?))|(mating net|back[- ]rank mate))\\b`, 'gi');

export function conceptCues(text, at, moves = [], { hideMoves = false } = {}) {
    const cues = [];
    for(const match of text.matchAll(conceptPattern)) {
        // "never castled" still shows the uncastled king.
        if(negatedConcept(text.slice(0, match.index)) && !/castl/i.test(match[0])) continue;
        const [, ownerWord, passed, isolated, doubled, weak, promotion, hanging, threat, fork, pin, battery, openFile, rank, king, castle, structure, advanced, weakSquare, discovered, mating] = match;
        const position = at(match.index);
        const color = ownerColor(ownerWord, position.root);
        // A passed-pawn threat describes a feature, not one particular pawn.
        const collective = passed && /^\s+threat\b/i.test(text.slice(match.index + match[0].length));
        const binding = !collective && (passed || isolated || doubled || weak || hanging || advanced || pin)
            ? boundPieces(text, match, position, color) : null;
        // "it's isolated" bound to a queen cannot be right, so a pawn concept goes to the one pawn that fits.
        // Other concepts keep the identified piece even when another piece would match better.
        if(binding?.vague && binding.pieces.length === 1 && binding.pieces[0].type !== 'p' && (passed || isolated || doubled)) {
            const board = binding.facts;
            const fits = piece => piece.type === 'p' && (passed ? board.passed(piece) : isolated ? board.isolated(piece) : board.doubled(piece));
            const pick = board.find(['p'], color).filter(fits);
            if(pick.length === 1 || doubled && pick.length === 2 && pick[0].square[0] === pick[1].square[0]) {
                binding.pieces = pick;
                binding.name = 'pawn';
            }
        }
        // "grabs the loose bishop" or "the hanging rook with Bxa7": the capture named next to the word shows what hangs.
        const wordEnd = match.index + match[0].length;
        const grab = hanging && moves.filter(item => item.captured && (item.index >= wordEnd && item.index - wordEnd <= 40
            && !/[.!?;]/.test(text.slice(wordEnd, item.index)) || item.end <= match.index && match.index - item.end <= 30
            && !/[.!?;]/.test(text.slice(item.end, match.index)))).sort((a, b) => Math.abs(a.index - wordEnd) - Math.abs(b.index - wordEnd))[0];
        if((passed || isolated || doubled || weak || hanging || advanced) && !binding && !collective && !grab) continue;
        const facts = binding?.facts || new Facts(position.fen);
        const focus = binding ? binding.pieces.length === 1 ? binding.pieces[0] : null
            : position.focus && facts.board.get(position.focus) ? { square: position.focus, ...facts.board.get(position.focus) } : null;
        const references = { squares: [], regions: [], relations: [] };
        const pawns = binding ? binding.pieces.filter(piece => piece.type === 'p') : facts.find(['p'], color);
        if(passed || promotion) {
            if(passed && position.captured === 'p' && position.beforeFen
                && /\b(?:captur\w*|tak\w*|eliminat\w*|remov\w*)\s+(?:the\s+)?$/i.test(text.slice(0, match.index))) {
                const before = new Facts(position.beforeFen);
                const captured = before.find('p').find(pawn => pawn.square === (position.capturedSquare || position.focus));
                if(captured && before.passed(captured)) references.regions.push(region('Captured passed pawn', [captured.square], red));
                if(references.regions.length) cues.push({ index: match.index, end: match.index + match[0].length, references });
                continue;
            }
            let list = focus?.type === 'p' && (!color || focus.color === color) && facts.passed(focus)
                ? [focus] : pawns.filter(pawn => facts.passed(pawn));
            if(promotion) {
                const side = color || position.subject || position.color;
                list = (focus?.type === 'p' && focus.color === side ? [focus] : list.filter(pawn => pawn.color === side))
                    .sort((a, b) => (b.color === 'w' ? 1 : -1) * (Number(b.square[1]) - Number(a.square[1]))).slice(0, 1);
            }
            for(const pawn of list.slice(0, 4)) references.relations.push(arrow(pawn.square, promotionSquare(pawn), green));
            if(list.length) references.regions.push(region(promotion ? 'Promotion square' : list.length > 1 ? 'Passed pawns' : 'Passed pawn',
                promotion ? list.map(promotionSquare) : list.map(pawn => pawn.square), green));
        } else if(isolated || doubled || weak) {
            const backward = /backward/i.test(weak || '');
            let list = pawns.filter(pawn => isolated ? facts.isolated(pawn) : doubled ? facts.doubled(pawn)
                : backward ? facts.backward(pawn) : facts.isolated(pawn) || facts.doubled(pawn) || facts.backward(pawn));
            // One named doubled pawn still shows its whole stack on the file.
            if(doubled && list.length) list = facts.find(['p']).filter(pawn => list.some(item => item.color === pawn.color && item.square[0] === pawn.square[0]));
            if(list.length && list.length <= 6) references.regions.push(region(isolated ? 'Isolated' : doubled ? 'Doubled'
                : backward ? 'Backward pawn' : 'Weak pawns', list.map(pawn => pawn.square), red));
        } else if(hanging) {
            const pieces = binding?.pieces || [];
            const isHanging = /^hanging$/i.test(hanging);
            let loose = pieces.map(piece => ({ piece, attackers: isHanging ? facts.capturers(piece.square, other(piece.color))
                : facts.attackers(piece.square, other(piece.color)) }))
                .filter(({ piece, attackers }) => !facts.attackers(piece.square, piece.color).length && (!isHanging || attackers.length));
            if(binding && !binding.plural && loose.length > 1) loose = loose.filter(({ piece }) => piece.square === position.focus);
            for(const { piece, attackers } of loose) attackers.slice(0, 2).forEach(source => references.relations.push(arrow(source, piece.square, red)));
            const feature = isHanging ? 'Hanging' : 'Undefended';
            const label = (binding?.captured ? `Captured ${feature.toLowerCase()}` : feature)
                + (binding && !binding.plural && binding.name !== 'piece' ? ` ${binding.name}` : '');
            if(loose.length) references.regions.push(region(label, loose.map(item => item.piece.square), red));
            else if(isHanging && pieces.length === 1 && !facts.attackers(pieces[0].square, pieces[0].color).length)
                references.regions.push(region(`Undefended${binding.name !== 'piece' ? ` ${binding.name}` : ''}`, [pieces[0].square], red));
            else if(grab) {
                const square = grab.capturedSquare || grab.to;
                const name = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' }[grab.captured];
                references.relations.push(arrow(grab.from, grab.to, red));
                references.regions.push(region(`${feature} ${name}`, [square], red));
            }
        } else if(threat || fork) {
            const end = match.index + match[0].length;
            const near = item => item.index >= end && item.index - end <= 30 && !/[.!?;]/.test(text.slice(end, item.index));
            const linked = moves.find(near)
                || moves.filter(item => item.end <= match.index && match.index - item.end <= 20 && !/[.!?;,]/.test(text.slice(item.end, match.index))).at(-1)
                || (threat && /\b(?:that|this|the)\s+(?:\w+\s+)?$/i.test(text.slice(0, match.index))
                    ? moves.filter(item => item.end <= match.index && item.threat).at(-1) : null);
            const victim = threat && !linked && text.slice(end).match(new RegExp(`^\\s+(?:to|against|on)\\s+${description}`, 'i'));
            const target = victim && position.resolve({ name: (victim.groups.type || victim.groups.firstType).toLowerCase(),
                owner: victim.groups.owner, square: victim.groups.square || victim.groups.squareFirst,
                plural: victim.groups.plural, index: end, end: end + victim[0].length });
            if(linked && threat) {
                position.fen = linked.beforeFen;
                references.relations.push(arrow(linked.from, linked.to, red));
                references.regions.push(region('Threat', [linked.capturedSquare || linked.to], red));
            } else if(linked && fork) {
                position.fen = linked.fen;
                const after = new Facts(linked.fen);
                const piece = after.board.get(linked.to);
                const victims = piece ? after.find(null, other(piece.color))
                    .filter(item => after.attackers(item.square, piece.color).includes(linked.to)) : [];
                if(victims.length >= 2) {
                    references.relations.push(arrow(linked.from, linked.to, red));
                    victims.slice(0, 3).forEach(item => references.relations.push(arrow(linked.to, item.square, red)));
                    references.regions.push(region('Fork', victims.slice(0, 3).map(item => item.square), red));
                }
            } else if(target?.status === 'resolved' && target.entities.length === 1) {
                const piece = target.entities[0];
                const attackers = facts.attackers(piece.square, other(piece.color)).slice(0, 3);
                attackers.forEach(source => references.relations.push(arrow(source, piece.square, red)));
                if(attackers.length) references.regions.push(region('Threat', [piece.square], red));
            } else {
            const targets = source => fork ? facts.find(null, other(source.color))
                .filter(target => facts.attackers(target.square, source.color).includes(source.square)) : facts.targets(source.square);
            let source = focus || null;
            if(fork && !source) {
                const candidates = facts.find(null, color || position.subject || position.color)
                    .filter(piece => targets(piece).length >= 2);
                if(candidates.length === 1) source = candidates[0];
            }
            const victims = source ? targets(source) : [];
            if(source && (!fork || victims.length >= 2)) {
                victims.slice(0, 3).forEach(target => references.relations.push(arrow(source.square, target.square, red)));
                if(victims.length) references.regions.push(region(fork ? 'Fork' : 'Threat', victims.slice(0, 3).map(target => target.square), red));
            }
            }
        } else if(pin) {
            const skewer = /skewer/i.test(pin);
            const passive = /pinned|skewered/i.test(pin) || binding && binding.end > match.index + match[0].length;
            const after = !passive && text.slice(match.index + match[0].length).match(followingDescription);
            const victim = after && position.resolve({ name: (after.groups.type || after.groups.firstType).toLowerCase(),
                owner: after.groups.owner, square: after.groups.square || after.groups.squareFirst,
                plural: after.groups.plural, index: match.index + match[0].length,
                end: match.index + match[0].length + after[0].length });
            const pinLines = role => facts.lines().filter(line => line.kind === (skewer ? 'skewer' : 'pin')
                && (!color || (passive ? line.color !== color : line.color === color))
                && (!binding || binding.pieces.some(piece => role(line).includes(piece.square)))
                && (!focus || (passive ? line.front : line.slider) === focus.square)
                && (!victim || victim.status === 'resolved' && victim.entities.some(piece => [line.front, line.slider].includes(piece.square))));
            let lines = pinLines(line => [passive ? line.front : line.slider]);
            // "the only pin is the queen": the named piece can be the pinner as well.
            if(!lines.length && binding?.pieces.length) lines = pinLines(line => [line.front, line.slider]);
            if(!focus && !binding && lines.length > 1) lines = [];
            // "steps out of the pin" or "breaks the pin": show the pin the moved piece just left, on the board before the move.
            if(position.frame?.beforeFen && position.frame.from && /\b(?:out of|from|break\w*|releas\w*|escap\w*|unpin\w*|deal\w* with|solv\w*|gets? rid of)\s+(?:(?:the|that|this|your|its)\s+)?$/i
                .test(text.slice(0, match.index))) {
                const freed = new Facts(position.frame.beforeFen).lines().filter(line => line.kind === (skewer ? 'skewer' : 'pin')
                    && [line.front, line.back].includes(position.frame.from));
                if(freed.length) { lines = freed; position.fen = position.frame.beforeFen; }
            }
            // "the pin on f7", "out of the pin" or "your bishop is pinned": a named square or the pinned side picks the line.
            if(!lines.length && !binding && !victim) {
                const all = facts.lines().filter(line => line.kind === (skewer ? 'skewer' : 'pin'));
                const sentence = text.slice(text.slice(0, match.index).search(/[^.!?;]*$/)).split(/[.!?;]/)[0];
                const named = sentence.match(/\b[a-h][1-8]\b/g) || [];
                const touching = all.filter(line => [line.slider, line.front, line.back].some(square => named.includes(square)));
                const side = color || clauseSide(text, match.index, position.root);
                const sided = side ? all.filter(line => passive || /\b(?:from|out of|break\w*|releas\w*|escap\w*|deal\w*|unpin\w*)\b[^.!?;]*$/i
                    .test(text.slice(0, match.index)) ? line.color !== side : line.color === side) : [];
                lines = touching.length && touching.length <= 2 ? touching : sided.length === 1 ? sided : all.length === 1 ? all : [];
            }
            for(const line of lines) {
                references.relations.push(arrow(line.slider, line.front, red), arrow(line.front, line.back, red));
                references.squares.push(line.back);
            }
            if(lines.length) references.regions.push(region(skewer ? 'Skewer' : 'Pinned', lines.map(line => line.front), red));
        } else if(battery) {
            let found = facts.batteries(color || position.subject || position.color);
            if(focus) found = found.filter(pair => pair.includes(focus.square));
            if(!focus && found.length > 1) found = [];
            for(const [first, second] of found) references.relations.push(arrow(first, second, blue));
            if(found.length) references.regions.push(region('Battery', found.flat(), blue));
        } else if(openFile) {
            const side = color || position.color;
            const half = /half|semi/i.test(openFile);
            const files = [...'abcdefgh'].filter(file => {
                const own = facts.find(['p'], side).some(pawn => pawn.square[0] === file);
                const enemy = facts.find(['p'], other(side)).some(pawn => pawn.square[0] === file);
                return half ? !own && enemy : !own && !enemy;
            });
            const chosen = focus && files.includes(position.focus[0]) ? [position.focus[0]] : files.length <= 2 ? files : [];
            for(const file of chosen) references.regions.push(region(`${half ? 'Half-open' : 'Open'} ${file}-file`,
                SQUARES.filter(square => square[0] === file), blue));
        } else if(rank) {
            const number = { first: 1, second: 2, seventh: 7, eighth: 8 }[rank.toLowerCase()];
            references.regions.push(region(`Rank ${number}`, SQUARES.filter(square => square[1] === String(number)), blue));
        } else if(king) {
            const side = color || clauseSide(text, match.index, position.root) || (/exposed/i.test(king) ? null : position.color);
            const kings = facts.find(['k'], side);
            const square = kings.length === 1 ? kings[0].square : null;
            if(square) references.regions.push(region('King shelter', SQUARES.filter(target =>
                Math.abs(target.charCodeAt(0) - square.charCodeAt(0)) <= 1 && Math.abs(Number(target[1]) - Number(square[1])) <= 1), blue));
        } else if(structure) {
            const side = color || position.subject || position.color;
            const own = facts.find('p', side);
            if(/chain|protect|defend|support/i.test(structure)) {
                for(const pawn of own) for(const source of facts.attackers(pawn.square, side)) {
                    if(facts.board.get(source)?.type === 'p') references.relations.push(arrow(source, pawn.square, green));
                }
                references.relations = references.relations.slice(0, 4);
                if(references.relations.length)
                    references.regions.push(region('Pawn chain', [...new Set(references.relations.flat())], green));
            } else if(/connected|linked/i.test(structure)) {
                const connected = own.filter(pawn => own.some(other => other !== pawn
                    && Math.abs(other.square.charCodeAt(0) - pawn.square.charCodeAt(0)) === 1
                    && Math.abs(Number(other.square[1]) - Number(pawn.square[1])) <= 1));
                if(connected.length) references.regions.push(region('Connected pawns', connected.map(pawn => pawn.square), green));
            } else if(/island/i.test(structure)) {
                const files = [...new Set(own.map(pawn => pawn.square[0]))].sort();
                const islands = [];
                for(const file of files) {
                    if(!islands.length || file.charCodeAt(0) - islands.at(-1).at(-1).charCodeAt(0) !== 1) islands.push([]);
                    islands.at(-1).push(file);
                }
                for(const files of islands) references.regions.push(region('Pawn island', own
                    .filter(pawn => files.includes(pawn.square[0])).map(pawn => pawn.square), blue));
            } else if(/structure/i.test(structure)) {
                if(own.length) references.regions.push(region('Pawn structure', own.map(pawn => pawn.square), blue));
            } else if(/storm/i.test(structure)) {
                const wing = /queenside|queen-side/i.test(structure) ? 'abcd'
                    : /kingside|king-side/i.test(structure) ? 'efgh' : null;
                const advanced = own.filter(pawn => (!wing || wing.includes(pawn.square[0]))
                    && (side === 'w' ? Number(pawn.square[1]) >= 4 : Number(pawn.square[1]) <= 5));
                if(advanced.length > 1) references.regions.push(region('Pawn storm', advanced.map(pawn => pawn.square), green));
            } else {
                for(const [wing, files] of [['queenside', 'abcd'], ['kingside', 'efgh']]) {
                    if(/(?:king|queen)[- ]?side/i.test(structure) && !structure.toLowerCase().replace(/[- ]/g, '').includes(wing)) continue;
                    const ours = own.filter(pawn => files.includes(pawn.square[0]));
                    const theirs = facts.find('p', other(side)).filter(pawn => files.includes(pawn.square[0]));
                    if(ours.length > theirs.length) references.regions.push(region(`Pawn majority (${ours.length} vs ${theirs.length})`,
                        ours.map(pawn => pawn.square), green));
                }
            }
        } else if(advanced) {
            const list = pawns.filter(pawn => pawn.color === 'w' ? Number(pawn.square[1]) >= 5 : Number(pawn.square[1]) <= 4);
            if(list.length && list.length <= 4)
                references.regions.push(region('Advanced pawn', list.map(pawn => pawn.square), green));
        } else if(weakSquare) {
            const named = text.slice(match.index + match[0].length).match(/^\s+(?:(?:on|at|is|are|include)\s+)?([a-h][1-8](?:\s*(?:,|and|or)\s*[a-h][1-8])*)\b/i)?.[1];
            const side = color || position.subject || position.color;
            const targets = named?.match(/[a-h][1-8]/g)
                || (focus?.color === side && ['n', 'b'].includes(focus.type) && (position.subject || /outpost/i.test(weakSquare)) ? [focus.square] : []);
            const valid = targets.filter(target => !/outpost/i.test(weakSquare)
                || !facts.attackers(target, other(side)).some(square => facts.board.get(square)?.type === 'p'));
            if(valid.length) references.regions.push(region(/outpost/i.test(weakSquare) ? 'Outpost' : 'Key square', valid, blue));
        } else if(discovered && position.beforeFen && focus) {
            const before = new Facts(position.beforeFen);
            const side = focus.color;
            for(const target of facts.find(null, other(side))) {
                if(/check/i.test(discovered) && target.type !== 'k') continue;
                for(const source of facts.attackers(target.square, side)) {
                    if(source === focus.square || !['b', 'r', 'q'].includes(facts.board.get(source)?.type)
                        || before.attackers(target.square, side).includes(source)) continue;
                    references.relations.push(arrow(source, target.square, red));
                    references.squares.push(target.square);
                }
            }
            if(references.squares.length)
                references.regions.push(region('Discovered attack', [...new Set(references.squares)], red));
        } else if(mating) {
            const side = color || position.subject || position.color;
            const king = facts.find('k', other(side))[0];
            if(king) {
                const controlled = SQUARES.filter(square => square !== king.square
                    && facts.board.get(square)?.color !== king.color
                    && Math.abs(square.charCodeAt(0) - king.square.charCodeAt(0)) <= 1
                    && Math.abs(Number(square[1]) - Number(king.square[1])) <= 1
                    && facts.attackers(square, side).length);
                if(controlled.length) references.regions.push(region('Controlled king escapes', controlled, red));
                for(const source of facts.attackers(king.square, side))
                    references.relations.push(arrow(source, king.square, red));
            }
        } else if(castle) {
            const both = /\bboth sides\b/i.test(text.slice(match.index).split(/[.!?;]/)[0]);
            const rights = facts.board.fen().split(' ')[2];
            const named = color || clauseSide(text, match.index, position.root) || position.subject || position.color;
            const done = hideMoves || /castled/i.test(castle) || /\b(?:no longer|cannot|can't|lost|without|never|gave up)\b[^.!?;]*$/i.test(text.slice(0, match.index));
            for(const side of done ? [] : both ? ['w', 'b'] : [named]) {
                const rank = side === 'w' ? '1' : '8';
                const has = flag => rights.includes(side === 'w' ? flag.toUpperCase() : flag);
                const long = /queen[ -]?side|long/i.test(text) ? has('q') : !has('k') && has('q');
                if(facts.board.get('e' + rank)?.type === 'k' && (long || has('k'))) {
                    const purple = '#b197fc';
                    references.relations.push(arrow('e' + rank, (long ? 'c' : 'g') + rank, purple),
                        arrow((long ? 'a' : 'h') + rank, (long ? 'd' : 'f') + rank, purple));
                    references.regions.push(region(long ? 'Castle queenside' : 'Castle kingside', [(long ? 'c' : 'g') + rank], purple));
                }
            }
            // Castling already happened or is gone, so the king's shelter is what matters.
            const bothKings = done && /\bboth (?:kings|sides)\b/i.test(text.slice(text.slice(0, match.index).search(/[^.!?;]*$/)).split(/[.!?;]/)[0]);
            const kings = references.relations.length || both && !bothKings ? []
                : bothKings ? facts.find(['k']) : facts.find(['k'], named).slice(0, 1);
            for(const king of kings) references.regions.push(region('King shelter', SQUARES.filter(target =>
                Math.abs(target.charCodeAt(0) - king.square.charCodeAt(0)) <= 1 && Math.abs(Number(target[1]) - Number(king.square[1])) <= 1), blue));
        }
        if(!references.regions.length && !references.relations.length && !references.squares.length) continue;
        for(const item of references.regions) item.anchor = item.squares[0];
        cues.push({ index: match.index, end: binding?.end || match.index + match[0].length, references,
            positionFen: binding?.facts?.board.fen() || position.fen });
    }
    return cues;
}

// The glossary supplies aliases; these recipes add live-board evidence for dynamic ideas.
export function mechanismCues(text, at, moves = []) {
    const cues = [];
    for(const mention of glossaryMentions(text)) {
        if(negatedConcept(text.slice(0, mention.index))) continue;
        const position = at(mention.index), frame = position.frame;
        const facts = new Facts(position.fen);
        const references = { squares: [], regions: [], relations: [] };
        if(mention.term === 'material') {
            const named = text.slice(mention.index, mention.end).match(/\b(pawn|knight|bishop|rook|queen)\b/i)?.[1]?.toLowerCase();
            for(const side of ['w', 'b']) {
                const pieces = facts.find(named ? types[named] : ['p', 'n', 'b', 'r', 'q'], side);
                const amount = named ? pieces.length : pieces.reduce((total, piece) => total + values[piece.type], 0);
                if(pieces.length) references.regions.push(region(`${side === 'w' ? 'White' : 'Black'}: ${amount} ${named ? named + (amount === 1 ? '' : 's') : 'material points'}`,
                    pieces.map(piece => piece.square), side === 'w' ? blue : red));
            }
        } else if(mention.term === 'double check') {
            const next = moves.find(move => move.index >= mention.end && move.index - mention.end <= 30
                && !/[.!?;]/.test(text.slice(mention.end, move.index)));
            const board = next ? new Facts(next.fen) : facts;
            const king = board.find('k', board.board.turn())[0];
            const checking = king && board.board.in_check() ? board.attackers(king.square, other(king.color)) : [];
            if(checking.length >= 2) {
                checking.forEach(source => references.relations.push(arrow(source, king.square, red)));
                references.regions.push(region('Double check', [king.square, ...checking], red));
                position.fen = board.board.fen();
            }
        } else if(mention.term === 'tempo' && frame) {
            const mover = facts.board.get(frame.to);
            if(!mover) continue;
            const targets = facts.find(null, other(mover.color)).filter(piece => facts.attackers(piece.square, mover.color).includes(frame.to));
            references.relations = targets.map(piece => arrow(frame.to, piece.square, red));
            if(targets.length) references.regions.push(region('Attack gains time if answered', [frame.to], blue));
        } else if(['clearance', 'discovered attack', 'piece activity'].includes(mention.term) && frame) {
            const before = new Facts(frame.beforeFen), mover = facts.board.get(frame.to);
            if(!mover) continue;
            for(const slider of facts.find(['b', 'r', 'q'], mover.color).filter(piece => piece.square !== frame.to)) {
                const opened = SQUARES.filter(square => facts.attackers(square, mover.color).includes(slider.square)
                    && !before.attackers(square, mover.color).includes(slider.square));
                if(opened.length) references.regions.push(region(`Line opened for ${slider.square}`, [slider.square, ...opened], blue));
            }
        } else if(mention.term === 'blockade') {
            const pawns = facts.find('p');
            for(const pawn of pawns) {
                const square = pawn.square[0] + (Number(pawn.square[1]) + (pawn.color === 'w' ? 1 : -1));
                const blocker = facts.board.get(square);
                if(!blocker || blocker.color === pawn.color || position.focus && ![square, pawn.square].includes(position.focus)) continue;
                references.relations.push(arrow(square, pawn.square, blue));
                references.regions.push(region('Pawn blocked', [square, pawn.square], blue));
            }
        } else if(mention.term === 'pawn chain') {
            const focus = facts.board.get(position.focus);
            const side = focus?.type === 'p' ? focus.color : position.subject || position.color;
            const edges = facts.find('p', side).flatMap(pawn => facts.attackers(pawn.square, side)
                .filter(square => facts.board.get(square)?.type === 'p').map(square => [square, pawn.square]));
            const connected = new Set(focus?.type === 'p' ? [position.focus] : edges.flat());
            let size;
            do {
                size = connected.size;
                for(const pair of edges) if(pair.some(square => connected.has(square))) pair.forEach(square => connected.add(square));
            } while(size !== connected.size);
            references.relations = edges.filter(pair => pair.every(square => connected.has(square)));
            if(references.relations.length) references.regions.push(region('Pawn chain', [...connected], green));
        } else if(mention.term === 'opposition') {
            const white = facts.find('k', 'w')[0], black = facts.find('k', 'b')[0];
            const dx = Math.abs(white.square.charCodeAt(0) - black.square.charCodeAt(0));
            const dy = Math.abs(Number(white.square[1]) - Number(black.square[1]));
            if(dx === 0 && dy === 2 || dy === 0 && dx === 2) {
                const middle = String.fromCharCode((white.square.charCodeAt(0) + black.square.charCodeAt(0)) / 2)
                    + ((Number(white.square[1]) + Number(black.square[1])) / 2);
                references.regions.push(region('Direct opposition', [white.square, middle, black.square], blue));
            }
        }
        if(references.regions.length || references.relations.length)
            cues.push({ index: mention.index, end: mention.end, references, positionFen: position.fen });
    }
    for(const match of text.matchAll(/\b(?:at home|asleep|undeveloped)\b/gi)) {
        if(negatedConcept(text.slice(0, match.index))) continue;
        const position = at(match.index), bound = position.bind(match.index, match.index + match[0].length);
        if(bound && bound.status !== 'resolved') continue;
        const side = bound?.entities[0]?.color || clauseSide(text, match.index, position.root) || position.root;
        const facts = new Facts(bound?.fen || position.fen);
        const pieces = (bound?.entities || facts.find(['n', 'b'], side))
            .filter(piece => ['n', 'b'].includes(piece.type) && piece.square[1] === (piece.color === 'w' ? '1' : '8'));
        if(pieces.length) cues.push({ index: match.index, end: match.index + match[0].length,
            references: { squares: [], relations: [], regions: [region('Pieces still at home', pieces.map(piece => piece.square), blue)] },
            positionFen: facts.board.fen() });
    }
    return cues;
}

const orange = '#ffa94d';
const tradeWord = /(?<!\bin )\b(?:trad(?:e[sd]?|ing)|exchang(?:e[sd]?|ing)|simplif\w*)\b/gi;
const tradePiece = /^\s+(?:(?:off|of|the|a|both|two|pairs? of|white|black|their|its|your|remaining|active|passive|bad|good|strong|light-squared|dark-squared|\w+'s)\s+)*(queens?|rooks?|bishops?|knights?|pawns?)\b/i;

// A trade is only drawn when the board pins down where it happens: an explicit
// square, a legal capture in the same sentence, or a single piece of the named
// type on each side. Anything vaguer gets no cue rather than invented arrows.
export function tradeCues(text, at, moves = []) {
    const captures = moves.filter(item => item.san.includes('x'));
    const cues = [];
    for(const match of text.matchAll(tradeWord)) {
        const start = match.index, end = start + match[0].length;
        const sentenceStart = Math.max(0, ...[...text.slice(0, start).matchAll(/[.!?](?=\s)/g)].map(stop => stop.index + 1));
        const tail = text.slice(end).search(/[.!?](?=\s|$)/);
        const sentenceEnd = tail < 0 ? text.length : end + tail;
        const named = text.slice(Math.max(sentenceStart, start - 14), start).match(/\b(queen|rook|bishop|knight)s?\s+$/i)?.[1]
            || text.slice(end, sentenceEnd).match(tradePiece)?.[1];
        const type = named ? types[named.toLowerCase().replace(/s$/, '')] : null;
        const involves = capture => {
            const board = new Chess(capture.beforeFen);
            return !type || board.get(capture.from)?.type === type || (board.get(capture.to)?.type || 'p') === type;
        };
        const explicit = text.slice(end, sentenceEnd).match(/^\s+(?:\w+\s+){0,2}?on ([a-h][1-8])\b/i)?.[1];
        const capture = captures.filter(involves).find(item => item.index >= end && item.index < sentenceEnd && item.index - end <= 40)
            || captures.filter(item => item.end <= start && item.index >= sentenceStart && involves(item)).at(-1)
            || (/\b(?:this|that|the)\s+$/i.test(text.slice(0, start)) ? captures.filter(item => item.end <= start && involves(item)).at(-1) : null);
        // "Ng3, offering a trade": the trade would happen where the piece just landed.
        const offered = !capture && (moves.filter(item => item.end <= start && item.index >= sentenceStart && !item.san.includes('x')).at(-1)
            || moves.find(item => item.index >= end && item.index < sentenceEnd && !item.san.includes('x')
                && /^[^.!?;]*\b(?:via|with|by|through|playing)\s+(?:\.\.\.)?$/i.test(text.slice(end, item.index))));
        const references = { squares: [], regions: [], relations: [] };
        let positionFen = at(start).fen;
        if(offered && (!type || new Chess(offered.fen).get(offered.to)?.type === type)) {
            const facts = new Facts(offered.fen);
            const takers = facts.attackers(offered.to, facts.board.turn()).slice(0, 3);
            if(takers.length) {
                takers.forEach(source => references.relations.push(arrow(source, offered.to, blue)));
                facts.attackers(offered.to, other(facts.board.turn())).slice(0, 3)
                    .forEach(source => references.relations.push(arrow(source, offered.to, orange)));
                references.regions.push(region(`Trade on ${offered.to}`, [offered.to], orange));
                cues.push({ index: start, end, references, positionFen: offered.fen });
                continue;
            }
        }
        const target = explicit || capture?.to;
        if(target) {
            const facts = new Facts(explicit ? at(start).fen : capture.beforeFen);
            positionFen = facts.board.fen();
            const mover = facts.board.turn();
            const first = facts.attackers(target, mover).slice(0, 3), second = facts.attackers(target, other(mover)).slice(0, 3);
            if(!capture && !(first.length && (second.length || facts.board.get(target)))) continue;
            first.forEach(source => references.relations.push(arrow(source, target, orange)));
            second.forEach(source => references.relations.push(arrow(source, target, blue)));
            references.regions.push(region(`Trade on ${target}`, [target], orange));
        } else if(type) {
            const facts = new Facts(at(start).fen);
            const white = facts.find([type], 'w'), black = facts.find([type], 'b');
            if(white.length !== 1 || black.length !== 1) continue;
            const [w, b] = [white[0].square, black[0].square];
            if(facts.attackers(b, 'w').includes(w)) references.relations.push(arrow(w, b, orange));
            if(facts.attackers(w, 'b').includes(b)) references.relations.push(arrow(b, w, orange));
            references.regions.push(region(`${named[0].toUpperCase()}${named.slice(1).toLowerCase().replace(/s$/, '')} trade`, [w, b], orange));
        } else continue;
        cues.push({ index: start, end, references, positionFen });
    }
    return cues;
}
