import { PositionGraph, effectsBetween } from './positions.js';
import { spatialFacts } from './spatial.js';
import { strategicProfile, strategyMotifs } from './strategy.js';
import { binPropValues, pcfBinPropMotifs } from './binprop-full.js';
import CaptureExchange from '../../js/misc/captureExchange.js';
import { pcfReplyFacts } from './pcf-replies.js';

const colors = ['w', 'b'];
const squareName = (file, rank) => 'abcdefgh'[file] + rank;
const fileOf = square => square.charCodeAt(0) - 97;
const rankOf = square => Number(square[1]);
const list = values => values.length ? [...values].sort().join(',') : '-';
const flag = value => value ? '1' : '0';
const other = color => color === 'w' ? 'b' : 'w';
export const pcfBinPropOrder = Object.freeze(pcfBinPropMotifs.map(motif => motif.id));
const binPropFits = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];
const binaryVector = new RegExp(`^[01]{${pcfBinPropOrder.length}}$`);
const countVector = new RegExp(`^[0-4]{${pcfBinPropOrder.length}}$`);
const fitVector = new RegExp(`^[0-6]{${pcfBinPropOrder.length}}$`);
const coverageGroups = Object.freeze({ full: 'frame,material,relations,controls,legal,special,exchange,activity,pawn,pair,square,ray,pin,binprop,binflags',
    delta: 'frame,transition,delta', history: 'frame,material,relations,controls,pawn,binprop,binflags' });

export const pcfColumns = Object.freeze({
    F: ['frame', 'scope', 'parent', 'move', 'turn', 'player', 'castlingRights', 'enPassantTarget', 'legalEnPassant', 'halfmove', 'fullmove', 'check', 'mate', 'stalemate'],
    K: ['frame', 'mode', 'totalPieces', 'includedPieces', 'completeGroups'],
    I: ['frame', 'whitePoints', 'blackPoints', 'whiteMinusBlack', 'whiteCounts', 'blackCounts'],
    R: ['frame', 'square', 'piece', 'entity', 'enemyAttackers', 'friendlyDefenders', 'enemyTargets', 'friendlyTargets'],
    G: ['frame', 'square', 'geometricControls'],
    L: ['frame', 'square', 'legalMoves'],
    U: ['frame', 'move', 'captureSquare', 'promotion', 'castle', 'check', 'mate'],
    C: ['frame', 'square', 'legalCaptures', 'localExchangeGain'],
    A: ['frame', 'square', 'pawnConstrainedControls', 'ownKingFileOffset', 'ownKingRankOffset', 'enemyKingFileOffset', 'enemyKingRankOffset'],
    P: ['frame', 'square', 'passed', 'isolated', 'doubled', 'promotionSquare', 'promotionRanks', 'frontOccupant', 'pawnDefenders'],
    J: ['frame', 'pawn1', 'pawn2', 'fileOffset', 'rankOffset', 'sameColor', 'pawn1AttacksPawn2', 'pawn2AttacksPawn1'],
    S: ['frame', 'square', 'whiteControlCount', 'blackControlCount', 'whitePawnControlCount', 'blackPawnControlCount'],
    X: ['frame', 'slider', 'directionFile', 'directionRank', 'emptySquares', 'firstBlocker'],
    N: ['frame', 'kind', 'slider', 'front', 'back', 'frontLegalMoves'],
    B: ['frame', 'color', 'pawnStructure', 'pawnPressure', 'defensiveDuties', 'kingZonePressure', 'advancedControl', 'advancedScanStopped', 'developedMinors', 'centralControls'],
    BINS: ['frame', 'color', ...pcfBinPropMotifs.map(motif => `${motif.code}:${motif.name}`)],
    BCHANGE: ['frame', 'before', 'color', 'becameTrue', 'becameFalse', 'pawnStructureDelta', 'pawnPressureDelta', 'defensiveDutiesDelta', 'kingZonePressureDelta', 'advancedControlDelta', 'developedMinorsDelta', 'centralControlsDelta'],
    BINLINE: ['frame', 'source', 'line', 'plies', 'perspective', 'predicates'],
    BINCOMP: ['frame', 'source', 'preferred', 'alternative', 'plies', 'perspective', 'positiveSamples', 'negativeSamples', 'positiveTrueCounts', 'negativeFalseCounts', 'supportFits', 'weightedScores', 'strictContrasts'],
    E: ['frame', 'id', 'source', 'path', 'preferred', 'valueKind', 'rootSideValue', 'visits', 'policyPrior', 'budget'],
    Q: ['frame', 'id', 'move', 'probability', 'selfElo', 'opponentElo'],
    H: ['frame', 'id', 'predicate', 'subject', 'value1', 'value2', 'value3', 'value4', 'value5', 'value6', 'value7', 'value8'],
    W: ['frame', 'id', 'kind', 'source', 'preferred', 'alternative', 'plies', 'whitePreferredWitnesses', 'whiteAlternativeWitnesses', 'blackPreferredWitnesses', 'blackAlternativeWitnesses'],
    Z: ['frame', 'id', 'line', 'ply', 'move', 'effects'],
    V: ['frame', 'id', 'square', 'piece', 'entity', 'enemyTargets', 'enemyAttackers', 'friendlyDefenders', 'next', 'check', 'mate', 'stalemate', 'legalMoves', 'legalCaptures'],
    REPLY: ['frame', 'id', 'parentMove', 'replyMove', 'rank', 'preferred', 'childTurn', 'visits', 'policyPrior', 'childSideQ', 'nodes', 'optionsAvailable', 'optionsOmitted', 'continuation'],
    Y: ['frame', 'occurrences', 'threefoldThresholdObserved', 'halfmoves', 'fiftyMoveThreshold', 'suppliedPriorPositions', 'earlierHistoryMayBeMissing', 'lc0PriorPositionHorizon'],
    M: ['frame', 'source', 'preferred', 'alternative', 'plies', 'metric', 'color', 'preferredMin', 'preferredMax', 'alternativeMin', 'alternativeMax', 'differenceMin', 'differenceMax', 'bounded'],
    T: ['frame', 'parent', 'move', 'actor', 'from', 'to', 'captureSquare', 'capturedEntity', 'promotion', 'movedPieces'],
    D: ['frame', 'change', 'kind', 'actor', 'from', 'to', 'target'],
    O: ['historySupplied', 'historyFramesComputed', 'historyFramesIncluded', 'historyComplete', 'conditionalFramesAvailable', 'conditionalFramesIncluded', 'sourceReferencesAvailable', 'sourceReferencesOmitted', 'requestedHistoryMoves', 'matchedHistoryMoves', 'requestedHistoryFrames', 'requestedHistoryFramesIncluded', 'sourceConditionalFrames', 'sharedConditionalFrames', 'plyFactsAvailable', 'plyFactsIncluded', 'comparisonGroupsAvailable', 'comparisonGroupsIncluded', 'replyParentsSearched', 'replyOptionsAvailable', 'replyOptionsIncluded', 'binaryComparisonsAvailable', 'binaryComparisonsIncluded']
});

