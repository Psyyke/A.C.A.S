import { PositionGraph, boardAt } from './positions.js';
import { spatialFacts, moveMechanism } from './spatial.js';
import { pieceMentions, ownerColor, Facts } from './concepts.js';

const names = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const types = Object.fromEntries(Object.entries(names).map(([type, name]) => [name, type]));
const directions = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0],
    northeast: [1, 1], northwest: [-1, 1], southeast: [1, -1], southwest: [-1, -1] };
const intents = ['locate', 'mobility', 'pins', 'controls', 'defense', 'blockers', 'material', 'status',
    'king-geometry', 'legal-move', 'move-effects', 'compare-frames', 'unavailable'];
const reasons = {
    'unsupported-question': 'This factual query interface does not yet support that question; no coaching conclusion has been established.',
    'missing-player-color': 'The player color is needed to resolve that ownership reference.',
    'missing-subject': 'Specify the piece or square for this factual question.',
    'missing-focus': 'That reference needs an explicitly bound recent piece; specify its square.',
    'stale-focus': 'That piece reference belongs to a different game, board revision or frame; specify the piece again.',
    'missing-frame': 'Specify the historical or conditional board for this question.',
    'missing-transition': 'The preceding legal move is unavailable; its effects cannot be established.',
    'invalid-coordinate': 'That coordinate is not a standard board square or coordinate move. Specify the square again; it has not been corrected or ignored.',
    'no-slider': 'This piece has no bishop, rook or queen ray; this blocker query does not apply.'
};
const contexts = new WeakSet();
const clone = value => JSON.parse(JSON.stringify(value));
const side = color => color === 'w' ? 'White' : 'Black';
const opposite = color => color === 'w' ? 'b' : 'w';
const square = value => typeof value === 'string' && /^[a-h][1-8]$/.test(value);
const label = piece => `${side(piece.color)} ${names[piece.type]} on ${piece.square}`;
const sorted = items => [...items].sort((a, b) => a.square.localeCompare(b.square));
const linked = (text, references) => ({ text, anchors: [{ start: 0, end: text.length, references }] });
const joined = (parts, separator) => parts.flatMap((part, i) => i ? [separator, part] : [part]);
function prose(...parts) {
    let text = '';
    const anchors = [];
    for(const part of parts.flat(Infinity)) {
        const value = typeof part === 'string' ? { text: part, anchors: [] } : part;
        for(const anchor of value.anchors || []) anchors.push({ ...anchor, start: text.length + anchor.start, end: text.length + anchor.end });
        text += value.text;
    }
    return { text, anchors };
}
function references(at, ids = [], squares = [], moves = [], relations = []) {
    return { frameId: at.id, branchId: at.branch, scope: at.scope?.kind || (at.branch === 'current' ? 'current' : 'historical'),
        pieceIds: [...new Set(ids)], squares: [...new Set(squares)],
        moves: moves.map(move => ({ ...move, moveId: `${at.id}/${move.uci}`, fromFrameId: at.id })), relations };
}
const freeze = value => {
    if(value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};

function keys(value, allowed) {
    if(!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key)))
        throw new Error('Unexpected factual-contract fields.');
}

function contextCheck(context) {
    if(!contexts.has(context)) throw new Error('Use a verified factual answer context.');
}

function questionText(question) {
    return question.toLowerCase().replace(/[\u2018\u2019]/g, "'")
        .replace(/\bcant\b/g, "can't").replace(/\bknigth(s?)\b/g, 'knight$1')
        .replace(/\b(knights?|bishops?|rooks?|queens?|kings?|pawns?)\s+([a-h][1-8])\b/g, '$1 on $2')
        .replace(/\bmy\b/g, 'your').replace(/\btheir\b/g, "opponent's");
}

const invalidCoordinate = text => [...text.matchAll(/\b[a-z]\d+(?:[a-z]\d+[a-z]?)?\b/g)]
    .some(match => !/^[a-h][1-8](?:[a-h][1-8][qrbn]?)?$/.test(match[0]));

function validateBoard(fen) {
    const board = boardAt(fen), facts = new Facts(fen);
    for(const color of ['w', 'b']) {
        const pieces = facts.pieces.filter(piece => piece.color === color);
        if(pieces.length > 16 || pieces.filter(piece => piece.type === 'p').length > 8
            || pieces.some(piece => piece.type === 'p' && /[18]$/.test(piece.square)))
            throw new Error('Invalid standard-chess material or pawn placement.');
        const king = pieces.find(piece => piece.type === 'k');
        if(color !== board.turn() && facts.attackers(king.square, opposite(color)).length)
            throw new Error('The side that just moved cannot have its king in check.');
    }
    const rights = board.fen().split(' ')[2];
    for(const [right, color, king, rook] of [['K', 'w', 'e1', 'h1'], ['Q', 'w', 'e1', 'a1'],
        ['k', 'b', 'e8', 'h8'], ['q', 'b', 'e8', 'a8']]) {
        if(rights.includes(right) && (board.get(king)?.type !== 'k' || board.get(king)?.color !== color
            || board.get(rook)?.type !== 'r' || board.get(rook)?.color !== color))
            throw new Error('Castling rights disagree with the king/rook placement.');
    }
    const ep = board.fen().split(' ')[3];
    if(ep !== '-') {
        const white = board.turn() === 'w', rank = white ? '5' : '4', origin = white ? '7' : '2';
        const pawn = board.get(ep[0] + rank);
        if(ep[1] !== (white ? '6' : '3') || board.get(ep) || board.get(ep[0] + origin)
            || pawn?.type !== 'p' || pawn.color !== opposite(board.turn()))
            throw new Error('En-passant metadata disagrees with the last pawn double move.');
    }
}