const cellPattern = /^[A-Za-z0-9@.,:+_~!?#=-]+$/;
const encodeOffset = value => {
    const offset = Number(value);
    if(!Number.isInteger(offset) || offset < -7 || offset > 7) throw new Error('Invalid PCF relative offset.');
    return String(offset + 7).padStart(2, '0');
};
const decodeOffset = value => {
    if(!/^\d{2}$/.test(value) || Number(value) > 14) throw new Error('Malformed PCF relative offset.');
    return String(Number(value) - 7);
};
const frameCache = new Map(), historyCache = new Map();
const rangeCell = (low, high) => low === high ? low : `${low}:!${high}`;
const parseRange = value => {
    const parts = value.replace(':!', ':').split(':');
    if(parts.length < 1 || parts.length > 2 || parts.some(part => !part || !Number.isFinite(Number(part))))
        throw new Error('Malformed PCF range.');
    return parts.length === 1 ? [parts[0], parts[0]] : parts;
};
function wireListIndexes(kind, values, frame) {
    const fixed = { R: [3, 4, 5, 6], G: [1], L: [1], C: [1], A: [1], P: [5], X: [2], N: [4],
        E: [2], W: [6, 7, 8, 9], Z: [4], V: [4, 5, 6, 11, 12], REPLY: [12], T: [8], K: [3], F: [8], BINCOMP: [1, 2], BCHANGE: [2, 3] };
    if(kind === 'I') return frame === 'C' ? [4, 5] : [3, 4];
    if(kind === 'H') {
        const fields = { defense: [3, 4], mobility: [4], controls: [3, 4], pins: [3], blockers: [3],
            'king-geometry': [9, 10], 'move-effects': [4] };
        return fields[values[1]] || [];
    }
    return fixed[kind] || [];
}
function mapWireAtoms(kind, values, frame, unpack, plain = false) {
    if(plain) return;
    const lists = new Set(wireListIndexes(kind, values, frame));
    const atom = /^(?:[a-h][1-8](?:[a-h][1-8][qrbn]?)?|[wb][PNBRQK]|@[1-9]\d*)$/;
    for(let index = 0; index < values.length; index++) {
        if(lists.has(index)) continue;
        const value = values[index];
        if(unpack && value.startsWith('!') && atom.test(value.slice(1))) values[index] = value.slice(1);
        else if(!unpack && atom.test(value)) values[index] = '!' + value;
        else if(unpack && atom.test(value)) throw new Error('PCF spatial atom lacks its tokenizer boundary marker.');
    }
}
function repeatedEffectPrefix(value) {
    const parts = value.split('.');
    const piece = text => /^[wb][PNBRQK]$/.test(text), square = text => /^[a-h][1-8]$/.test(text);
    if(['attack', 'defend'].includes(parts[0]) && parts.length === 5 && piece(parts[1]) && square(parts[2]) && piece(parts[3]) && square(parts[4])) return parts.slice(0, 3).join('.');
    if(parts[0] === 'center' && parts.length === 4 && piece(parts[1]) && square(parts[2]) && square(parts[3])) return parts.slice(0, 3).join('.');
    if(parts[0] === 'ray' && parts.length === 6 && piece(parts[1]) && square(parts[2]) && piece(parts[3]) && square(parts[4]) && square(parts[5])) return parts.slice(0, 5).join('.');
    return null;
}
function mapWireLists(kind, values, frame, unpack, plain = false) {
    for(const index of wireListIndexes(kind, values, frame)) {
        if(index >= values.length || ['-', '~', '?'].includes(values[index])) continue;
        if(unpack) {
            let items;
            if(plain) {
                if(values[index].includes('!') || values[index].split(',').some(item => !item))
                    throw new Error('Malformed PCF list separator.');
                items = values[index].split(',');
            } else {
                if(!values[index].startsWith('!') || values[index].length === 1 || values[index].includes('!!'))
                    throw new Error('Malformed PCF list separator.');
                items = values[index].slice(1).replace(/([.:])!/g, '$1').split('!');
            }
            let previous = null;
            values[index] = items.map(value => {
                if(kind === 'Z' && value.startsWith('MORE.')) {
                    if(!previous) throw new Error('PCF repeated effect has no preceding source.');
                    value = `${previous}.${value.slice(5)}`;
                    if(repeatedEffectPrefix(value) !== previous) throw new Error('Malformed PCF repeated effect.');
                }
                if(kind === 'Z') previous = repeatedEffectPrefix(value);
                return kind === 'Z' && value.startsWith('action.') ? value.replace(/\.CHECK$/, '+').replace(/\.MATE$/, '#') : value;
            }).join(',');
        } else {
            const nested = ['W', 'Z', 'V', 'T'].includes(kind) || kind === 'H' && ['pins', 'blockers', 'move-effects'].includes(values[1]);
            let previous = null;
            const items = values[index].split(',').map(value => {
                if(kind === 'Z' && value.startsWith('action.')) value = value.replace(/\+$/, '.CHECK').replace(/#$/, '.MATE');
                if(kind === 'Z') {
                    const prefix = repeatedEffectPrefix(value);
                    if(prefix && prefix === previous) value = `MORE.${value.slice(prefix.length + 1)}`;
                    previous = prefix;
                }
                return nested && !plain ? value.replace(/([.:])(?=[A-Za-z0-9@?~-])/g, '$1!') : value;
            });
            values[index] = plain ? items.join(',') : '!' + items.join('!');
        }
    }
}
const frozen = value => {
    if(value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(frozen);
        Object.freeze(value);
    }
    return value;
};

function frameRecords(frame, alias, { playerColor, scope, parent = '-', move = '-', identities = null }) {
    const key = JSON.stringify([frame.fen, frame.pieces, alias, playerColor, scope, parent, move,
        frame.pieces.map(piece => identities?.get(piece.id) || piece.id)]);
    if(frameCache.has(key)) return frameCache.get(key).map(row => ({ kind: row.kind, values: [...row.values] }));
    const spatial = spatialFacts(frame);
    const fields = frame.fen.split(' '), pieces = spatial.pieces;
    const at = new Map(pieces.map(piece => [piece.square, piece]));
    const idToPiece = new Map(pieces.map(piece => [piece.id, piece]));
    const pieceId = id => identities?.get(id) || id;
    const squareFor = id => {
        const piece = idToPiece.get(id);
        if(!piece) throw new Error('PCF relation names an absent piece.');
        return piece.square;
    };
    const rows = [];
    const add = (kind, ...values) => rows.push({ kind, values: values.map(String) });
    const enPassant = spatial.legalMoves.filter(item => item.capturedId && item.capturedSquare !== item.to).map(item => item.uci);
    add('F', alias, scope, parent, move, spatial.turn, playerColor, fields[2], fields[3], list(enPassant), fields[4], fields[5],
        flag(spatial.check), flag(spatial.checkmate), flag(spatial.stalemate));
    const counts = color => ['p', 'n', 'b', 'r', 'q', 'k'].map(type => spatial.material[color].counts[type]).join(',');
    add('I', alias, spatial.material.w.points, spatial.material.b.points, spatial.material.whiteMinusBlack, counts('w'), counts('b'));
    const kings = Object.fromEntries(colors.map(color => [color, pieces.find(piece => piece.color === color && piece.type === 'k')]));
    const exchange = new CaptureExchange(frame.fen);
    if(!exchange.valid) throw new Error('PCF exchange analysis needs a valid position.');
    for(const piece of [...pieces].sort((a, b) => a.square.localeCompare(b.square))) {
        const enemyTargets = pieces.filter(target => target.color !== piece.color && piece.controls.includes(target.square)).map(target => target.square);
        const friendlyTargets = pieces.filter(target => target.color === piece.color && target.id !== piece.id && piece.controls.includes(target.square)).map(target => target.square);
        add('R', alias, piece.square, piece.color + piece.type.toUpperCase(), pieceId(piece.id),
            list(piece.attackers.map(squareFor)), list(piece.defenders.map(squareFor)), list(enemyTargets), list(friendlyTargets));
        add('G', alias, piece.square, list(piece.controls));
        add('L', alias, piece.square, piece.legalMoves === null ? '~' : list(piece.legalMoves));
        if(piece.color === spatial.turn || piece.type === 'k') add('C', alias, piece.square, '~', '~');
        else {
            const captures = spatial.legalMoves.filter(move => move.capturedSquare === piece.square).map(move => move.uci);
            const gain = captures.length ? exchange.captureLoss(piece.square) : 0;
            if(gain === null || !Number.isFinite(gain)) throw new Error('PCF exchange analysis failed for a legal capture target.');
            add('C', alias, piece.square, list(captures), gain);
        }
        const pawnControlled = new Set(pieces.filter(item => item.color !== piece.color && item.type === 'p').flatMap(item => item.controls));
        const pawnConstrained = piece.controls.filter(square => at.get(square)?.color !== piece.color && !pawnControlled.has(square));
        const own = kings[piece.color].square, enemy = kings[other(piece.color)].square;
        add('A', alias, piece.square, list(pawnConstrained), fileOf(piece.square) - fileOf(own), rankOf(piece.square) - rankOf(own),
            fileOf(piece.square) - fileOf(enemy), rankOf(piece.square) - rankOf(enemy));
    }
    for(const pawn of spatial.pawns) {
        const piece = idToPiece.get(pawn.pieceId), nextRank = rankOf(pawn.square) + (pawn.color === 'w' ? 1 : -1);
        const front = nextRank >= 1 && nextRank <= 8 ? at.get(pawn.square[0] + nextRank) : null;
        add('P', alias, pawn.square, flag(pawn.passed), flag(pawn.isolated), flag(pawn.doubled),
            pawn.square[0] + (pawn.color === 'w' ? 8 : 1), Math.abs(rankOf(pawn.square) - (pawn.color === 'w' ? 8 : 1)),
            front ? front.square : '-', list(piece.defenders.map(idToPiece.get.bind(idToPiece)).filter(item => item.type === 'p').map(item => item.square)));
    }
    for(const move of spatial.legalMoves) {
        const check = /[+#]$/.test(move.san), mate = /#$/.test(move.san);
        if(move.capturedId || move.promotion || move.castle || check)
            add('U', alias, move.uci, move.capturedSquare || '-', move.promotion || '-', move.castle || '-', flag(check), flag(mate));
    }
    const pawns = pieces.filter(piece => piece.type === 'p').sort((a, b) => a.square.localeCompare(b.square));
    for(let i = 0; i < pawns.length; i++) for(let j = i + 1; j < pawns.length; j++) {
        const a = pawns[i], b = pawns[j], df = fileOf(b.square) - fileOf(a.square);
        if(Math.abs(df) > 1) continue;
        add('J', alias, a.square, b.square, df, rankOf(b.square) - rankOf(a.square), flag(a.color === b.color),
            flag(a.controls.includes(b.square)), flag(b.controls.includes(a.square)));
    }
    for(let rank = 1; rank <= 8; rank++) for(let file = 0; file < 8; file++) {
        const square = squareName(file, rank);
        const controlling = color => pieces.filter(piece => piece.color === color && piece.controls.includes(square));
        const white = controlling('w'), black = controlling('b');
        add('S', alias, square, white.length, black.length, white.filter(piece => piece.type === 'p').length,
            black.filter(piece => piece.type === 'p').length);
    }
    for(const ray of spatial.rays) add('X', alias, squareFor(ray.pieceId), ray.dx, ray.dy, list(ray.emptySquares), ray.firstBlocker?.square || '-');
    for(const pin of spatial.pins) add('N', alias, pin.kind === 'pin' ? pin.pinType : pin.kind,
        squareFor(pin.sliderId), squareFor(pin.frontId), squareFor(pin.backId), pin.frontLegalMoves === null ? '~' : list(pin.frontLegalMoves));
    const profile = strategicProfile(frame, playerColor);
    for(const color of colors) {
        const data = profile.colors[color];
        add('B', alias, color, data.pawnStructure.value, data.pawnPressure.value, data.defensiveDuties.value,
            data.kingZonePressure.value, data.advancedControl.value, flag(data.advancedControl.scanStopped),
            data.developedMinors.length, data.centralControls.length);
        if(scope !== 'conditional') {
            add('BINS', alias, color, ...binPropValues(frame.fen, color).map(flag));
        }
    }
    const order = Object.keys(pcfColumns);
    rows.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)
        || (a.kind === 'X' ? a.values[1].localeCompare(b.values[1]) || Number(a.values[2]) - Number(b.values[2])
            || Number(a.values[3]) - Number(b.values[3]) : 0));
    frameCache.set(key, frozen(rows.map(row => ({ kind: row.kind, values: [...row.values] }))));
    if(frameCache.size > 128) frameCache.delete(frameCache.keys().next().value);
    return rows;
}

function transitionRecords(before, after, alias, parentAlias, identities) {
    const rows = [], move = after.move;
    const id = value => value ? identities?.get(value) || value : '-';
    const moved = before.pieces.flatMap(piece => {
        const next = after.pieces.find(item => item.id === piece.id);
        return next && next.square !== piece.square ? [`${id(piece.id)}.${piece.square}.${next.square}`] : [];
    });
    rows.push({ kind: 'T', values: [alias, parentAlias, move.uci, id(move.pieceId), move.from, move.to,
        move.capturedSquare || '-', id(move.capturedId), move.promotion || '-', list(moved)] });
    const effects = effectsBetween(before, after);
    for(const [change, relations] of [['+', effects.gained], ['-', effects.lost]]) for(const relation of relations)
        rows.push({ kind: 'D', values: [alias, change, relation.kind, id(relation.pieceId), relation.from, relation.to, id(relation.targetId)] });
    return rows;
}

export function derivePcfRuleFrame(fen, currentRows, move, alias, playerColor) {
    if(!/^VQ[1-9]\d*$/.test(alias) || !['w', 'b'].includes(playerColor) || !Array.isArray(currentRows))
        throw new Error('Invalid rule-derived conditional frame input.');
    const graph = new PositionGraph(fen);
    const status = currentRows.filter(row => row.kind === 'F' && row.values[0] === 'C');
    const fields = graph.root.fen.split(' ');
    if(status.length !== 1 || status[0].values[5] !== playerColor
        || [4, 6, 7, 9, 10].some((index, i) => status[0].values[index] !== fields[[1, 2, 3, 4, 5][i]]))
        throw new Error('Rule-derived conditional frame does not match the current position status.');
    const pieces = currentRows.filter(row => row.kind === 'R' && row.values[0] === 'C');
    const bySquare = new Map(pieces.map(row => [row.values[1], row]));
    if(bySquare.size !== graph.root.pieces.length || pieces.length !== bySquare.size)
        throw new Error('Rule-derived conditional frame needs the complete current piece graph.');
    const identities = new Map();
    for(const piece of graph.root.pieces) {
        const row = bySquare.get(piece.square);
        if(!row || row.values[2] !== piece.color + piece.type.toUpperCase() || !row.values[3])
            throw new Error('Rule-derived conditional frame position does not match the current piece graph.');
        identities.set(piece.id, row.values[3]);
    }
    if(new Set(identities.values()).size !== identities.size)
        throw new Error('Rule-derived conditional frame needs unique piece identities.');
    const after = graph.advance(graph.root, move, alias, 'conditional');
    const records = frameRecords(after, alias, { playerColor, scope: 'conditional', parent: 'C', move, identities });
    const transition = transitionRecords(graph.root, after, alias, 'C', identities)
        .filter(row => row.kind === 'T' || row.kind === 'D' && ['attack', 'defend'].includes(row.values[2]));
    return [...records.filter(row => ['F', 'R'].includes(row.kind)), ...transition];
}

function engineRecords(input, identities) {
    const rows = [], add = (kind, ...values) => rows.push({ kind, values: values.map(String) });
    const root = input.frames.find(frame => frame.id === 'root');
    const rootSquare = id => {
        const piece = root.pieces.find(item => item.id === id);
        if(!piece) throw new Error('PCF question fact names an absent current piece.');
        return piece.square;
    };
    const pieceLabel = piece => `${piece.color}${piece.type.toUpperCase()}`;
    for(const ref of input.references.filter(item => item.kind === 'question-fact')) {
        const card = ref.data, data = card.data, values = Array(8).fill('-');
        if(ref.frameId !== 'root' || card.frameId !== 'root') throw new Error('PCF question fact must name its exact current frame.');
        let subject = '-';
        if(card.predicate === 'absence') {
            subject = data.subject.square || '?';
            values[0] = data.subject.color || '?'; values[1] = data.subject.type?.toUpperCase() || '?';
            values[2] = data.occupant ? pieceLabel(data.occupant) : data.subject.square ? '-' : '?';
        } else if(card.predicate === 'location') {
            subject = data.piece.square; values[0] = pieceLabel(data.piece);
        } else if(card.predicate === 'defense') {
            subject = rootSquare(data.pieceId); values[0] = list(data.attackers.map(rootSquare)); values[1] = list(data.defenders.map(rootSquare));
        } else if(card.predicate === 'mobility') {
            subject = rootSquare(data.pieceId); values[0] = flag(data.applicable); values[1] = data.moves === null ? '~' : list(data.moves.map(move => move.uci));
        } else if(card.predicate === 'controls') {
            subject = rootSquare(data.pieceId); values[0] = list(data.squares); values[1] = list(data.targets.map(piece => piece.square));
        } else if(card.predicate === 'pins') {
            subject = rootSquare(data.pieceId); values[0] = list(data.pins.map(pin => `${pin.slider}.${pin.front}.${pin.back}.${pin.pinType}`));
        } else if(card.predicate === 'blockers') {
            subject = rootSquare(data.pieceId); values[0] = list(data.rays.map(ray =>
                `${ray.dx}:${ray.dy}:${ray.emptySquares.join('+') || '-'}:${ray.firstBlocker?.square || '-'}`));
        } else if(card.predicate === 'material') {
            values.splice(0, 3, String(data.w.points), String(data.b.points), String(data.whiteMinusBlack));
        } else if(card.predicate === 'status') {
            values.splice(0, 5, data.turn, flag(data.check), flag(data.checkmate), flag(data.stalemate), data.drawRules);
        } else if(card.predicate === 'king-geometry') {
            subject = data.whiteKing;
            values.splice(0, 8, data.blackKing, String(data.fileDistance), String(data.rankDistance), String(data.kingMoveDistance),
                flag(data.directOppositionShape), data.betweenSquare || '-', list(data.interveningSquares), list(data.interveningOccupants.map(rootSquare)));
        } else if(card.predicate === 'move-effects') {
            subject = data.move.from;
            values.splice(0, 6, data.move.uci, list(data.mechanism.moved.map(move => `${move.beforeType}.${move.from}.${move.afterType}.${move.to}`)),
                data.mechanism.captured ? `${pieceLabel(data.mechanism.captured)}.${data.mechanism.captured.square}` : '-',
                String(data.mechanism.materialDeltaWhite), flag(data.mechanism.check), flag(data.mechanism.checkmate));
        } else if(card.predicate === 'unavailable') values[0] = data.reason;
        else throw new Error(`Unsupported PCF question predicate: ${card.predicate}`);
        add('H', 'C', ref.id, card.predicate, subject, ...values);
    }
    for(const ref of input.engineEvidence.references) {
        if(ref.kind === 'lc0-line') add('E', 'C', ref.id, 'lc0', ref.data.moves.join(','), flag(ref.data.preferred), 'q', ref.data.q ?? '?',
            ref.data.visits, ref.data.policyPrior, input.engineEvidence.source.budget.nodes);
        if(ref.kind === 'maia-choice') add('Q', 'C', ref.id, ref.data.move, ref.data.probability, ref.data.eloSelf, ref.data.eloOpponent);
    }
    for(const ref of input.references.filter(item => item.kind === 'evaluation')) {
        const evaluation = ref.data, line = input.lines.find(item => item.id === evaluation.lineId);
        if(evaluation.score && line) add('E', 'C', ref.id, 'stockfish', line.moves.join(','), flag(line.id === input.source.preferredLineId), evaluation.score.kind,
            evaluation.score.value, '?', '?', input.source.depth ?? '?');
    }
    const history = input.references.find(item => item.id === 'C.history');
    if(!history || history.kind !== 'recorded-history') throw new Error('PCF requires recorded-history evidence.');
    add('Y', 'C', history.data.occurrences, flag(history.data.threefoldThresholdObserved), history.data.halfmoves,
        flag(history.data.fiftyMoveThreshold), history.data.suppliedPriorPositions, flag(history.data.earlierHistoryMayBeMissing),
        history.data.lc0PriorPositionHorizon);
    const metrics = { ps: 'pawnStructure', pp: 'pawnPressure', dd: 'defensiveDuties', kz: 'kingZonePressure',
        ac: 'advancedControl', dm: 'developedMinors', cc: 'centralControls' };
    const lineFrames = new Map(input.lines.map(line => [line.id, line.frameIds]));
    for(const ref of input.engineEvidence.references.filter(item => item.kind === 'lc0-line')) lineFrames.set(ref.id, ref.data.frameIds);
    const sampleFrames = new Map([...input.frames, ...input.engineEvidence.frames].map(frame => [frame.id, frame]));
    const binarySamples = new Map();
    for(const item of input.strategy.comparisons) {
        const positive = item.comparison.positive, negative = item.comparison.negative;
        const sampleValues = new Map([...positive, ...negative].map(sample => {
            const frame = sampleFrames.get(sample.profile.frameId);
            if(!frame) throw new Error('PCF BinProp sample has no source frame.');
            return [sample, binPropValues(frame.fen, item.comparison.color)];
        }));
        for(const [samples, ids] of [[positive, item.positiveIds], [negative, item.negativeIds]]) for(const sample of samples) {
            const id = ids.find(lineId => lineFrames.get(lineId)?.includes(sample.path[0].frameId));
            if(!id) throw new Error('PCF BinProp sample has no matching source line.');
            const source = item.source === 'LC0' ? 'lc0' : 'stockfish';
            const key = `${source}|${id}|${item.horizon}|${item.comparison.color}`;
            const predicates = sampleValues.get(sample).map(flag).join('');
            if(binarySamples.has(key) && binarySamples.get(key) !== predicates) throw new Error('PCF BinProp sample identity disagrees.');
            if(!binarySamples.has(key)) add('BINLINE', 'C', source, id, item.horizon, item.comparison.color, predicates);
            binarySamples.set(key, predicates);
        }
        const positiveCounts = pcfBinPropOrder.map((_, index) => positive.filter(sample => sampleValues.get(sample)[index]).length);
        const negativeCounts = pcfBinPropOrder.map((_, index) => negative.filter(sample => !sampleValues.get(sample)[index]).length);
        const fits = positiveCounts.map((count, index) => Math.min(count / positive.length, negativeCounts[index] / negative.length));
        const weighted = fits.map((fit, index) => fit * pcfBinPropMotifs[index].delta);
        const strict = positiveCounts.map((count, index) => flag(count === positive.length && negativeCounts[index] === negative.length));
        add('BINCOMP', 'C', item.source === 'LC0' ? 'lc0' : 'stockfish', item.positiveIds.join(','), item.negativeIds.join(','),
            item.horizon, item.comparison.color, positive.length, negative.length, positiveCounts.join(','), negativeCounts.join(','),
            fits.join(','), weighted.join(','), strict.join(''));
    }
    const metricByKind = { 'pawn-structure': 'pawnStructure', 'pawn-pressure': 'pawnPressure', 'defensive-duties': 'defensiveDuties',
        'king-zone-pressure': 'kingZonePressure', 'advanced-control': 'advancedControl', development: 'developedMinors' };
    const witness = (samples, metric, color) => {
        const describe = profile => {
            const data = profile.colors[color][metric];
            if(metric === 'developedMinors') return data.map(piece => piece.square);
            if(metric === 'pawnStructure') return data.rows.flatMap(row => [
                ...(row.passed ? [`${row.piece.square}.p`] : []), ...(row.isolated ? [`${row.piece.square}.i`] : [])]);
            if(metric === 'defensiveDuties') return data.rows.map(row =>
                `${row.piece.square}.${row.target.square}.${row.kind === 'geometric-guard' ? 'g' : 'b'}`);
            if(metric === 'pawnPressure') return data.rows.flatMap(row => row.attackers.map(piece => `${piece.square}.${row.piece.square}`));
            return data.rows.flatMap(row => row.attackers.map(piece => `${piece.square}.${row.square}`));
        };
        const sets = samples.map(sample => new Set(describe(sample.profile)));
        return list([...sets[0]].filter(value => sets.every(set => set.has(value))));
    };
    for(const ref of input.references.filter(item => item.kind === 'binprop-contrast')) {
        const data = ref.data, metric = metricByKind[data.card.kind];
        if(!metric) throw new Error('Unknown PCF BinProp witness kind.');
        const motif = strategyMotifs.find(item => item.metric === metric);
        if(motif) {
            const index = pcfBinPropOrder.indexOf(motif.id), sampleValue = sample => {
                const frame = sampleFrames.get(sample.profile.frameId);
                if(!frame) throw new Error('PCF BinProp witness has no source frame.');
                return binPropValues(frame.fen, data.comparison.color)[index];
            };
            if(index < 0) throw new Error('Legacy BinProp witness has no corresponding upstream predicate.');
            if(!data.comparison.positive.every(sampleValue) || data.comparison.negative.some(sampleValue)) continue;
        }
        add('W', 'C', ref.id, data.card.kind, data.source === 'LC0' ? 'lc0' : 'stockfish', data.positiveIds.join(','),
            data.negativeIds.join(','), data.horizon, witness(data.comparison.positive, metric, 'w'),
            witness(data.comparison.negative, metric, 'w'), witness(data.comparison.positive, metric, 'b'),
            witness(data.comparison.negative, metric, 'b'));
    }
    for(const ref of input.references.filter(item => item.kind === 'lc0-forcing-effect')) {
        const frame = input.engineEvidence.frames.find(item => item.id === ref.data.path.at(-1));
        const ply = Number(ref.id.match(/\.p(\d+)$/)?.[1]);
        if(!frame?.move || !Number.isSafeInteger(ply)) throw new Error('PCF forcing effect has no exact line frame.');
        const effects = ref.data.facts.map(fact => {
            if(fact.kind === 'check') return `${fact.data.checkmate ? 'mate' : 'check'}.${other(frame.move.color)}`;
            if(fact.kind === 'capture') return `capture.${fact.data.captured.color}${fact.data.captured.type.toUpperCase()}.${fact.data.captured.square}`;
            if(fact.kind === 'promotion') return `promotion.${fact.data.type}`;
            throw new Error('Unknown PCF forcing effect.');
        });
        add('Z', 'C', ref.id, ref.data.lineId, ply, frame.move.uci, list(effects));
    }
    for(const ref of input.references.filter(item => item.kind === 'effects' && /^[LA]\d+\.p\d+$/.test(item.id))) {
        const frame = input.frames.find(item => item.id === ref.frameId), match = ref.id.match(/^([LA]\d+)\.p(\d+)$/);
        if(!frame?.move || !match) throw new Error('PCF move effect has no exact conditional frame.');
        const effects = [];
        for(const fact of ref.data) {
            const data = fact.data;
            if(fact.kind === 'action') {
                const before = input.frames.find(item => item.id === fact.beforeFrameId);
                for(const move of data.moved) {
                    const actor = before?.pieces.find(piece => piece.id === move.pieceId);
                    if(!actor) throw new Error('PCF move effect actor is absent from its parent.');
                    effects.push(`action.${pieceLabel(actor)}.${move.from}.${move.to}.${move.pieceId === data.move.pieceId ? data.move.san : 'castle'}`);
                }
            } else if(fact.kind === 'capture') effects.push(`capture.${pieceLabel(data.captured)}.${data.captured.square}`);
            else if(fact.kind === 'check') effects.push(`${data.checkmate ? 'mate' : 'check'}.${other(frame.move.color)}`);
            else if(fact.kind === 'promotion') effects.push(`promotion.${data.type}`);
            else if(fact.kind === 'new-attack' || fact.kind === 'new-defend') effects.push(
                `${fact.kind === 'new-attack' ? 'attack' : 'defend'}.${pieceLabel(data.source)}.${data.source.square}.${pieceLabel(data.target)}.${data.target.square}`);
            else if(fact.kind === 'lost-attack') effects.push(
                `lost.${pieceLabel(data.source)}.${data.source.square}.${pieceLabel(data.target)}.${data.target.square}.${data.beforeTarget.square}`);
            else if(fact.kind === 'extended-ray') for(const square of data.gainedSquares) effects.push(
                `ray.${pieceLabel(data.slider)}.${data.slider.square}.${pieceLabel(data.formerBlocker)}.${data.formerBlocker.square}.${square}`);
            else if(fact.kind === 'created-pin' || fact.kind === 'removed-pin') effects.push(
                `${fact.kind === 'created-pin' ? 'pinadd' : 'pinremove'}.${data.pin.pinType}.${data.pin.slider}.${data.pin.front}.${data.pin.back}`);
            else if(fact.kind === 'new-center-control') for(const square of data.squares) effects.push(`center.${pieceLabel(data.piece)}.${data.piece.square}.${square}`);
            else throw new Error(`Unsupported PCF conditional effect: ${fact.kind}`);
        }
        add('Z', 'C', ref.id, match[1], match[2], frame.move.uci, list(effects));
    }
    for(const ref of input.references.filter(item => ['complete-first-move-state', 'lc0-first-move-state'].includes(item.kind))) {
        const frame = input.frames.find(item => item.id === ref.frameId);
        if(!frame) throw new Error('PCF first-move state has no known frame.');
        const squares = new Map(frame.pieces.map(piece => [piece.id, piece.square]));
        const asSquares = ids => list(ids.map(id => {
            const square = squares.get(id);
            if(!square) throw new Error('PCF first-move relation names an absent piece.');
            return square;
        }));
        for(const state of ref.data.moved) {
            const entity = identities.get(state.pieceId);
            if(!entity) throw new Error('PCF first-move actor has no current identity.');
            const captures = state.legalCaptures === null ? '~' : list(state.legalCaptures.map(move => `${move.uci}.${move.capturedSquare}`));
            add('V', 'C', ref.id, state.square, state.color + state.type.toUpperCase(), entity,
                asSquares(state.enemyTargets), asSquares(state.attackers), asSquares(state.defenders), state.sideToMove,
                flag(state.sideToMoveInCheck), flag(state.checkmate), flag(state.stalemate),
                state.legalMoves === null ? '~' : list(state.legalMoves), captures);
        }
    }
    const metricValue = value => Array.isArray(value) ? value.length : value.value;
    for(const item of input.strategy.comparisons) for(const [short, metric] of Object.entries(metrics)) for(const color of colors) {
        const positive = item.comparison.positive.map(sample => sample.profile.colors[color][metric]);
        const negative = item.comparison.negative.map(sample => sample.profile.colors[color][metric]);
        const p = positive.map(metricValue), n = negative.map(metricValue);
        const pMin = Math.min(...p), pMax = Math.max(...p), nMin = Math.min(...n), nMax = Math.max(...n);
        const difference = (a, b) => Math.round((a - b) * 1e9) / 1e9;
        const bounded = metric === 'advancedControl' && [...positive, ...negative].some(value => value.scanStopped);
        add('M', 'C', item.source === 'LC0' ? 'lc0' : 'stockfish', item.positiveIds.join(','), item.negativeIds.join(','),
            item.horizon, short, color, pMin, pMax, nMin, nMax, difference(pMin, nMax), difference(pMax, nMin), flag(bounded));
    }
    return rows;
}

/** Build an internal, FEN-free evidence bank; no language-model selection is made here. */
export function buildPcfEvidence(input, { playerColor, history = [], historyIndexes = null,
    historyRequest = { requestedMoves: 0, matchedMoves: 0, requiredIndexes: [] }, replyEvidence = null } = {}) {
    if(input?.schema !== 'pena-v2-grounded-coaching-input/3' || !colors.includes(playerColor) || !Array.isArray(history)
        || JSON.stringify(history.slice(-8)) !== JSON.stringify(input.engineEvidence?.history))
        throw new Error('PCF requires a verified grounded input, player color and recorded history.');
    const indexes = historyIndexes === null ? Array.from({ length: Math.min(history.length, 2) }, (_, index) => history.length - Math.min(history.length, 2) + index)
        : Array.isArray(historyIndexes) ? [...historyIndexes] : historyIndexes;
    if(!Array.isArray(indexes) || new Set(indexes).size !== indexes.length
        || indexes.some(index => !Number.isSafeInteger(index) || index < 0 || index >= history.length))
        throw new Error('Invalid PCF historical frame indexes.');
    if(!Number.isSafeInteger(historyRequest?.requestedMoves) || historyRequest.requestedMoves < 0
        || !Number.isSafeInteger(historyRequest.matchedMoves) || historyRequest.matchedMoves < 0
        || historyRequest.matchedMoves > historyRequest.requestedMoves || !Array.isArray(historyRequest.requiredIndexes)
        || new Set(historyRequest.requiredIndexes).size !== historyRequest.requiredIndexes.length
        || historyRequest.requiredIndexes.some(index => !indexes.includes(index))) throw new Error('Invalid PCF requested history coverage.');
    if(history.length && !indexes.includes(history.length - 1)) indexes.push(history.length - 1);
    const root = input.frames.find(frame => frame.id === 'root');
    if(!root || !root.spatial || root.fen !== input.engineEvidence?.fen)
        throw new Error('PCF requires the authenticated current frame.');
    const historyKey = JSON.stringify([root.fen, history]);
    let replay = historyCache.get(historyKey);
    if(!replay) {
        replay = new PositionGraph(root.fen, history);
        historyCache.set(historyKey, replay);
        if(historyCache.size > 8) historyCache.delete(historyCache.keys().next().value);
    }
    const initial = replay.frames.get('history-0');
    const canonicalIds = new Map([...initial.pieces].sort((a, b) => a.square.localeCompare(b.square))
        .map((piece, index) => [piece.id, `@${index + 1}`]));
    const fullRoot = new Map(replay.root.pieces.map(piece => [piece.square, piece]));
    const identities = new Map(root.pieces.map(piece => {
        const full = fullRoot.get(piece.square);
        if(!full || full.color !== piece.color || full.type !== piece.type) throw new Error('PCF history identity mismatch.');
        return [piece.id, canonicalIds.get(full.id)];
    }));
    const frames = [{ id: 'C', sourceId: 'root', kind: 'current', parent: '-',
        rows: frameRecords(root, 'C', { playerColor, scope: 'current', identities }) }];
    const aliases = new Map([['root', 'C']]), shared = new Map();
    const pending = input.frames.filter(frame => frame.id !== 'root' && frame.branch !== 'history');
    for(const frame of pending) {
        const before = input.frames.find(item => item.id === frame.parentId);
        const parent = aliases.get(frame.parentId);
        if(!before || !parent || !frame.move) throw new Error('PCF conditional frame has no known parent.');
        const pathKey = JSON.stringify([parent, frame.move.uci, frame.fen, frame.pieces.map(piece => [piece.square, piece.color, piece.type, identities.get(piece.id)])]);
        if(shared.has(pathKey)) {
            aliases.set(frame.id, shared.get(pathKey));
            continue;
        }
        const id = `V${frames.length}`;
        const rows = frameRecords(frame, id, { playerColor, scope: 'conditional', parent, move: frame.move.uci, identities });
        rows.push(...transitionRecords(before, frame, id, parent, identities));
        frames.push({ id, sourceId: frame.id, kind: 'conditional', parent, rows });
        aliases.set(frame.id, id);
        shared.set(pathKey, id);
    }
    const historyFrames = [];
    for(const i of indexes) {
        const frame = replay.frames.get(`history-${i}`);
        if(!frame) throw new Error('PCF missing replayed historical frame.');
        const id = `H${i + 1}`;
        historyFrames.push({ id, sourceId: frame.id, kind: 'history', parent: i ? `H${i}` : '-',
            rows: frameRecords(frame, id, { playerColor, scope: 'history', parent: i ? `H${i}` : '-', move: frame.move?.uci || '-', identities: canonicalIds }) });
    }
    const previousFrame = history.length ? `H${history.length}` : null;
    const lastRows = [];
    if(previousFrame) {
        const before = replay.frames.get(`history-${history.length - 1}`);
        const after = replay.frames.get(`history-${history.length}`);
        lastRows.push(...transitionRecords(before, after, 'C', previousFrame, canonicalIds));
        const prior = historyFrames.find(frame => frame.id === previousFrame).rows;
        for(const color of colors) {
            const previousFlags = prior.find(row => row.kind === 'BINS' && row.values[1] === color).values.slice(2);
            const currentFlags = frames[0].rows.find(row => row.kind === 'BINS' && row.values[1] === color).values.slice(2);
            const changed = (from, to) => list(pcfBinPropMotifs.filter((_, index) => previousFlags[index] === from && currentFlags[index] === to).map(motif => motif.code));
            const oldProfile = prior.find(row => row.kind === 'B' && row.values[1] === color).values;
            const newProfile = frames[0].rows.find(row => row.kind === 'B' && row.values[1] === color).values;
            lastRows.push({ kind: 'BCHANGE', values: ['C', previousFrame, color, changed('0', '1'), changed('1', '0'),
                ...[2, 3, 4, 5, 6, 8, 9].map(index => String(Number(newProfile[index]) - Number(oldProfile[index])))] });
        }
    }
    const reply = replyEvidence === null ? null : pcfReplyFacts(input, replyEvidence);
    const legacyReferenceIds = [...input.legacyReferenceIds];
    if(reply?.references.some(ref => input.references.some(item => item.id === ref.id) || legacyReferenceIds.includes(ref.id)))
        throw new Error('PCF reply reference collides with existing evidence.');
    const sourceReferenceIds = [...new Set([...input.references.map(ref => ref.id), ...(reply?.references || []).map(ref => ref.id), ...legacyReferenceIds])];
    const recorded = engineRecords(input, identities);
    const comparisonGroups = new Map();
    for(const row of recorded.filter(item => item.kind === 'BINCOMP')) {
        const key = `BIN|${row.values.slice(1, 6).join('|')}`;
        const ids = new Set([...row.values[2].split(','), ...row.values[3].split(',')]);
        const samples = recorded.filter(item => item.kind === 'BINLINE' && item.values[1] === row.values[1]
            && ids.has(item.values[2]) && item.values[3] === row.values[4] && item.values[4] === row.values[5]);
        comparisonGroups.set(key, { key, kind: 'binprop', rows: [...samples, row] });
    }
    for(const row of recorded.filter(item => item.kind === 'M')) {
        const key = row.values.slice(1, 6).join('|');
        if(!comparisonGroups.has(key)) comparisonGroups.set(key, { key, kind: 'metric', rows: [] });
        comparisonGroups.get(key).rows.push(row);
    }
    const bank = { schema: 'pena-pcf-evidence/3', playerColor, frames, historyFrames, previousFrame, lastRows,
        engineRows: recorded.filter(row => !['Z', 'M', 'BINLINE', 'BINCOMP'].includes(row.kind)), plyRows: recorded.filter(row => row.kind === 'Z'),
        replyRows: reply?.rows || [], replyReferences: reply?.references || [], replyParentsSearched: reply?.searchedParents ?? null,
        comparisonGroups: [...comparisonGroups.values()],
        legacyReferenceIds, sourceReferenceIds, sourceConditionalFrames: pending.length,
        sharedConditionalFrames: pending.length - (frames.length - 1),
        historyRequest: { ...historyRequest, requiredIndexes: [...historyRequest.requiredIndexes] },
        historyComplete: null, historySupplied: history.length,
        boundary: 'Rules and geometry are frame-specific. Attacks/defenses include pinned pieces and do not establish safe captures. Conditional frames are sampled, not played. History completeness is unknown.' };
    if(/(?:[prnbqkPRNBQK1-8]+\/){7}[prnbqkPRNBQK1-8]+/.test(JSON.stringify(bank)))
        throw new Error('PCF evidence must never contain a FEN board.');
    return frozen(bank);
}

/** Select whole records only; the complete bank remains available for later requests. */
export function selectPcfEvidence(bank, { conditionalFrames = [], historicalFrames = [], plyRefs = [], comparisonKeys = [], replyRefs = [] } = {}) {
    if(bank?.schema !== 'pena-pcf-evidence/3' || !Array.isArray(conditionalFrames) || !Array.isArray(historicalFrames) || !Array.isArray(plyRefs) || !Array.isArray(comparisonKeys) || !Array.isArray(replyRefs)
        || new Set(conditionalFrames).size !== conditionalFrames.length || new Set(historicalFrames).size !== historicalFrames.length
        || new Set(plyRefs).size !== plyRefs.length || new Set(comparisonKeys).size !== comparisonKeys.length || new Set(replyRefs).size !== replyRefs.length)
        throw new Error('Invalid PCF selection.');
    const conditionals = bank.frames.filter(frame => frame.kind === 'conditional');
    const selectedConditional = conditionalFrames.map(id => {
        const frame = conditionals.find(item => item.id === id);
        if(!frame) throw new Error(`Unknown conditional frame ${id}.`);
        return frame;
    });
    const selectedHistory = historicalFrames.map(id => {
        const frame = bank.historyFrames.find(item => item.id === id);
        if(!frame) throw new Error(`Unknown historical frame ${id}.`);
        return frame;
    });
    const selectedPly = plyRefs.map(id => {
        const row = bank.plyRows.find(item => item.values[1] === id);
        if(!row) throw new Error(`Unknown conditional ply reference ${id}.`);
        return row;
    });
    const selectedReplies = replyRefs.map(id => {
        const row = bank.replyRows.find(item => item.values[1] === id);
        if(!row) throw new Error(`Unknown conditional reply reference ${id}.`);
        return row;
    });
    const selectedComparisons = comparisonKeys.flatMap(key => {
        const group = bank.comparisonGroups.find(item => item.key === key);
        if(!group) throw new Error(`Unknown conditional comparison ${key}.`);
        return group.rows;
    });
    const selectedIds = new Set(['C', ...conditionalFrames]);
    if(selectedConditional.some(frame => !selectedIds.has(frame.parent))) throw new Error('PCF selection requires each conditional parent.');
    const historyIds = new Set(historicalFrames);
    const frameRows = (frame, mode) => {
        const pieces = frame.rows.filter(row => row.kind === 'R');
        let rows;
        let completeGroups;
        if(mode === 'full') {
            rows = frame.rows;
            completeGroups = coverageGroups.full;
        } else if(mode === 'delta') {
            const affected = new Set(frame.rows.filter(row => row.kind === 'D').flatMap(row => [row.values[3], row.values[6]])
                .concat(frame.rows.filter(row => row.kind === 'T').map(row => row.values[3])));
            rows = frame.rows.filter(row => ['F', 'T', 'D'].includes(row.kind) || row.kind === 'R' && affected.has(row.values[3]));
            completeGroups = coverageGroups.delta;
        } else {
            rows = frame.rows.filter(row => ['F', 'I', 'R', 'G', 'P', 'B', 'BINS'].includes(row.kind));
            completeGroups = coverageGroups.history;
        }
        const count = rows.filter(row => row.kind === 'R').length;
        const coverage = { kind: 'K', values: [frame.id, mode, String(pieces.length), String(count), completeGroups] };
        const first = rows.findIndex(row => row.kind === 'F');
        if(first !== 0) throw new Error('PCF frame must begin with its identity.');
        return [rows[0], coverage, ...rows.slice(1)];
    };
    const rows = [
        ...frameRows(bank.frames[0], 'full'),
        ...bank.engineRows,
        ...selectedReplies,
        ...selectedComparisons,
        ...selectedPly,
        ...selectedConditional.flatMap(frame => frameRows(frame, 'delta')),
        ...(historyIds.has(bank.previousFrame) ? bank.lastRows : []),
        ...selectedHistory.flatMap(frame => frameRows(frame, 'history').map(row => row.kind === 'F' && row.values[2] !== '-' && !historyIds.has(row.values[2])
            ? { kind: row.kind, values: row.values.map((value, index) => index === 2 ? '?' : value) } : row))
    ];
    const defined = new Set(bank.legacyReferenceIds);
    for(const row of rows) {
        if(row.values[0] !== 'C') continue;
        if(row.kind === 'F') defined.add('C.status');
        if(row.kind === 'I') defined.add('C.material');
        if(row.kind === 'Y') defined.add('C.history');
        if(row.kind === 'R') defined.add(`C.${row.values[1]}`);
        if(row.kind === 'P') defined.add(`C.pawn.${row.values[1]}`);
        if(['E', 'Q', 'H', 'W', 'Z', 'V', 'REPLY'].includes(row.kind)) defined.add(row.values[1]);
    }
    rows.push({ kind: 'O', values: [String(bank.historySupplied), String(bank.historyFrames.length), String(selectedHistory.length), '?',
        String(conditionals.length), String(selectedConditional.length), String(bank.sourceReferenceIds.length),
        String(bank.sourceReferenceIds.filter(id => !defined.has(id)).length), String(bank.historyRequest.requestedMoves),
        String(bank.historyRequest.matchedMoves), String(bank.historyRequest.requiredIndexes.length),
        String(bank.historyRequest.requiredIndexes.filter(index => historyIds.has(`H${index + 1}`)).length),
        String(bank.sourceConditionalFrames), String(bank.sharedConditionalFrames), String(bank.plyRows.length), String(selectedPly.length),
        String(bank.comparisonGroups.length), String(comparisonKeys.length), bank.replyParentsSearched === null ? '?' : String(bank.replyParentsSearched),
        bank.replyParentsSearched === null ? '?' : String(bank.replyRows.length), String(selectedReplies.length),
        String(bank.comparisonGroups.filter(group => group.kind === 'binprop').length),
        String(bank.comparisonGroups.filter(group => group.kind === 'binprop' && comparisonKeys.includes(group.key)).length)] });
    return frozen({ schema: 'pena-pcf-selection/3', rows });
}

function validatePcfRows(rows) {
    const frames = new Map(), relations = new Map(), controls = new Map(), legal = new Map(), squares = new Map(), modes = new Map(),
        activity = new Map(), pawns = new Map(), materials = new Map(), exchanges = new Map(), binaryFlags = new Map(), specialMoves = [];
    const squareList = value => {
        if(value === '-') return [];
        const values = value.split(',');
        if(values.some(item => !/^[a-h][1-8]$/.test(item)) || new Set(values).size !== values.length
            || list(values) !== value) throw new Error('Invalid or noncanonical PCF square list.');
        return values;
    };
    let coverage = 0;
    const historyChanges = [];
    for(const row of rows) {
        const v = row.values;
        if(row.kind === 'O') { coverage++; continue; }
        if(row.kind === 'F') {
            if(frames.has(v[0]) || !/^(?:C|V[1-9]\d*|H[1-9]\d*)$/.test(v[0])
                || !['current', 'conditional', 'history'].includes(v[1]) || !colors.includes(v[4]) || !colors.includes(v[5])
                || !/^(?:-|K?Q?k?q?)$/.test(v[6]) || !/^(?:-|[a-h][36])$/.test(v[7])
                || !/^\d+$/.test(v[9]) || !/^[1-9]\d*$/.test(v[10]) || v.slice(11).some(value => !/^[01]$/.test(value)))
                throw new Error('Invalid or duplicate PCF frame.');
            if(v[0] === 'C' ? v[1] !== 'current' || v[2] !== '-' || v[3] !== '-'
                : v[1] === 'conditional' ? !frames.has(v[2]) || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(v[3])
                    : v[1] !== 'history') throw new Error('Invalid PCF frame binding.');
            frames.set(v[0], v);
            continue;
        }
        if(!frames.has(v[0])) throw new Error('PCF record names an undefined frame.');
        const key = `${v[0]}/${v[1]}`;
        if(row.kind === 'K') {
            if(modes.has(v[0]) || !['full', 'delta', 'history'].includes(v[1]) || !/^\d+$/.test(v[2]) || !/^\d+$/.test(v[3])
                || Number(v[3]) > Number(v[2])) throw new Error('Invalid PCF frame coverage.');
            modes.set(v[0], v);
        } else if(row.kind === 'R') {
            if(relations.has(key) || !/^[a-h][1-8]$/.test(v[1]) || !/^[wb][PNBRQK]$/.test(v[2])
                || !/^@[1-9]\d*$/.test(v[3])) throw new Error('Invalid or duplicate PCF piece.');
            v.slice(4).forEach(squareList);
            relations.set(key, v);
        } else if(row.kind === 'G') {
            if(controls.has(key)) throw new Error('Duplicate PCF control row.');
            controls.set(key, squareList(v[2]));
        } else if(row.kind === 'L') {
            if(legal.has(key) || v[2] !== '~' && v[2] !== '-' && v[2].split(',').some(move => !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)))
                throw new Error('Invalid PCF legal moves.');
            legal.set(key, v[2]);
        } else if(row.kind === 'S') {
            if(squares.has(key) || !/^[a-h][1-8]$/.test(v[1]) || v.slice(2).some(value => !/^\d+$/.test(value)))
                throw new Error('Invalid PCF square controls.');
            squares.set(key, v.slice(2).map(Number));
        } else if(row.kind === 'A') {
            if(activity.has(key)) throw new Error('Duplicate PCF activity row.');
            squareList(v[2]);
            if(v.slice(3).some(value => !/^-?\d+$/.test(value) || Math.abs(Number(value)) > 7)) throw new Error('Invalid PCF king-relative offset.');
            activity.set(key, v);
        } else if(row.kind === 'P') {
            if(pawns.has(key) || v.slice(2, 5).some(value => !/^[01]$/.test(value))) throw new Error('Invalid PCF pawn row.');
            squareList(v[8]);
            pawns.set(key, v);
        } else if(row.kind === 'I') {
            if(materials.has(v[0])) throw new Error('Duplicate PCF material row.');
            materials.set(v[0], v);
        } else if(row.kind === 'C') {
            if(exchanges.has(key)) throw new Error('Duplicate PCF exchange row.');
            exchanges.set(key, v);
        } else if(row.kind === 'BINS') {
            if(binaryFlags.has(key) || !colors.includes(v[1]) || v.slice(2).some(value => !/^[01]$/.test(value)))
                throw new Error('Invalid PCF BinProp predicate flags.');
            binaryFlags.set(key, v);
        } else if(row.kind === 'BCHANGE') {
            historyChanges.push(v);
        } else if(row.kind === 'BINLINE') {
            if(!['lc0', 'stockfish'].includes(v[1]) || !/^[A-Za-z][A-Za-z0-9.]*$/.test(v[2])
                || !/^[1-9]\d*$/.test(v[3]) || !colors.includes(v[4]) || !binaryVector.test(v[5]))
                throw new Error('Invalid PCF sampled BinProp predicates.');
        } else if(row.kind === 'BINCOMP') {
            const positive = v[8].split(',').map(Number), negative = v[9].split(',').map(Number);
            const fits = v[10].split(',').map(Number), weighted = v[11].split(',').map(Number);
            const positiveTotal = Number(v[6]), negativeTotal = Number(v[7]);
            if(!['lc0', 'stockfish'].includes(v[1]) || !colors.includes(v[5])
                || !Number.isSafeInteger(positiveTotal) || positiveTotal < 1 || !Number.isSafeInteger(negativeTotal) || negativeTotal < 1
                || !binaryVector.test(v[12]) || [positive, negative, fits, weighted].some(values => values.length !== pcfBinPropOrder.length)
                || positive.some((count, index) => {
                    const negativeCount = negative[index], fit = Math.min(count / positiveTotal, negativeCount / negativeTotal);
                    return !Number.isSafeInteger(count) || count < 0 || count > positiveTotal
                        || !Number.isSafeInteger(negativeCount) || negativeCount < 0 || negativeCount > negativeTotal
                        || fits[index] !== fit || weighted[index] !== fit * pcfBinPropMotifs[index].delta
                        || v[12][index] !== flag(count === positiveTotal && negativeCount === negativeTotal);
                })) throw new Error('Invalid PCF BinProp comparison support.');
        } else if(row.kind === 'U') {
            specialMoves.push(v);
        }
    }
    if(coverage !== 1 || !frames.has('C')) throw new Error('PCF needs one current frame and one coverage record.');
    const changedColors = new Set();
    if(historyChanges.length && (historyChanges.length !== 2 || new Set(historyChanges.map(change => change[1])).size !== 1
        || !rows.some(row => row.kind === 'T' && row.values[0] === 'C' && row.values[1] === historyChanges[0][1])))
        throw new Error('Incomplete PCF played-move comparison.');
    for(const change of historyChanges) {
        const [frame, before, color, gained, lost] = change;
        const prior = binaryFlags.get(`${before}/${color}`), current = binaryFlags.get(`${frame}/${color}`);
        const previousProfile = rows.find(row => row.kind === 'B' && row.values[0] === before && row.values[1] === color);
        const currentProfile = rows.find(row => row.kind === 'B' && row.values[0] === frame && row.values[1] === color);
        if(frame !== 'C' || frames.get(before)?.[1] !== 'history' || changedColors.has(color) || !prior || !current || !previousProfile || !currentProfile)
            throw new Error('Invalid PCF played-move comparison binding.');
        changedColors.add(color);
        const flags = (from, to) => list(pcfBinPropMotifs.filter((_, index) => prior[index + 2] === from && current[index + 2] === to).map(motif => motif.code));
        const deltas = [2, 3, 4, 5, 6, 8, 9].map(index => String(Number(currentProfile.values[index]) - Number(previousProfile.values[index])));
        if(gained !== flags('0', '1') || lost !== flags('1', '0') || change.slice(5).some((value, index) => value !== deltas[index] || !Number.isFinite(Number(value))))
            throw new Error('PCF played-move changes disagree with before/after facts.');
    }
    for(const [frame, info] of frames) {
        const pieces = [...relations.values()].filter(v => v[0] === frame);
        const mode = modes.get(frame);
        const expectedMode = info[1] === 'current' ? 'full' : info[1] === 'conditional' ? 'delta' : 'history';
        if(!mode || mode[1] !== expectedMode || mode[4] !== coverageGroups[mode[1]]
            || Number(mode[3]) !== pieces.length || new Set(pieces.map(v => v[3])).size !== pieces.length
            || mode[1] !== 'delta' && (Number(mode[2]) !== pieces.length || pieces.filter(v => v[2] === 'wK').length !== 1
                || pieces.filter(v => v[2] === 'bK').length !== 1)) throw new Error('Invalid PCF piece ledger.');
        if(mode[1] === 'delta') {
            if(colors.some(color => binaryFlags.has(`${frame}/${color}`))) throw new Error('Unexpected PCF delta-frame BinProp flags.');
            continue;
        }
        if(colors.some(color => !binaryFlags.has(`${frame}/${color}`))) throw new Error('Incomplete PCF BinProp predicate flags.');
        const material = materials.get(frame), values = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
        const counts = color => [...'PNBRQK'].map(type => pieces.filter(piece => piece[2] === color + type).length);
        const white = counts('w'), black = counts('b');
        const points = counts => counts.reduce((sum, count, index) => sum + count * values['PNBRQK'[index]], 0);
        if(!material || material[1] !== String(points(white)) || material[2] !== String(points(black))
            || material[3] !== String(points(white) - points(black)) || material[4] !== white.join(',') || material[5] !== black.join(','))
            throw new Error('PCF material counts disagree with the piece ledger.');
        for(const piece of pieces) {
            const key = `${frame}/${piece[1]}`, controlled = controls.get(key), moves = legal.get(key);
            if(!controlled || mode[1] === 'full' && (moves === undefined || (piece[2][0] === info[4] ? moves === '~' : moves !== '~')))
                throw new Error('Incomplete PCF piece controls or mobility.');
            if(moves !== undefined && moves !== '~' && moves !== '-' && moves.split(',').some(move => !move.startsWith(piece[1])))
                throw new Error('PCF legal move has the wrong source.');
            const incoming = color => pieces.filter(item => item[2][0] === color && controls.get(`${frame}/${item[1]}`)?.includes(piece[1])).map(item => item[1]);
            const outgoing = color => pieces.filter(item => item[2][0] === color && item[1] !== piece[1] && controlled.includes(item[1])).map(item => item[1]);
            if(piece[4] !== list(incoming(other(piece[2][0]))) || piece[5] !== list(incoming(piece[2][0]))
                || piece[6] !== list(outgoing(other(piece[2][0]))) || piece[7] !== list(outgoing(piece[2][0])))
                throw new Error('PCF attack or defense relations disagree with controls.');
            if(mode[1] === 'full') {
                const exchange = exchanges.get(key);
                const captures = specialMoves.filter(move => move[0] === frame && move[2] === piece[1]).map(move => move[1]);
                if(!exchange || (piece[2][0] === info[4] || piece[2][1] === 'K'
                    ? exchange[2] !== '~' || exchange[3] !== '~'
                    : exchange[2] !== list(captures) || !Number.isFinite(Number(exchange[3])) || Number(exchange[3]) < 0
                        || !captures.length && exchange[3] !== '0')) throw new Error('PCF exchange applicability or legal captures disagree.');
                const a = activity.get(key), ownKing = pieces.find(item => item[2] === piece[2][0] + 'K');
                const enemyKing = pieces.find(item => item[2] === other(piece[2][0]) + 'K');
                const pawnControls = new Set(pieces.filter(item => item[2] === other(piece[2][0]) + 'P')
                    .flatMap(item => controls.get(`${frame}/${item[1]}`)));
                const expected = controlled.filter(square => !pieces.some(item => item[1] === square && item[2][0] === piece[2][0])
                    && !pawnControls.has(square));
                const offsets = [fileOf(piece[1]) - fileOf(ownKing[1]), rankOf(piece[1]) - rankOf(ownKing[1]),
                    fileOf(piece[1]) - fileOf(enemyKing[1]), rankOf(piece[1]) - rankOf(enemyKing[1])].map(String);
                if(!a || a[2] !== list(expected) || a.slice(3).some((value, index) => value !== offsets[index]))
                    throw new Error('PCF activity or king-relative offsets disagree.');
            }
            if(piece[2][1] === 'P') {
                const p = pawns.get(key), color = piece[2][0], forward = color === 'w' ? 1 : -1;
                const ours = pieces.filter(item => item[2] === color + 'P'), theirs = pieces.filter(item => item[2] === other(color) + 'P');
                const passed = !theirs.some(item => Math.abs(fileOf(item[1]) - fileOf(piece[1])) <= 1
                    && (rankOf(item[1]) - rankOf(piece[1])) * forward > 0);
                const isolated = !ours.some(item => Math.abs(fileOf(item[1]) - fileOf(piece[1])) === 1);
                const doubled = ours.some(item => item[1] !== piece[1] && item[1][0] === piece[1][0]);
                const promotion = piece[1][0] + (color === 'w' ? 8 : 1);
                const front = piece[1][0] + (rankOf(piece[1]) + forward);
                const pawnGuards = pieces.filter(item => item[2] === color + 'P' && controls.get(`${frame}/${item[1]}`).includes(piece[1])).map(item => item[1]);
                if(!p || p[2] !== flag(passed) || p[3] !== flag(isolated) || p[4] !== flag(doubled) || p[5] !== promotion
                    || p[6] !== String(Math.abs(rankOf(piece[1]) - rankOf(promotion)))
                    || p[7] !== (pieces.some(item => item[1] === front) ? front : '-') || p[8] !== list(pawnGuards))
                    throw new Error('PCF pawn facts disagree with the piece ledger.');
            } else if(pawns.has(key)) throw new Error('PCF pawn row names a non-pawn.');
        }
        if(mode[1] === 'full') for(let rank = 1; rank <= 8; rank++) for(let file = 0; file < 8; file++) {
            const square = squareName(file, rank), actual = squares.get(`${frame}/${square}`);
            const incoming = color => pieces.filter(piece => piece[2][0] === color && controls.get(`${frame}/${piece[1]}`).includes(square));
            const w = incoming('w'), b = incoming('b');
            const expected = [w.length, b.length, w.filter(piece => piece[2] === 'wP').length, b.filter(piece => piece[2] === 'bP').length];
            if(!actual || actual.some((value, index) => value !== expected[index])) throw new Error('PCF square control counts disagree.');
        }
    }
}

function historyWireGroups(lines, expand) {
    const current = new Map(), result = [];
    for(let index = 0; index < lines.length;) {
        const header = lines[index++], match = header.match(/^@(R|G|P|B|BINS) (C|H[1-9]\d*)$/);
        result.push(header);
        if(!match) continue;
        const body = [];
        while(index < lines.length && !lines[index].startsWith('@')) body.push(lines[index++]);
        const [, kind, frame] = match, keyOf = line => line.split(' ')[0];
        if(frame === 'C') current.set(kind, body);
        const base = current.get(kind);
        if(expand && body[0] === 'BASE C') {
            if(frame === 'C' || !base) throw new Error('Historical BASE has no current group.');
            const restored = new Map(base.map(line => [keyOf(line), line])), changed = new Set();
            let order = null;
            for(const line of body.slice(1)) {
                if(line.startsWith('ORDER ')) {
                    if(order) throw new Error('Duplicate historical row order.');
                    order = line.slice(6).split(' ');
                    continue;
                }
                const drop = line.startsWith('DROP '), key = drop ? line.slice(5) : keyOf(line);
                if(changed.has(key) || drop && !restored.has(key)) throw new Error('Invalid or duplicate historical override.');
                changed.add(key);
                if(drop) restored.delete(key); else restored.set(key, line);
            }
            if(order && (order.length !== restored.size || new Set(order).size !== order.length || order.some(key => !restored.has(key))))
                throw new Error('Invalid historical row order.');
            const sorted = order ? order.map(key => restored.get(key)) : [...restored.values()].sort((a, b) => kind === 'B' || kind === 'BINS'
                ? Number(keyOf(a) === 'b') - Number(keyOf(b) === 'b') : keyOf(a).localeCompare(keyOf(b)));
            result.push(...sorted);
        } else if(!expand && frame !== 'C' && base) {
            const prior = new Map(body.map(line => [keyOf(line), line]));
            const inherited = new Map(base.map(line => [keyOf(line), line]));
            const compact = ['BASE C', ...(kind === 'P' ? ['ORDER ' + body.map(keyOf).join(' ')] : []),
                ...base.filter(line => !prior.has(keyOf(line))).map(line => `DROP ${keyOf(line)}`),
                ...body.filter(line => inherited.get(keyOf(line)) !== line)];
            result.push(...(compact.join('\n').length < body.join('\n').length ? compact : body));
        } else result.push(...body);
    }
    return result;
}