/** Creates immutable, game/revision-scoped facts. Branches are legally replayed, never model-authored boards. */
export function createFactContext({ gameId, revision, fen, history = [], historyComplete = false, playerColor = null, branches = [] }) {
    if(typeof gameId !== 'string' || !gameId.trim() || !Number.isSafeInteger(revision) || revision < 0
        || ![null, 'w', 'b'].includes(playerColor) || typeof historyComplete !== 'boolean'
        || !Array.isArray(history) || history.length > 1024 || !Array.isArray(branches) || branches.length > 12)
        throw new Error('A factual context needs an explicit game ID, revision and valid options.');
    for(const position of [...history, fen]) validateBoard(position);
    const graph = new PositionGraph(fen, history);
    if(historyComplete && graph.initialFen !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
        throw new Error('Complete standard-game history must start at the initial position.');
    const last = graph.frames.get(`history-${history.length}`);
    graph.root.parentId = history.length ? last.parentId : null;
    if(last) graph.frames.delete(last.id);
    const scopes = new Map([...graph.frames.values()].map(frame => [frame.id,
        { kind: frame.id === 'root' ? 'current' : 'historical', assumption: null,
            label: frame.id === 'root' ? 'On the current board' : `On historical board ${frame.id}` }]));
    const branchIds = new Set();
    for(const branch of branches) {
        keys(branch, ['id', 'moves', 'assumedTurn']);
        if(typeof branch.id !== 'string' || !/^[a-z][\w-]*$/i.test(branch.id) || /^(root|history)(?:-|$)/.test(branch.id) || branchIds.has(branch.id))
            throw new Error('Factual branches require distinct non-reserved IDs.');
        branchIds.add(branch.id);
        let parent = graph.root;
        if(branch.assumedTurn !== undefined) {
            if(branch.assumedTurn !== opposite(graph.root.fen.split(' ')[1])) throw new Error('Invalid different-turn hypothesis.');
            const fields = graph.root.fen.split(' ');
            fields[1] = branch.assumedTurn;
            fields[3] = '-';
            const assumedFen = fields.join(' ');
            validateBoard(assumedFen);
            parent = { ...graph.root, id: `${branch.id}-base`, branch: branch.id, parentId: null, move: null, fen: assumedFen };
            graph.frames.set(parent.id, parent);
            scopes.set(parent.id, { kind: 'hypothetical', label: `Under the explicit ${side(branch.assumedTurn)}-to-move assumption`,
                assumption: 'Same placement, other side to move, en passant cleared. Not a legal pass, actual continuation or searched evaluation.' });
        }
        const frames = graph.branch(branch.id, branch.moves, { parent: parent.id });
        let path = prose('');
        for(const frame of frames) {
            const actor = parent.pieces.find(piece => piece.id === frame.move.pieceId);
            const hypothesis = scopes.get(parent.id)?.kind === 'hypothetical';
            const at = { ...parent, scope: scopes.get(parent.id) };
            path = prose(path, path.text ? ', then ' : '', linked(`${label(actor)} to ${frame.move.to} (${frame.move.san})`,
                references(at, [actor.id, frame.move.capturedId].filter(Boolean), [actor.square, frame.move.to, frame.move.capturedSquare].filter(Boolean), [frame.move])));
            const description = prose(`${hypothesis ? 'Under the different-turn assumption, after' : 'In the conditional line after'} `, path);
            scopes.set(frame.id, { kind: hypothesis ? 'hypothetical' : 'conditional', label: description.text, anchors: description.anchors,
                assumption: hypothesis ? scopes.get(parent.id).assumption : null });
            parent = frame;
        }
    }
    const frames = [...graph.frames.values()].map(frame => ({ ...frame, scope: scopes.get(frame.id), spatial: spatialFacts(frame) }));
    const context = freeze({ schema: 'pena-v2-fact-context/1', gameId, revision, ruleset: 'standard',
        historyComplete, historyPositions: history.length + 1, playerColor, frames });
    contexts.add(context);
    return context;
}

function checkQuery(context, input) {
    keys(input, ['intent', 'frameId', 'subject', 'direction', 'uci', 'otherFrameId', 'reason']);
    const query = { ...clone(input), frameId: input.frameId ?? 'root' };
    if(!intents.includes(query.intent) || !context.frames.some(frame => frame.id === query.frameId))
        throw new Error('Unknown factual intent or frame.');
    const subjectIntent = ['locate', 'mobility', 'pins', 'controls', 'defense', 'blockers'].includes(query.intent);
    if(subjectIntent) {
        keys(query.subject, ['id', 'type', 'color', 'square', 'excludeId', 'all']);
        const subject = query.subject;
        if(!(subject.id || subject.type || subject.square) || (subject.type !== undefined && !Object.hasOwn(names, subject.type))
            || (subject.color !== undefined && !['w', 'b'].includes(subject.color))
            || (subject.square !== undefined && !square(subject.square))
            || ['id', 'excludeId'].some(key => subject[key] !== undefined && (typeof subject[key] !== 'string' || !subject[key]))
            || (subject.all !== undefined && typeof subject.all !== 'boolean')) throw new Error('Invalid factual subject.');
    } else if(query.subject !== undefined) throw new Error('This factual intent does not accept a subject.');
    const fields = { blockers: ['direction'], 'legal-move': ['uci'], 'compare-frames': ['otherFrameId'], unavailable: ['reason'] };
    for(const field of ['direction', 'uci', 'otherFrameId', 'reason'])
        if(query[field] !== undefined && !fields[query.intent]?.includes(field)) throw new Error('Unrelated factual query field.');
    if(query.direction !== undefined && !Object.hasOwn(directions, query.direction)) throw new Error('Invalid ray direction.');
    if(query.intent === 'legal-move' && !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(query.uci)) throw new Error('Use an explicit coordinate move.');
    if(query.intent === 'compare-frames' && !context.frames.some(frame => frame.id === query.otherFrameId)) throw new Error('Unknown comparison frame.');
    if(query.intent === 'unavailable' && !Object.hasOwn(reasons, query.reason)) throw new Error('Unknown unavailable-evidence reason.');
    return query;
}

/** Deliberately bounded natural-language front end; typed queries remain the authoritative interface. */
export function resolveFactQuestion(context, question, { frameId = 'root', focus = null } = {}) {
    contextCheck(context);
    if(typeof question !== 'string' || !question.trim()) throw new Error('A nonempty factual question is required.');
    const text = questionText(question);
    const unavailable = reason => ({ intent: 'unavailable', frameId, reason });
    const frame = context.frames.find(frame => frame.id === frameId);
    if(!frame) throw new Error('Unknown question frame.');
    if(invalidCoordinate(text)) return unavailable('invalid-coordinate');
    if(/\b(and|or|versus|instead)\b/.test(text)) return unavailable('unsupported-question');
    const lastMoveEffects = /\b(what changed|what changes|move effects)\b/.test(text) && /\blast move\b/.test(text) && !/\bbefore\b/.test(text);
    if(frameId === 'root' && (/\b(before|after|earlier|previous|historical)\b/.test(text) && !lastMoveEffects
        || /\b(if|assuming|suppose|hypothetical|would)\b/.test(text)))
        return unavailable('missing-frame');
    if(/\b(material|points|piece count)\b/.test(text) && !/\b(win|gain|sacrifice)\b/.test(text)) return { intent: 'material', frameId };
    if(/\b(game over|checkmate|stalemate|in check|board status)\b/.test(text)) {
        if(/\b(your|white|black|king|queen|rook|bishop|knight|pawn)\b/.test(text)) return unavailable('unsupported-question');
        return { intent: 'status', frameId };
    }
    if(/\bopposition\b/.test(text)) return { intent: 'king-geometry', frameId };
    if(lastMoveEffects) return { intent: 'move-effects', frameId };
    const coordinates = [...text.matchAll(/\b([a-h][1-8])[- ]?([a-h][1-8])([qrbn])?\b/g)];
    if(coordinates.length > 1) return unavailable('unsupported-question');
    const coordinateQuery = uci => {
        if(pieceMentions(text).length || /\b(it|other one)\b/.test(text)) {
            const resolved = resolveFactSubject(context, question, { frameId, focus });
            const actor = frame.pieces.find(piece => piece.square === uci.slice(0, 2));
            if(resolved.reason || !actor || resolved.subject.id && resolved.subject.id !== actor.id
                || resolved.subject.square && resolved.subject.square !== actor.square || resolved.subject.excludeId === actor.id
                || resolved.subject.type && resolved.subject.type !== actor.type
                || resolved.subject.color && resolved.subject.color !== actor.color) return unavailable('unsupported-question');
        }
        return { intent: 'legal-move', frameId, uci };
    };
    const uci = coordinates[0];
    if(uci && /\b(legal|can|cannot|can't|why not|allowed)\b/.test(text)) return coordinateQuery(uci[1] + uci[2] + (uci[3] || ''));
    const squares = [...text.matchAll(/\b[a-h][1-8]\b/g)].map(match => match[0]);
    if(/\b(move|go|reach)\b.*\bto\b/.test(text)) {
        if(/\b(promot\w*|instead|then)\b/.test(text)) return unavailable('unsupported-question');
        if(squares.length === 1 && new RegExp(`\\bto\\s+${squares[0]}\\b`).test(text)) {
            const resolved = resolveFactSubject(context, text.replace(/\bto\s+[a-h][1-8]\b/, ''), { frameId, focus });
            if(resolved.reason) return unavailable(resolved.reason);
            const spec = resolved.subject;
            const actors = frame.pieces.filter(piece => (!spec.id || piece.id === spec.id) && piece.id !== spec.excludeId
                && (!spec.type || piece.type === spec.type) && (!spec.color || piece.color === spec.color));
            if(actors.length !== 1) return unavailable('missing-subject');
            return { intent: 'legal-move', frameId, uci: actors[0].square + squares[0] };
        }
        if(squares.length !== 2) return unavailable('unsupported-question');
        return coordinateQuery(squares.join(''));
    }
    if(squares.length > 1) return unavailable('unsupported-question');
    if(/\b[kqrbn][a-h]?[1-8]?x?[a-h][1-8](?:=[qrbn])?[+#]?\b/.test(text)
        || /\b(castle|castling|o-o)\b/.test(text)) return unavailable('unsupported-question');
    const incoming = /\b(who|what|which piece)\b.*\b(attacks?|defends?|protects?|attacking|defending)\b/.test(text)
        && !/\b(does|do|can)\b.*\b(attacks?|defends?)\b/.test(text);
    const intent = /\b(pin|pins|pinned)\b/.test(text) ? 'pins'
        : incoming || /\b(undefended|unprotected|defenders?|defended|attackers?|attacked|protected)\b/.test(text) ? 'defense'
            : /\b(block|blocker|blocked|blocking|stopping|path)\b/.test(text) ? 'blockers'
                : /\b(control|controls|attacks?|defends?)\b/.test(text) ? 'controls'
                    : /\b(move|moves|mobile|mobility|unable|immobile|destinations?|reach)\b/.test(text)
                        || /\bwhere\b.*\bgo\b/.test(text) ? 'mobility'
                        : /\b(where|locate|which square|is there)\b/.test(text) ? 'locate' : null;
    const whyImmobile = intent === 'mobility' && /\bwhy\b/.test(text) && /\b(cannot|can't|unable|immobile)\b/.test(text);
    if(!intent || /\b(best|should|plan|win|safe|hanging|threat)\b/.test(text) || /\bwhy\b/.test(text) && !whyImmobile)
        return unavailable('unsupported-question');
    const resolved = resolveFactSubject(context, question, { frameId, focus });
    if(resolved.reason) return unavailable(resolved.reason);
    const direction = Object.keys(directions).find(direction => new RegExp(`\\b${direction}\\b`).test(text));
    return { intent: whyImmobile ? 'pins' : intent, frameId, subject: resolved.subject, ...(intent === 'blockers' && direction ? { direction } : {}) };
}

/** Subject binding is shared by rule-based and learned intent selection. Neither may substitute an entity. */
export function resolveFactSubject(context, question, { frameId = 'root', focus = null } = {}) {
    contextCheck(context);
    if(typeof question !== 'string' || !question.trim()) throw new Error('A nonempty factual question is required.');
    const frame = context.frames.find(frame => frame.id === frameId);
    if(!frame) throw new Error('Unknown question frame.');
    const text = questionText(question);
    const unavailable = reason => ({ reason });
    if(invalidCoordinate(text)) return unavailable('invalid-coordinate');
    const mentions = pieceMentions(text).filter(mention => types[mention.name]);
    if(mentions.length > 1) return unavailable('unsupported-question');
    const mention = mentions[0];
    let subject;
    if(mention) {
        if(mention.owner && !/^(white|black)(?:'s)?$/.test(mention.owner) && !context.playerColor) return unavailable('missing-player-color');
        subject = { type: types[mention.name], ...(mention.square ? { square: mention.square } : {}),
            ...(mention.owner ? { color: ownerColor(mention.owner, context.playerColor) } : {}), all: Boolean(mention.plural) };
    } else {
        const target = text.match(/\b[a-h][1-8]\b/);
        if(target) subject = { square: target[0] };
    }
    const other = Boolean(mention?.other || /\bother one\b/.test(text));
    const demonstrative = /\b(?:that|this)\s+(?:piece|knight|bishop|rook|queen|king|pawn)\b/.test(text);
    const needsFocus = !subject?.square && (other || demonstrative || /\bit\b/.test(text) || (!mention && !subject));
    if(needsFocus) {
        if(!focus) return unavailable('missing-focus');
        if(focus.gameId !== context.gameId || focus.revision !== context.revision || focus.frameId !== frameId
            || !frame.pieces.some(piece => piece.id === focus.pieceId)) return unavailable('stale-focus');
        const previous = frame.pieces.find(piece => piece.id === focus.pieceId);
        if(subject?.type && previous.type !== subject.type || subject?.color && previous.color !== subject.color)
            return unavailable('missing-focus');
        if(other) subject = { type: previous.type, color: previous.color, ...subject, excludeId: focus.pieceId };
        else subject = { ...subject, id: focus.pieceId };
    }
    if(!subject) return unavailable('missing-subject');
    return { subject };
}

export function compileFactAnswer(context, input) {
    contextCheck(context);
    const query = checkQuery(context, input), frame = context.frames.find(frame => frame.id === query.frameId);
    const { spatial } = frame, cards = [];
    let status = 'answerable';
    const describe = id => label(frame.pieces.find(piece => piece.id === id));
    const reference = references;
    const entity = (piece, at = frame) => linked(label(piece), reference(at, [piece.id], [piece.square]));
    const entityId = id => entity(frame.pieces.find(piece => piece.id === id));
    const place = (target, ids = [], relations = [], at = frame) => linked(target, reference(at, ids, [target], [], relations));
    const action = (move, text, at = frame) => linked(text, reference(at, [move.pieceId, move.capturedId].filter(Boolean),
        [move.from, move.to, move.capturedSquare].filter(Boolean), [move]));
    const add = (predicate, data, content, refs = reference(frame), certainty = 'board-exact') => {
        const { text, anchors } = prose(content);
        cards.push({ id: `fact-${cards.length + 1}`, predicate, certainty,
            truth: predicate === 'unavailable' ? 'unknown' : predicate === 'legal-move' ? data.legal : true,
            frameId: frame.id, provenance: { producer: 'pena-v2-spatial/1', rule: `pena-v2-fact-answer/1/${predicate}`,
                frameIds: [...new Set([frame.id, refs.frameId, ...(refs.relatedFrames || []).map(ref => ref.frameId)])] }, data: clone(data),
            segments: [{ text, anchors, references: refs }] });
    };
    const unavailable = reason => { status = 'unavailable'; add('unavailable', { reason }, reasons[reason], reference(frame), 'evidence-limit'); };
    const mobility = piece => {
        const moves = spatial.legalMoves.filter(move => move.pieceId === piece.id);
        const data = { pieceId: piece.id, applicable: piece.color === spatial.turn, moves: piece.color === spatial.turn ? moves : null };
        add('mobility', data, prose(entity(piece), piece.color !== spatial.turn
            ? ` is not on move: it is ${side(spatial.turn)}'s turn. No current legal moves are asserted for this piece.`
            : moves.length ? prose(` has ${moves.length} legal move${moves.length === 1 ? '' : 's'}: `,
                joined(moves.map(move => action(move, `${move.from} to ${move.to}${move.promotion ? ', promoting to ' + names[move.promotion] : ''} (${move.san})`)), '; '), '.')
                : ` has no legal move on this board, with ${side(spatial.turn)} to move.`),
        reference(frame, [piece.id, ...moves.map(move => move.capturedId).filter(Boolean)],
            [piece.square, ...moves.flatMap(move => [move.to, move.capturedSquare].filter(Boolean))], moves));
    };
    if(query.intent === 'unavailable') unavailable(query.reason);
    else if(query.subject) {
        const spec = query.subject;
        const pieces = sorted(spatial.pieces.filter(piece => (!spec.id || piece.id === spec.id) && piece.id !== spec.excludeId
            && (!spec.type || piece.type === spec.type) && (!spec.color || piece.color === spec.color) && (!spec.square || piece.square === spec.square)));
        if(!pieces.length) {
            status = 'absent';
            const occupant = spec.square ? frame.pieces.find(piece => piece.square === spec.square) : null;
            add('absence', { subject: spec, occupant: occupant || null }, prose(`No ${spec.color ? side(spec.color) + ' ' : ''}${names[spec.type] || 'piece'} matches that reference`,
                spec.square ? prose(' on ', place(spec.square)) : '', ' in this frame.',
                occupant ? prose(' That square contains ', entity(occupant), '.') : spec.square ? ' That square is empty.' : ''),
            reference(frame, occupant ? [occupant.id] : [], spec.square ? [spec.square] : []));
        } else {
            if(pieces.length > 1 && !spec.all) status = 'ambiguous';
            for(const piece of pieces) {
                const refs = reference(frame, [piece.id], [piece.square]);
                if(query.intent === 'locate') add('location', { piece }, prose(entity(piece), ' is present in this frame.'), refs);
                if(['mobility', 'pins'].includes(query.intent)) mobility(piece);
                if(query.intent === 'pins') {
                    const pins = spatial.pins.filter(pin => pin.kind === 'pin' && pin.frontId === piece.id);
                    add('pins', { pieceId: piece.id, pins }, pins.length ? prose(joined(pins.map(pin => prose(entityId(pin.sliderId), ' ',
                        linked('pins', reference(frame, [pin.sliderId, piece.id, pin.backId], [pin.slider, pin.front, pin.back], [],
                            [{ from: pin.slider, to: pin.front, kind: 'pin' }, { from: pin.front, to: pin.back, kind: 'pin' }])),
                        ' ', entity(piece), ' to ', entityId(pin.backId), ` (${pin.pinType} slider pin).`)), ' '),
                        ' A relative pin does not make movement illegal; an absolute pin can permit moves along its line.')
                        : prose('No slider pin matching the supported king/queen/rook ray definition is recorded for ', entity(piece), '.'),
                    reference(frame, [piece.id, ...pins.flatMap(pin => [pin.sliderId, pin.backId])],
                        [piece.square, ...pins.flatMap(pin => [pin.slider, pin.back])], [],
                        pins.flatMap(pin => [{ from: pin.slider, to: pin.front, kind: 'pin' }, { from: pin.front, to: pin.back, kind: 'pin' }])));
                }
                if(query.intent === 'defense') add('defense', { pieceId: piece.id, defenders: piece.defenders, attackers: piece.attackers },
                    prose(entity(piece), ' has ', piece.defenders.length ? prose('geometric defenders: ', joined(piece.defenders.map(id =>
                        linked(describe(id), reference(frame, [piece.id, id], [piece.square], [],
                            [{ from: spatial.pieces.find(piece => piece.id === id).square, to: piece.square, kind: 'defend' }]))), '; '))
                        : linked('no geometric defenders', refs), '. Geometric attackers: ', piece.attackers.length ? joined(piece.attackers.map(id =>
                        linked(describe(id), reference(frame, [piece.id, id], [piece.square], [],
                            [{ from: spatial.pieces.find(piece => piece.id === id).square, to: piece.square, kind: 'attack' }]))), '; ') : 'none',
                    '. These controls do not prove a legal capture or material loss.'),
                reference(frame, [piece.id, ...piece.defenders, ...piece.attackers], [piece.square], [],
                    [...piece.defenders.map(id => ({ from: spatial.pieces.find(piece => piece.id === id).square, to: piece.square, kind: 'defend' })),
                        ...piece.attackers.map(id => ({ from: spatial.pieces.find(piece => piece.id === id).square, to: piece.square, kind: 'attack' }))]));
                if(query.intent === 'controls') {
                    const targets = frame.pieces.filter(target => piece.controls.includes(target.square));
                    const empty = piece.controls.filter(target => !targets.some(piece => piece.square === target));
                    add('controls', { pieceId: piece.id, squares: piece.controls, targets },
                        prose(entity(piece), ' geometrically controls empty squares: ', empty.length ? joined(empty.map(target =>
                            place(target, [piece.id], [{ from: piece.square, to: target, kind: 'control' }])), ', ') : 'none',
                        '. Occupied controlled squares: ', targets.length ? joined(targets.map(target => linked(label(target),
                            reference(frame, [piece.id, target.id], [piece.square, target.square], [], [{ from: piece.square, to: target.square, kind: 'control' }]))), '; ')
                            : 'none', '. This is not a claim of legal capture.'),
                    reference(frame, [piece.id, ...targets.map(piece => piece.id)], [piece.square, ...piece.controls], [],
                        piece.controls.map(to => ({ from: piece.square, to, kind: 'control' }))));
                }
                if(query.intent === 'blockers') {
                    if(!['b', 'r', 'q'].includes(piece.type)) { unavailable('no-slider'); continue; }
                    const delta = query.direction ? directions[query.direction] : null;
                    const rays = spatial.rays.filter(ray => ray.pieceId === piece.id && (!delta || ray.dx === delta[0] && ray.dy === delta[1]));
                    add('blockers', { pieceId: piece.id, rays }, rays.length ? joined(rays.map(ray => {
                        const direction = Object.keys(directions).find(key => directions[key][0] === ray.dx && directions[key][1] === ray.dy);
                        return prose(entity(piece), `, ${direction}: clear squares `, ray.emptySquares.length ? joined(ray.emptySquares.map(target => place(target, [piece.id])), ', ') : 'none',
                            '; first blocker ', ray.firstBlocker ? linked(describe(ray.firstBlocker.pieceId), reference(frame, [piece.id, ray.firstBlocker.pieceId],
                                [piece.square, ray.firstBlocker.square], [], [{ from: piece.square, to: ray.firstBlocker.square, kind: 'blocker' }])) : 'none before the board edge', '.');
                    }), ' ') : prose(entity(piece), ` has no ${query.direction} slider ray.`),
                    reference(frame, [piece.id, ...rays.map(ray => ray.firstBlocker?.pieceId).filter(Boolean)],
                        [piece.square, ...rays.flatMap(ray => [...ray.emptySquares, ray.firstBlocker?.square].filter(Boolean))], [],
                        rays.filter(ray => ray.firstBlocker).map(ray => ({ from: piece.square, to: ray.firstBlocker.square, kind: 'blocker' }))));
                }
            }
        }
    } else if(query.intent === 'material') add('material', spatial.material,
        `Conventional material: White ${spatial.material.w.points}, Black ${spatial.material.b.points}; White minus Black ${spatial.material.whiteMinusBlack}. `
        + 'Values: pawn 1, knight/bishop 3, rook 5, queen 9, king 0. This is not a position evaluation.');
    else if(query.intent === 'status') add('status', { turn: spatial.turn, check: spatial.check, checkmate: spatial.checkmate, stalemate: spatial.stalemate,
        drawRules: 'not-assessed' }, `${side(spatial.turn)} to move: ${spatial.checkmate ? 'checkmate' : spatial.stalemate ? 'stalemate' : spatial.check ? 'in check' : 'not in check'}. `
            + 'Repetition, move-count draws and dead positions are not assessed by this status query.');
    else if(query.intent === 'king-geometry') add('king-geometry', spatial.kingGeometry,
        prose('White king ', place(spatial.kingGeometry.whiteKing, frame.pieces.filter(piece => piece.type === 'k' && piece.color === 'w').map(piece => piece.id)),
        '; Black king ', place(spatial.kingGeometry.blackKing, frame.pieces.filter(piece => piece.type === 'k' && piece.color === 'b').map(piece => piece.id)), '. ',
        spatial.kingGeometry.directOppositionShape ? prose('They face across the empty ', place(spatial.kingGeometry.betweenSquare), ' square: direct-opposition shape. ') : 'There is no direct-opposition shape. ',
        'Geometry alone does not establish zugzwang or a winning plan.'),
    reference(frame, frame.pieces.filter(piece => piece.type === 'k').map(piece => piece.id),
        [spatial.kingGeometry.whiteKing, spatial.kingGeometry.blackKing, ...spatial.kingGeometry.interveningSquares]));
    else if(query.intent === 'legal-move') {
        const from = query.uci.slice(0, 2), to = query.uci.slice(2, 4), actor = frame.pieces.find(piece => piece.square === from);
        const move = spatial.legalMoves.find(move => move.uci === query.uci) || null;
        const reason = move ? 'legal' : !actor ? 'empty-source' : actor.color !== spatial.turn ? 'other-side-to-move'
            : frame.pieces.some(piece => piece.square === to && piece.color === actor.color) ? 'friendly-destination'
                : boardAt(frame.fen).moves({ verbose: true, legal: false }).some(move => move.from + move.to + (move.promotion || '') === query.uci)
                    ? 'king-would-be-in-check' : 'not-in-legal-set';
        const detail = { legal: 'It is in the exact legal-move set.', 'empty-source': 'The source square is empty.',
            'other-side-to-move': `It is ${side(spatial.turn)}'s turn, not this piece's turn.`, 'friendly-destination': 'The destination is occupied by a friendly piece.',
            'king-would-be-in-check': "This otherwise pseudo-legal move would leave the moving side's king in check.",
            'not-in-legal-set': 'It is absent from the exact legal-move set; this query does not establish a more specific cause.' };
        add('legal-move', { uci: query.uci, legal: Boolean(move), reason, move },
            prose(actor ? entity(actor) : 'The requested piece', ' ', move ? action(move, `from ${from} to ${to}${query.uci[4] ? ', promoting to ' + names[query.uci[4]] : ''}`)
                : prose('from ', place(from, actor ? [actor.id] : []), ' to ', place(to)), `: ${move ? 'legal' : 'not legal'} on this board. ${detail[reason]}`),
        reference(frame, actor ? [actor.id, move?.capturedId].filter(Boolean) : [], [from, to, move?.capturedSquare].filter(Boolean), move ? [move] : []));
    } else if(query.intent === 'move-effects') {
        const before = context.frames.find(before => before.id === frame.parentId);
        if(!before || !frame.move) unavailable('missing-transition');
        else {
            const mechanism = moveMechanism(before, frame);
            add('move-effects', { move: frame.move, mechanism }, prose(joined(mechanism.moved.map(move => prose(entity(before.pieces.find(piece => piece.id === move.pieceId), before),
                ' ', linked(`moved to ${move.to}` + (move.beforeType !== move.afterType ? ` and promoted to ${names[move.afterType]}` : ''),
                    reference(before, [move.pieceId, frame.move.pieceId, frame.move.capturedId].filter(Boolean),
                        [move.from, move.to, frame.move.capturedSquare].filter(Boolean), [frame.move],
                        move.pieceId !== frame.move.pieceId ? [{ from: move.from, to: move.to, kind: 'castle-rook' }] : [])), '.')), ' '),
                ' Captured: ', mechanism.captured ? entity(mechanism.captured, before) : 'nothing', `. White-minus-Black material changed by ${mechanism.materialDeltaWhite}. `,
                `The resulting board ${mechanism.checkmate ? 'is checkmate' : mechanism.check ? 'is check' : 'is not check'}. These are immediate effects, not a strategic recommendation.`),
            reference(before, [...mechanism.moved.map(move => move.pieceId), mechanism.captured?.id].filter(Boolean),
                [...mechanism.moved.flatMap(move => [move.from, move.to]), mechanism.captured?.square].filter(Boolean), [frame.move]));
        }
    } else if(query.intent === 'compare-frames') {
        const other = context.frames.find(other => other.id === query.otherFrameId);
        const changes = frame.pieces.map(piece => ({ before: piece, after: other.pieces.find(after => after.id === piece.id) || null }))
            .filter(({ before, after }) => !after || before.square !== after.square || before.type !== after.type);
        const added = other.pieces.filter(piece => !frame.pieces.some(before => before.id === piece.id));
        const refs = reference(frame, changes.map(change => change.before.id), changes.map(change => change.before.square));
        refs.relatedFrames = [reference(other, [...changes.map(change => change.after?.id).filter(Boolean), ...added.map(piece => piece.id)],
            [...changes.map(change => change.after?.square).filter(Boolean), ...added.map(piece => piece.square)])];
        add('compare-frames', { from: frame.id, to: other.id, changes, added,
            materialDeltaWhite: other.spatial.material.whiteMinusBlack - spatial.material.whiteMinusBlack },
        prose('Comparing this frame with ', { text: other.scope.label, anchors: other.scope.anchors || [] }, ': ', changes.length || added.length
            ? prose(joined([...changes.map(({ before, after }) => prose(entity(before), ' ', after ? prose('is ', entity(after, other), ' in the other frame') : 'is absent in the other frame')),
                ...added.map(piece => prose(entity(piece, other), ' is present only in the other frame'))], '; '), '.') : 'piece placements and types are unchanged.',
            ` White-minus-Black material difference between these frames: ${other.spatial.material.whiteMinusBlack - spatial.material.whiteMinusBlack}. `,
            'This comparison does not assert that one board follows the other by a legal move.'), refs);
    }
    if(!cards.length) throw new Error('Factual query produced no explicit answer or evidence-limit card.');
    return freeze({ schema: 'pena-v2-fact-answer/1', gameId: context.gameId, revision: context.revision, query,
        scope: frame.scope, status, cards, requiredCardIds: cards.map(card => card.id) });
}

function verifyPacket(context, answer) {
    contextCheck(context);
    if(!answer || answer.gameId !== context.gameId || answer.revision !== context.revision)
        throw new Error('Stale or cross-game factual answer.');
    if(JSON.stringify(answer) !== JSON.stringify(compileFactAnswer(context, answer.query)))
        throw new Error('Factual answer differs from its authoritative query result.');
}

export function defaultFactSelection(answer) {
    return { schema: 'pena-v2-fact-selection/1', gameId: answer.gameId, revision: answer.revision,
        frameId: answer.query.frameId, cardIds: [...answer.requiredCardIds] };
}

/** Selection is untrusted. It cannot edit facts or omit required answer slots. */
export function renderFactAnswer(context, answer, selection = defaultFactSelection(answer)) {
    verifyPacket(context, answer);
    keys(selection, ['schema', 'gameId', 'revision', 'frameId', 'cardIds']);
    if(selection.schema !== 'pena-v2-fact-selection/1' || selection.gameId !== context.gameId || selection.revision !== context.revision
        || selection.frameId !== answer.query.frameId || !Array.isArray(selection.cardIds)
        || selection.cardIds.length !== answer.requiredCardIds.length || new Set(selection.cardIds).size !== selection.cardIds.length
        || answer.requiredCardIds.some(id => !selection.cardIds.includes(id))) throw new Error('Invalid selection or missing mandatory factual answer slots.');
    const prefix = `${answer.scope.label}.${answer.scope.assumption ? ' ' + answer.scope.assumption : ''}`;
    const segments = [{ text: prefix, anchors: answer.scope.anchors || [], references: { frameId: answer.query.frameId, scope: answer.scope.kind, pieceIds: [], squares: [], moves: [], relations: [] } }];
    if(answer.status === 'ambiguous') segments.push({ text: 'The subject is ambiguous. These are separate pieces and their facts must not be combined.', references: segments[0].references });
    for(const id of selection.cardIds) segments.push(...answer.cards.find(card => card.id === id).segments);
    return freeze({ schema: 'pena-v2-fact-delivery/1', gameId: context.gameId, revision: context.revision, status: answer.status,
        text: segments.map(segment => segment.text).join(' '), segments, speechSegments: segments });
}

/** Packs a complete answer atomically. No greedy dropping of prerequisites. */
export function packFactAnswer(context, answer, { tokenCount, maxTokens } = {}) {
    verifyPacket(context, answer);
    if(typeof tokenCount !== 'function' || !Number.isSafeInteger(maxTokens) || maxTokens < 1) throw new Error('A factual packet needs its actual tokenizer and token budget.');
    const text = JSON.stringify(answer), count = tokenCount(text);
    if(!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid factual-packet token count.');
    if(count > maxTokens) throw new Error('The complete factual answer exceeds the token budget; use deterministic delivery or a narrower explicit query.');
    return text;
}