function encodePcfCore(selection, verify, plain = false) {
    if(selection?.schema !== 'pena-pcf-selection/3' || !Array.isArray(selection.rows)) throw new Error('Invalid PCF selection.');
    const lines = [plain ? 'PCF/3p' : 'PCF/3'];
    let section = '';
    const sharedFirstMove = new Map();
    for(const row of selection.rows) {
        if(!Object.hasOwn(pcfColumns, row.kind) || !Array.isArray(row.values) || row.values.length !== pcfColumns[row.kind].length
            || row.values.some(value => typeof value !== 'string' || !cellPattern.test(value))) throw new Error('Invalid PCF record.');
        if(row.kind === 'F' || row.kind === 'O') {
            const citation = row.kind === 'F' && row.values[0] === 'C' ? '[C.status] ' : '';
            const values = [...row.values];
            if(row.kind === 'F') { mapWireLists('F', values, row.values[0], false, plain); mapWireAtoms('F', values, row.values[0], false, plain); }
            lines.push(`@${row.kind} ${citation}${values.join(' ')}`);
            section = '';
            continue;
        }
        if(row.kind === 'S' && row.values.slice(2).every(value => value === '0')) continue;
        if(row.kind === 'X' && row.values[4] === '-' && row.values[5] === '-') continue;
        let key;
        if(row.kind === 'M') {
            const header = row.values.slice(0, 5);
            if(!plain) for(const index of [2, 3]) header[index] = '!' + header[index].split(',').join('!');
            key = `${row.kind} ${header.join(' ')}`;
        } else if(row.kind === 'J' || row.kind === 'X') key = `${row.kind} ${row.values[0]} ${plain ? '' : '!'}${row.values[1]}`;
        else key = `${row.kind} ${row.values[0]}`;
        if(key !== section) {
            lines.push(`@${key}`); section = key;
            if(row.kind === 'C' && !selection.rows.some(item => item.kind === 'C' && item.values[0] === row.values[0]
                && item.values[2] !== '~' && item.values[2] !== '-')) lines.push('-');
        }
        if(row.kind === 'C' && (row.values[2] === '~' || row.values[2] === '-')) continue;
        if(row.kind === 'V') {
            const signature = JSON.stringify(row.values.slice(2)), previous = sharedFirstMove.get(signature);
            if(previous && previous !== row.values[1]) {
                lines.push(`[${row.values[1]}] SAME ${previous} ${plain ? '' : '!'}${row.values[4]}`);
                continue;
            }
            sharedFirstMove.set(signature, row.values[1]);
        }
        let values = row.values.slice(row.kind === 'J' || row.kind === 'X' ? 2 : 1);
        if(row.kind === 'L' && row.values[2] !== '~') {
            const controls = selection.rows.find(item => item.kind === 'G' && item.values[0] === row.values[0] && item.values[1] === row.values[1]);
            const moves = row.values[2] === '-' ? [] : row.values[2].split(',');
            if(controls && moves.every(move => move.length === 4) && list(moves.map(move => move.slice(2))) === controls.values[2]) values[1] = 'SAME';
        }
        if(row.kind === 'A') {
            const controls = selection.rows.find(item => item.kind === 'G' && item.values[0] === row.values[0] && item.values[1] === row.values[1]);
            if(controls && controls.values[2] === row.values[2]) values[1] = 'SAME';
        }
        if(row.kind === 'I' && row.values[0] === 'C') values.unshift('[C.material]');
        if(row.kind === 'Y' && row.values[0] === 'C') values.unshift('[C.history]');
        if(['E', 'Q', 'H', 'W', 'Z', 'V', 'REPLY'].includes(row.kind)) values[0] = `[${values[0]}]`;
        if(row.kind === 'H') while(values.length > 3 && values.at(-1) === '-') values.pop();
        if(row.kind === 'L' && values[1] !== '~' && values[1] !== '-' && values[1] !== 'SAME')
            values[1] = values[1].split(',').map(move => {
                if(!move.startsWith(values[0])) throw new Error('PCF legal move has the wrong source.');
                return move.slice(2);
            }).join(',');
        if(row.kind === 'A') {
            values = [values[0], values[1], values.slice(2).map(encodeOffset).join('')];
        }
        if(row.kind === 'P') values = [values[0], values.slice(1, 4).join(''), ...values.slice(4)];
        if(row.kind === 'K') values = values.slice(0, values[0] === 'delta' ? 3 : 2);
        if(row.kind === 'BINS') {
            const enabled = values.slice(1).flatMap((value, index) => value === '1' ? [pcfBinPropMotifs[index].code] : []);
            values = [values[0], !enabled.length ? '-' : plain ? enabled.join(',') : '!' + enabled.join('!')];
        }
        if(row.kind === 'BINCOMP') {
            const fits = values[9].split(',').map(value => binPropFits.indexOf(Number(value)));
            if(fits.length !== pcfBinPropOrder.length || fits.some(value => value < 0)) throw new Error('Invalid PCF BinProp support fit.');
            values = [...values.slice(0, 7), values[7].replace(/,/g, ''), values[8].replace(/,/g, ''), fits.join('')];
        }
        if(row.kind === 'J') {
            if(!['0', '1'].includes(row.values[3])) throw new Error('Invalid PCF pawn-pair file offset.');
            values = [row.values[2], row.values[3] + encodeOffset(row.values[4]) + row.values.slice(5).join('')];
        }
        if(row.kind === 'S') {
            const counts = values.slice(1).map(Number);
            if(counts.some(value => !Number.isInteger(value) || value < 0 || value > 16)) throw new Error('PCF square-control count exceeds its encoding.');
            values = counts.some(value => value > 9) ? [values[0], 'WIDE', ...values.slice(1)]
                : [values[0], counts[2] === 0 && counts[3] === 0 ? counts.slice(0, 2).join('') : counts.join('')];
        }
        if(row.kind === 'M') values = [row.values[5], row.values[6], rangeCell(row.values[7], row.values[8]),
            rangeCell(row.values[9], row.values[10]), rangeCell(row.values[11], row.values[12]), row.values[13]];
        if(!(['L', 'A'].includes(row.kind) && values[1] === 'SAME')) mapWireLists(row.kind, values, row.values[0], false, plain);
        mapWireAtoms(row.kind, values, row.values[0], false, plain);
        if(row.kind === 'R') while(values.length > 3 && values.at(-1) === '-') values.pop();
        lines.push(values.join(' '));
    }
    if(verify) validatePcfRows(selection.rows);
    return historyWireGroups(lines, false).join('\n');
}

export function encodePcf(selection, { plain = false } = {}) { return encodePcfCore(selection, true, plain); }

/** Used only while measuring candidate selections; callers must validate the final serialization. */
export function encodePcfDraft(selection, { plain = false } = {}) { return encodePcfCore(selection, false, plain); }

export function decodePcf(text) {
    if(typeof text !== 'string') throw new Error('Invalid PCF text.');
    const lines = historyWireGroups(text.split('\n'), true);
    const version = lines.shift();
    if(version !== 'PCF/3' && version !== 'PCF/3p') throw new Error('Unknown PCF version.');
    // PCF/3p carries the same records without tokenizer boundary markers; lists use commas.
    const plain = version === 'PCF/3p';
    const rows = [], sparseSections = new Set();
    let section = null, sectionCount = 0, emptyExchange = false;
    for(const line of lines) {
        if(line.startsWith('@')) {
            if(section && sectionCount === 0) throw new Error('Malformed empty PCF section.');
            const match = line.match(/^@([A-Z]+) (\S+(?: \S+)*)$/);
            if(!match || !Object.hasOwn(pcfColumns, match[1])) throw new Error('Unknown or malformed PCF record.');
            const values = match[2].split(' ');
            if(match[1] === 'F' && values[0] === 'C') throw new Error('Missing current-status citation.');
            if(match[1] === 'F' && values[0] === '[C.status]') values.shift();
            if(match[1] === 'F' || match[1] === 'O') {
                if(match[1] === 'F') { mapWireAtoms('F', values, values[0], true, plain); mapWireLists('F', values, values[0], true, plain); }
                if(values.length !== pcfColumns[match[1]].length || values.some(value => !cellPattern.test(value)))
                    throw new Error('Unknown or malformed PCF record.');
                rows.push({ kind: match[1], values }); section = null;
            } else {
                const headerLength = match[1] === 'M' ? 5 : ['J', 'X'].includes(match[1]) ? 2 : 1;
                if(values.length !== headerLength || values.some(value => !cellPattern.test(value)))
                    throw new Error('Malformed PCF section.');
                if(['J', 'X'].includes(match[1])) {
                    if(!(plain ? /^[a-h][1-8]$/ : /^![a-h][1-8]$/).test(values[1])) throw new Error('PCF section square lacks its tokenizer boundary marker.');
                    if(!plain) values[1] = values[1].slice(1);
                }
                if(match[1] === 'M') for(const index of [2, 3]) {
                    if(plain) {
                        if(values[index].includes('!')) throw new Error('Malformed PCF comparison source list.');
                        continue;
                    }
                    if(!values[index].startsWith('!') || values[index].includes('!!')) throw new Error('Malformed PCF comparison source list.');
                    values[index] = values[index].slice(1).split('!').join(',');
                }
                if(['C', 'S'].includes(match[1])) {
                    const key = `${match[1]}/${values[0]}`;
                    if(sparseSections.has(key)) throw new Error('Duplicate PCF sparse section.');
                    sparseSections.add(key);
                }
                section = { kind: match[1], header: values }; sectionCount = 0; emptyExchange = false;
            }
        } else {
            if(!section || !line || line.includes('  ')) throw new Error('Malformed PCF record.');
            if(section.kind === 'C' && line === '-') {
                if(sectionCount !== 0) throw new Error('Malformed empty exchange section.');
                sectionCount++; emptyExchange = true; continue;
            }
            if(emptyExchange) throw new Error('Malformed empty exchange section.');
            let values = line.split(' ');
            if(section.kind === 'R') {
                if(values.length < 3 || values.length > 7) throw new Error('Malformed PCF relation row.');
                while(values.length < 7) values.push('-');
            }
            if(['L', 'A'].includes(section.kind) && values[1] === 'SAME') {
                const square = values[0].startsWith('!') ? values[0].slice(1) : values[0];
                const control = rows.find(row => row.kind === 'G' && row.values[0] === section.header[0] && row.values[1] === square);
                if(!control) throw new Error('PCF control alias has no earlier geometric control row.');
                values[1] = control.values[2] === '-' || plain ? control.values[2] : '!' + control.values[2].split(',').join('!');
            }
            mapWireAtoms(section.kind, values, section.header[0], true, plain);
            mapWireLists(section.kind, values, section.header[0], true, plain);
            if(section.kind === 'I' && section.header[0] === 'C') {
                if(values.shift() !== '[C.material]') throw new Error('Malformed current-material citation.');
            }
            if(section.kind === 'Y' && section.header[0] === 'C') {
                if(values.shift() !== '[C.history]') throw new Error('Malformed current-history citation.');
            }
            if(['E', 'Q', 'H', 'W', 'Z', 'V', 'REPLY'].includes(section.kind)) {
                const citation = values[0].match(/^\[([A-Za-z0-9.]+)\]$/);
                if(!citation) throw new Error('Malformed PCF engine citation.');
                values[0] = citation[1];
            }
            if(section.kind === 'V' && values[1] === 'SAME') {
                if(values.length !== 4) throw new Error('Malformed PCF first-move alias.');
                const currentId = values[0];
                const prior = rows.filter(row => row.kind === 'V' && row.values[0] === section.header[0]
                    && row.values[1] === values[2] && row.values[4] === values[3]);
                if(prior.length !== 1) throw new Error('PCF first-move alias names no unique prior record.');
                values = prior[0].values.slice(1);
                values[0] = currentId;
            }
            if(section.kind === 'H') {
                if(values.length < 3 || values.length > pcfColumns.H.length - 1) throw new Error('Malformed PCF question fact.');
                while(values.length < pcfColumns.H.length - 1) values.push('-');
            }
            if(section.kind === 'L' && values[1] !== '~' && values[1] !== '-')
                values[1] = values[1].split(',').map(destination => values[0] + destination).join(',');
            if(section.kind === 'A') {
                if(values.length !== 3 || !/^\d{8}$/.test(values[2]))
                    throw new Error('Malformed PCF king-relative offsets.');
                values = [values[0], values[1], ...values[2].match(/\d{2}/g).map(decodeOffset)];
            }
            if(section.kind === 'P') {
                if(values.length !== 6 || !/^[01]{3}$/.test(values[1])) throw new Error('Malformed PCF pawn flags.');
                values = [values[0], ...values[1], ...values.slice(2)];
            }
            if(section.kind === 'K') {
                if(!Object.hasOwn(coverageGroups, values[0]) || values.length !== (values[0] === 'delta' ? 3 : 2))
                    throw new Error('Malformed PCF frame coverage.');
                if(values[0] !== 'delta') values.push(values[1]);
                values.push(coverageGroups[values[0]]);
            }
            if(section.kind === 'BINS') {
                if(values.length !== 2) throw new Error('Malformed PCF BinProp flags.');
                const enabled = values[1] === '-' ? [] : plain ? values[1].split(',') : values[1].startsWith('!') ? values[1].slice(1).split('!') : null;
                const canonical = pcfBinPropMotifs.filter(motif => enabled?.includes(motif.code)).map(motif => motif.code);
                if(!enabled || enabled.join(',') !== canonical.join(',')) throw new Error('Malformed PCF BinProp flags.');
                values = [values[0], ...pcfBinPropMotifs.map(motif => flag(enabled.includes(motif.code)))];
            }
            if(section.kind === 'BINCOMP') {
                if(values.length !== 10 || !countVector.test(values[7]) || !countVector.test(values[8])
                    || !fitVector.test(values[9])) throw new Error('Malformed PCF BinProp comparison.');
                const positive = [...values[7]].map(Number), negative = [...values[8]].map(Number);
                const fits = [...values[9]].map(code => binPropFits[Number(code)]);
                const strict = fits.map(fit => flag(fit === 1)).join('');
                values = [...values.slice(0, 7), positive.join(','), negative.join(','), fits.join(','),
                    fits.map((fit, index) => fit * pcfBinPropMotifs[index].delta).join(','), strict];
            }
            if(section.kind === 'J') {
                if(values.length !== 2 || !/^[01]\d{2}[01]{3}$/.test(values[1])) throw new Error('Malformed PCF pawn-pair flags or offsets.');
                values = [values[0], values[1][0], decodeOffset(values[1].slice(1, 3)), ...values[1].slice(3)];
            }
            if(section.kind === 'S') {
                if(values.length === 2 && /^\d{4}$/.test(values[1])) values = [values[0], ...values[1]];
                else if(values.length === 2 && /^\d{2}$/.test(values[1])) values = [values[0], ...values[1], '0', '0'];
                else if(values.length === 6 && values[1] === 'WIDE' && values.slice(2).every(value => /^\d+$/.test(value) && Number(value) <= 16))
                    values = [values[0], ...values.slice(2)];
                else throw new Error('Malformed PCF square-control counts.');
            }
            if(section.kind === 'M') {
                if(values.length !== 6) throw new Error('Malformed PCF comparison.');
                values = [values[0], values[1], ...parseRange(values[2]), ...parseRange(values[3]), ...parseRange(values[4]), values[5]];
            }
            values.unshift(...section.header);
            if(values.length !== pcfColumns[section.kind].length || values.some(value => !cellPattern.test(value)))
                throw new Error('Unknown or malformed PCF record.');
            rows.push({ kind: section.kind, values }); sectionCount++;
        }
    }
    if(section && sectionCount === 0) throw new Error('Malformed empty PCF section.');
    for(const frame of rows.filter(row => row.kind === 'K' && row.values[1] === 'full').map(row => row.values[0])) {
        if(!sparseSections.has(`C/${frame}`) || !sparseSections.has(`S/${frame}`)) throw new Error('Missing PCF sparse section.');
        const pieces = rows.filter(row => row.kind === 'R' && row.values[0] === frame);
        const info = rows.find(row => row.kind === 'F' && row.values[0] === frame).values;
        const existingExchanges = new Map(rows.filter(row => row.kind === 'C' && row.values[0] === frame).map(row => [row.values[1], row]));
        if(existingExchanges.size !== rows.filter(row => row.kind === 'C' && row.values[0] === frame).length)
            throw new Error('Duplicate PCF exchange row.');
        if([...existingExchanges.keys()].some(square => !pieces.some(piece => piece.values[1] === square)))
            throw new Error('PCF exchange row names an absent piece.');
        const completeExchanges = pieces.map(piece => existingExchanges.get(piece.values[1]) || { kind: 'C', values: [frame, piece.values[1],
            ...(piece.values[2][0] === info[4] || piece.values[2][1] === 'K' ? ['~', '~'] : ['-', '0'])] });
        for(let i = rows.length - 1; i >= 0; i--) if(rows[i].kind === 'C' && rows[i].values[0] === frame) rows.splice(i, 1);
        const activityIndex = rows.findIndex(row => row.kind === 'A' && row.values[0] === frame);
        if(activityIndex < 0) throw new Error('Full PCF frame lacks activity records.');
        rows.splice(activityIndex, 0, ...completeExchanges);

        const existingSquares = new Map(rows.filter(row => row.kind === 'S' && row.values[0] === frame).map(row => [row.values[1], row]));
        if(existingSquares.size !== rows.filter(row => row.kind === 'S' && row.values[0] === frame).length)
            throw new Error('Duplicate PCF square control row.');
        if([...existingSquares.keys()].some(square => !/^[a-h][1-8]$/.test(square))) throw new Error('Invalid PCF control square.');
        const completeSquares = [];
        for(let rank = 1; rank <= 8; rank++) for(let file = 0; file < 8; file++) {
            const square = squareName(file, rank);
            completeSquares.push(existingSquares.get(square) || { kind: 'S', values: [frame, square, '0', '0', '0', '0'] });
        }
        for(let i = rows.length - 1; i >= 0; i--) if(rows[i].kind === 'S' && rows[i].values[0] === frame) rows.splice(i, 1);
        const afterSquareIndex = rows.findIndex(row => row.values[0] === frame && ['X', 'N', 'B'].includes(row.kind));
        if(afterSquareIndex < 0) throw new Error('Full PCF frame lacks a following profile record.');
        rows.splice(afterSquareIndex, 0, ...completeSquares);

        const existingRays = rows.filter(row => row.kind === 'X' && row.values[0] === frame);
        const rayKey = row => `${row.values[1]}/${row.values[2]}/${row.values[3]}`;
        const rayMap = new Map(existingRays.map(row => [rayKey(row), row]));
        if(rayMap.size !== existingRays.length) throw new Error('Duplicate PCF ray.');
        const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        const completeRays = [];
        for(const piece of pieces) {
            const type = piece.values[2][1];
            if(!['B', 'R', 'Q'].includes(type)) continue;
            for(const [dx, dy] of directions.filter(([x, y]) => type === 'Q' || (type === 'B' ? x && y : !x || !y))) {
                const key = `${piece.values[1]}/${dx}/${dy}`;
                completeRays.push(rayMap.get(key) || { kind: 'X', values: [frame, piece.values[1], String(dx), String(dy), '-', '-'] });
                rayMap.delete(key);
            }
        }
        if(rayMap.size) throw new Error('PCF ray names an invalid slider or direction.');
        for(let i = rows.length - 1; i >= 0; i--) if(rows[i].kind === 'X' && rows[i].values[0] === frame) rows.splice(i, 1);
        const afterRayIndex = rows.findIndex(row => row.values[0] === frame && ['N', 'B'].includes(row.kind));
        if(afterRayIndex < 0) throw new Error('Full PCF frame lacks a following profile record.');
        rows.splice(afterRayIndex, 0, ...completeRays);
    }
    validatePcfRows(rows);
    return frozen({ schema: 'pena-pcf-selection/3', rows });
}

const pieceNames = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
const spokenPiece = value => {
    if(!/^[wb][PNBRQK]$/.test(value || '')) throw new Error('Invalid PCF effect piece.');
    return `${value[0] === 'w' ? 'White' : 'Black'} ${pieceNames[value[1]]}`;
};
const spokenSide = value => {
    if(!colors.includes(value)) throw new Error('Invalid PCF effect side.');
    return value === 'w' ? 'White' : 'Black';
};

function explainEffect(value) {
    const parts = value.split('.');
    if(parts[0] === 'action') return `${spokenPiece(parts[1])} moves ${parts[2]} to ${parts[3]}${parts[4] === 'castle' ? ' as the castling rook' : ` (${parts[4]})`}`;
    if(parts[0] === 'capture') return `captures ${spokenPiece(parts[1])} on ${parts[2]}`;
    if(parts[0] === 'check' || parts[0] === 'mate') return `${spokenSide(parts[1])} is ${parts[0] === 'mate' ? 'checkmated' : 'in check'}`;
    if(parts[0] === 'promotion') return `promotes to ${pieceNames[parts[1].toUpperCase()]}`;
    if(parts[0] === 'attack' || parts[0] === 'defend') return `${spokenPiece(parts[1])} on ${parts[2]} newly geometrically ${parts[0] === 'attack' ? 'attacks' : 'defends'} ${spokenPiece(parts[3])} on ${parts[4]}`;
    if(parts[0] === 'lost') return `${spokenPiece(parts[1])} on ${parts[2]} no longer geometrically attacks ${spokenPiece(parts[3])} on ${parts[4]} (previously ${parts[5]})`;
    if(parts[0] === 'ray') return `${spokenPiece(parts[1])} on ${parts[2]} gains geometric control of ${parts[5]} when ${spokenPiece(parts[3])} leaves ${parts[4]}`;
    if(parts[0] === 'pinadd' || parts[0] === 'pinremove') return `${parts[0] === 'pinadd' ? 'creates' : 'removes'} ${parts[1]} pin geometry: slider ${parts[2]}, front ${parts[3]}, back ${parts[4]}`;
    if(parts[0] === 'center') return `${spokenPiece(parts[1])} on ${parts[2]} newly controls central square ${parts[3]}`;
    throw new Error(`Unknown PCF effect description: ${parts[0]}`);
}

/** Expand the exact serialized records, never the private evidence bank. */
export function renderPcfTeacher(text) {
    const selection = decodePcf(text);
    return selection.rows.map(row => {
        const citation = row.kind === 'F' && row.values[0] === 'C' ? 'C.status'
            : row.kind === 'I' && row.values[0] === 'C' ? 'C.material'
                : row.kind === 'Y' && row.values[0] === 'C' ? 'C.history'
                : row.kind === 'R' && row.values[0] === 'C' ? `C.${row.values[1]}`
                    : row.kind === 'P' && row.values[0] === 'C' ? `C.pawn.${row.values[1]}`
                        : ['E', 'Q', 'H', 'W', 'Z', 'V', 'REPLY'].includes(row.kind) ? row.values[1] : null;
        if(row.kind === 'Z') {
            const effects = row.values[5] === '-' ? 'none' : row.values[5].split(',').map(explainEffect).join('; ');
            return `[${citation}] Conditional line ${row.values[2]}, ply ${row.values[3]}, move ${row.values[4]}: ${effects}.`;
        }
        if(row.kind === 'BINLINE') {
            const [frame, source, line, plies, perspective, predicates] = row.values;
            const details = pcfBinPropMotifs.map((motif, index) =>
                `${motif.code} (${motif.name})=${predicates[index] === '1' ? 'true' : 'false'}`);
            return `BINLINE: frame=${frame}; source=${source}; line=${line}; plies=${plies}; perspective=${perspective}; ${details.join('; ')}`;
        }
        if(row.kind === 'BINCOMP') {
            const [frame, source, preferred, alternative, plies, perspective, positiveTotal, negativeTotal,
                positiveCounts, negativeCounts, fits, , strict] = row.values;
            const positive = positiveCounts.split(','), negative = negativeCounts.split(','), support = fits.split(',');
            const details = pcfBinPropMotifs.map((motif, index) => `${motif.code} (${motif.name}): `
                + `preferred true ${positive[index]}/${positiveTotal}; alternative false ${negative[index]}/${negativeTotal}; `
                + `fit ${support[index]}; strict ${strict[index] === '1' ? 'true' : 'false'}`);
            return `BINCOMP: frame=${frame}; source=${source}; preferred=${preferred}; alternative=${alternative}; `
                + `plies=${plies}; perspective=${perspective}; ${details.join('; ')}`;
        }
        return `${citation ? `[${citation}] ` : ''}${row.kind}: ${pcfColumns[row.kind].map((name, index) => `${name}=${row.values[index]}`).join('; ')}`;
    }).join('\n');
}
