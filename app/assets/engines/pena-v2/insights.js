import { PositionGraph, effectsBetween, boardAt } from './positions.js';
import { spatialFacts, moveMechanism } from './spatial.js';
import { suggestHumanCandidates } from './human.js';
import { coachingStrategy } from './strategy.js';

const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const colorName = color => color === 'w' ? 'White' : 'Black';
const pieceName = piece => `${colorName(piece.color)} ${names[piece.type]} on ${piece.square}`;
const copy = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function moveInsightFacts(before, after) {
    const mechanism = moveMechanism(before, after), effects = effectsBetween(before, after);
    const old = before.spatial || spatialFacts(before), next = after.spatial || spatialFacts(after);
    const facts = [];
    const add = (kind, data, text, priority) => facts.push({ kind, beforeFrameId: before.id, frameId: after.id, data, text, priority });
    const actor = before.pieces.find(piece => piece.id === after.move.pieceId);
    add('action', { move: after.move, moved: mechanism.moved }, `${pieceName(actor)} plays ${after.move.san} to ${after.move.to}`
        + (mechanism.moved.length > 1 ? `; the rook also moves from ${mechanism.moved[1].from} to ${mechanism.moved[1].to}` : '') + '.', 1000);
    if(mechanism.captured) add('capture', { captured: mechanism.captured, deltaWhite: mechanism.materialDeltaWhite },
        `This captures the ${pieceName(mechanism.captured)}${after.move.capturedSquare !== after.move.to ? ' en passant' : ''}.`, 100);
    if(after.move.promotion) add('promotion', { pieceId: actor.id, type: after.move.promotion },
        `The pawn promotes to a ${names[after.move.promotion]} on ${after.move.to}.`, 100);
    if(next.check) add('check', { checkmate: next.checkmate }, `${colorName(next.turn)} is ${next.checkmate ? 'checkmated' : 'in check'} after this move.`, 95);
    for(const ray of old.rays) {
        const newRay = next.rays.find(item => item.pieceId === ray.pieceId && item.dx === ray.dx && item.dy === ray.dy && item.from === ray.from);
        const blocker = before.pieces.find(piece => piece.id === ray.firstBlocker?.pieceId);
        if(!newRay || !blocker || after.pieces.some(piece => piece.id === blocker.id && piece.square === blocker.square)) continue;
        const reach = item => [...item.emptySquares, ...(item.firstBlocker ? [item.firstBlocker.square] : [])];
        const gainedSquares = reach(newRay).filter(square => !reach(ray).includes(square));
        if(!gainedSquares.length) continue;
        const slider = after.pieces.find(piece => piece.id === ray.pieceId);
        add('extended-ray', { slider, formerBlocker: blocker, gainedSquares },
            `With the ${pieceName(blocker)} no longer at ${blocker.square}, the ${pieceName(slider)} geometrically controls farther along that ray: ${gainedSquares.join(', ')}.`, 85);
    }
    for(const change of ['removed', 'created']) for(const pin of mechanism[`${change}Pins`].filter(pin => pin.kind === 'pin')) {
        const frame = change === 'removed' ? before : after;
        const front = frame.pieces.find(piece => piece.id === pin.frontId), back = frame.pieces.find(piece => piece.id === pin.backId);
        add(`${change}-pin`, { pin }, `This ${change === 'removed' ? 'removes' : 'creates'} the ${pin.pinType} pin of the ${pieceName(front)} to the ${pieceName(back)}.`, 80);
    }
    for(const relation of effects.gained.filter(item => ['attack', 'defend'].includes(item.kind))) {
        const source = after.pieces.find(piece => piece.id === relation.pieceId), target = after.pieces.find(piece => piece.id === relation.targetId);
        add(`new-${relation.kind}`, { relation, source, target },
            `The ${pieceName(source)} now geometrically ${relation.kind === 'attack' ? 'attacks' : 'defends'} the ${pieceName(target)}; this alone does not establish a safe capture or a material win.`, relation.kind === 'attack' ? 70 : 60);
    }
    for(const relation of effects.lost.filter(item => item.kind === 'attack')) {
        const source = after.pieces.find(piece => piece.id === relation.pieceId), target = after.pieces.find(piece => piece.id === relation.targetId);
        if(!source || !target) continue;
        const beforeSource = before.pieces.find(piece => piece.id === source.id), beforeTarget = before.pieces.find(piece => piece.id === target.id);
        add('lost-attack', { relation, beforeSource, beforeTarget, source, target },
            `After ${after.move.san}, the ${pieceName(source)} no longer geometrically attacks the ${pieceName(target)}`
                + (beforeTarget.square !== target.square ? ` (previously on ${beforeTarget.square})` : '')
                + '. This ends that specific attack, not necessarily all counterplay.', 88);
    }
    const moved = next.pieces.find(piece => piece.id === actor.id), previous = old.pieces.find(piece => piece.id === actor.id);
    const center = moved.controls.filter(square => ['d4', 'e4', 'd5', 'e5'].includes(square) && !previous.controls.includes(square));
    if(center.length) add('new-center-control', { piece: moved, squares: center },
        `The ${pieceName(moved)} newly controls the central ${center.length === 1 ? 'square' : 'squares'} ${center.join(', ')}.`, 55);
    return facts;
}

function checkSearch(search, root, { fen = root.fen, history = root.history, moves } = {}) {
    if(search?.schema !== 'pena-v2-search/1' || search.fen !== fen || !equal(search.history, history)
        || !equal(search.engine, root.engine) || search.perspective !== 'root-side-to-move'
        || search.budget?.nodes !== root.budget.nodes || moves && !equal(search.budget.moves, moves))
        throw new Error('Coaching searches must match board/history, engine, budget, perspective and candidate restriction.');
    if(!Array.isArray(search.lines) || !Array.isArray(search.candidates)) throw new Error('Missing raw search evidence.');
}

export function buildCoachingRecord(study, { question, playerColor, focusMove = null, opponentMove = null, subjectSquares = [], rayQueries = [] } = {}) {
    const { root, candidates, human = [] } = study;
    if(typeof question !== 'string' || !question.trim() || !['w', 'b'].includes(playerColor)
        || !Array.isArray(candidates) || !candidates.length || candidates.length > 4
        || new Set(candidates.map(item => item.move)).size !== candidates.length || !Array.isArray(subjectSquares) || !Array.isArray(rayQueries))
        throw new Error('Invalid coaching question or candidate set.');
    checkSearch(root, root, { moves: [] });
    if(!candidates.some(item => item.move === root.bestMove) || focusMove && !candidates.some(item => item.move === focusMove))
        throw new Error('Missing recommended or requested candidate.');
    const graph = new PositionGraph(root.fen, root.history);
    graph.root.spatial = spatialFacts(graph.root);
    const subjects = subjectSquares.map(square => {
        const piece = graph.root.pieces.find(piece => piece.square === square);
        if(!piece) throw new Error(`No coaching subject on ${square}.`);
        return piece.id;
    });
    const facts = [], branches = [];
    const addFacts = values => values.map(fact => {
        const saved = { id: `fact-${facts.length + 1}`, ...fact };
        facts.push(saved); return saved.id;
    });
    for(const [index, candidate] of candidates.entries()) {
        const { move, search, reply, probe = null } = candidate;
        if(opponentMove && move === focusMove && !probe || probe && (move !== focusMove || probe.bestMove !== opponentMove))
            throw new Error('Missing or mismatched explicitly requested opponent investigation.');
        checkSearch(search, root, { moves: [move] });
        if(search.bestMove !== move) throw new Error('Restricted search did not return its candidate.');
        const [after] = graph.branch(`choice${index + 1}`, [move]);
        after.spatial = spatialFacts(after);
        const childOptions = { fen: after.fen, history: [...root.history, root.fen] };
        checkSearch(reply, root, { ...childOptions, moves: [] });
        if(probe) checkSearch(probe, root, { ...childOptions, moves: [probe.bestMove] });
        const stats = search.candidates.find(item => item.move === move);
        if(!stats?.visits || !stats.search || !Number.isFinite(stats.search.q)) throw new Error('Candidate has no independently searched value.');
        const immediate = moveInsightFacts(graph.root, after);
        for(const id of subjects) {
            const piece = after.spatial.pieces.find(piece => piece.id === id);
            if(piece) immediate.push({ kind: 'subject-defense', beforeFrameId: 'root', frameId: after.id,
                data: { piece, defenders: piece.defenders.map(id => after.pieces.find(piece => piece.id === id)) }, priority: 90,
                text: `After ${after.move.san}, the ${pieceName(piece)} has ${piece.defenders.length} geometric defenders`
                    + (piece.defenders.length ? `: ${piece.defenders.map(id => pieceName(after.pieces.find(piece => piece.id === id))).join('; ')}` : '')
                    + '. Geometric defense does not prove safety.' });
            for(const pin of after.spatial.pins.filter(pin => pin.kind === 'pin' && pin.frontId === id)) {
                const slider = after.pieces.find(piece => piece.id === pin.sliderId), back = after.pieces.find(piece => piece.id === pin.backId);
                immediate.push({ kind: 'subject-pin', beforeFrameId: 'root', frameId: after.id, data: { pin }, priority: 96,
                    text: `After ${after.move.san}, the ${pieceName(piece)} is in ${pin.pinType} pin geometry: ${pieceName(slider)} -> ${pieceName(piece)} -> ${pieceName(back)}. `
                        + 'This is geometry on this frame, not a claim about the position after an opponent reply.' });
            }
        }
        for(const query of rayQueries) {
            const piece = graph.root.pieces.find(piece => piece.square === query.square);
            const ray = after.spatial.rays.find(ray => ray.pieceId === piece?.id && ray.dx === query.dx && ray.dy === query.dy);
            if(!ray) throw new Error('Requested coaching ray is unavailable on this candidate frame.');
            const slider = after.pieces.find(piece => piece.id === ray.pieceId), blocker = after.pieces.find(piece => piece.id === ray.firstBlocker?.pieceId);
            immediate.push({ kind: 'subject-ray', beforeFrameId: 'root', frameId: after.id, data: { ray, slider, blocker: blocker || null }, priority: 97,
                text: `After ${after.move.san}, the ${pieceName(slider)} has ${blocker ? `the ${pieceName(blocker)} as its first blocker` : 'no blocker'} on this requested ray. `
                    + `Intervening empty squares: ${ray.emptySquares.join(', ') || 'none'}.` });
        }
        const immediateIds = addFacts(immediate);
        const lines = [];
        for(const source of [reply, ...(probe ? [probe] : [])]) {
            if(!source.bestMove) {
                if(!after.spatial.checkmate && !after.spatial.stalemate) throw new Error('Missing reply on a nonterminal board.');
                continue;
            }
            const eligible = source.lines.filter(line => line.pv?.[0] && (source !== probe || line.pv[0] === probe.bestMove));
            if(!eligible.some(line => line.pv[0] === source.bestMove)) throw new Error('Missing searched best-reply witness.');
            for(const line of eligible.slice(0, source === probe ? 1 : 2)) {
                const moves = line.pv.slice(0, 4);
                if(lines.some(item => equal(item.moves, moves))) continue;
                const frames = graph.branch(`choice${index + 1}line${lines.length + 1}`, moves, { parent: after.id });
                let before = after;
                const factIds = [];
                for(const frame of frames) {
                    frame.spatial = spatialFacts(frame);
                    factIds.push(...addFacts(moveInsightFacts(before, frame)));
                    before = frame;
                }
                lines.push({ searchId: source.searchId, role: source === probe ? 'asked-opponent-idea' : 'searched-reply',
                    moves, frameIds: frames.map(frame => frame.id), factIds,
                    materialDeltaWhite: before.spatial.material.whiteMinusBlack - graph.root.spatial.material.whiteMinusBlack,
                    semantics: 'Sampled legal line, not a forced sequence. Material delta is at this horizon, not a proven gain.' });
            }
        }
        branches.push({ move, san: after.move.san, frameId: after.id, recommended: move === root.bestMove,
            requested: move === focusMove, human: human.find(item => item.move === move) || null,
            searchId: search.searchId, replySearchId: reply.searchId, q: stats.search.q, visits: stats.visits,
            immediateIds, lines });
    }
    return { schema: 'pena-v2-coaching/1', question, playerColor, focusMove, engine: copy(root.engine), budget: copy(root.budget),
        rootSearchId: root.searchId, rootFrameId: 'root', branches, facts, frames: [...graph.frames.values()].filter(frame => frame.id === 'root' || frame.branch.startsWith('choice')),
        limitations: [
            'Immediate effects are exact; their pedagogical importance and the engine preference are not thereby proven causal explanations.',
            'Geometric attacks/defenses include pinned pieces; they do not establish legal captures, safety or forced wins.',
            'All continuations are conditional sampled witnesses. Opponent intentions are unknown. Unlisted effects are not asserted absent.',
            'Q is an engine-specific bounded search estimate, not a calibrated probability. Search settings and network are fixed within this record.'
        ] };
}

export async function analyseCoaching(engine, fen, { history = [], nodes = 2048, question, playerColor,
    focusMove = null, opponentMove = null, subjectSquares = [], rayQueries = [], maia = null, eloSelf = 1800, eloOpponent = 1800, signal } = {}) {
    const root = await engine.search(fen, { history, nodes, signal });
    if(!root.bestMove) throw new Error('Coaching research currently requires a nonterminal position.');
    const human = maia ? await suggestHumanCandidates(maia, fen, { history, eloSelf, eloOpponent, limit: 1, signal }) : [];
    const alternatives = root.candidates.filter(item => item.visits > 0).map(item => item.move);
    const moves = [...new Set([root.bestMove, focusMove, ...human.map(item => item.move)].filter(Boolean))];
    if(moves.length === 1) {
        const alternative = alternatives.find(move => !moves.includes(move));
        if(alternative) moves.push(alternative);
    }
    const candidates = [];
    for(const move of moves) {
        const search = await engine.search(fen, { history, nodes, moves: [move], signal });
        const [after] = new PositionGraph(fen, history).branch('reply', [move]);
        const childOptions = { history: [...history, root.fen], nodes, signal };
        const reply = await engine.search(after.fen, childOptions);
        const probe = opponentMove && move === focusMove
            ? await engine.search(after.fen, { ...childOptions, moves: [opponentMove] }) : null;
        candidates.push({ move, search, reply, probe });
    }
    const study = { root, candidates, human };
    return { ...study, record: buildCoachingRecord(study, { question, playerColor, focusMove, opponentMove, subjectSquares, rayQueries }) };
}

export function coachingPacket(record, { includeStrategy = false } = {}) {
    if(record?.schema !== 'pena-v2-coaching/1') throw new Error('Expected a verified coaching record.');
    const ids = new Set();
    for(const branch of record.branches) {
        const choose = (values, count) => values.map(id => record.facts.find(fact => fact.id === id))
            .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)).slice(0, count).forEach(fact => ids.add(fact.id));
        // The specifically asked move retains every immediate fact, including all subject/ray slots.
        choose(branch.immediateIds, branch.requested ? branch.immediateIds.length : 4);
        for(const line of branch.lines) {
            for(const id of line.factIds.filter(id => record.facts.find(fact => fact.id === id).kind === 'action')) ids.add(id);
            choose(line.factIds.filter(id => record.facts.find(fact => fact.id === id).kind !== 'action'), 2);
        }
    }
    const scope = fact => {
        const path = [];
        let frame = record.frames.find(frame => frame.id === fact.frameId);
        while(frame?.parentId) {
            path.unshift(`${colorName(frame.move.color)} ${frame.move.san}`);
            frame = record.frames.find(parent => parent.id === frame.parentId);
        }
        if(frame?.id !== 'root' || !path.length) throw new Error('Coaching fact has no complete conditional source path.');
        return `Conditional line: ${path.join(', ')}.`;
    };
    return { schema: 'pena-v2-coaching-packet/1', question: record.question, playerColor: colorName(record.playerColor),
        turn: colorName(boardAt(record.frames.find(frame => frame.id === 'root').fen).turn()), nodesPerSearch: record.budget.nodes,
        rootPieces: record.frames.find(frame => frame.id === 'root').pieces.map(pieceName),
        branches: record.branches.map(({ immediateIds, lines, human, ...branch }) => ({ ...branch,
            human: human ? { probability: human.probability, eloSelf: human.eloSelf, eloOpponent: human.eloOpponent,
                semantics: 'Human move-choice estimate, not move quality.' } : null,
            immediateIds: immediateIds.filter(id => ids.has(id)), lines: lines.map(line => ({ ...line, factIds: line.factIds.filter(id => ids.has(id)) })) })),
        facts: record.facts.filter(fact => ids.has(fact.id)).map(fact => ({ id: fact.id, frameId: fact.frameId,
            beforeFrameId: fact.beforeFrameId, text: fact.text, scope: scope(fact) })),
        omittedFactCount: record.facts.length - ids.size, limitations: record.limitations,
        ...(includeStrategy ? { strategyComparisons: coachingStrategy(record, { enabled: true }) } : {}) };
}

export function deterministicCoaching(packet) {
    const branch = packet.branches.find(branch => branch.requested) || packet.branches.find(branch => branch.recommended);
    const fact = id => packet.facts.find(fact => fact.id === id).text;
    const reply = branch.lines.find(line => line.role === 'asked-opponent-idea') || branch.lines[0];
    return `For ${branch.san}: ${branch.immediateIds.map(fact).join(' ')}`
        + (reply ? ` One conditional continuation: ${reply.factIds.slice(0, 3).map(fact).join(' ')}` : '')
        + ` ${branch.recommended ? 'This is the root search preference.' : `The root search instead prefers ${packet.branches.find(item => item.recommended).san}.`}`
        + ' These effects do not prove the reason for that preference or force the sampled replies.';
}

export function renderCoachingEvidence(packet) {
    const fact = id => { const item = packet.facts.find(fact => fact.id === id); return `[${id}] ${item.text}`; };
    return [`Player: ${packet.playerColor}; actual turn: ${packet.turn}. Search budget: ${packet.nodesPerSearch} nodes per independent search.`,
        `CURRENT piece map: ${packet.rootPieces.join('; ')}.`, ...packet.limitations,
        ...packet.branches.flatMap(branch => [
            `CANDIDATE ${branch.san} (${branch.move}): ${branch.recommended ? 'root search preference' : 'alternative'}${branch.requested ? ', specifically asked about' : ''}.`,
            ...branch.immediateIds.map(id => `Immediate frame ${branch.frameId}: ${fact(id)}`),
            ...branch.lines.flatMap((line, index) => [`Conditional line ${index + 1} AFTER ${branch.san}; ${line.role}; NOT forced:`,
                ...line.factIds.map(id => `Frame ${packet.facts.find(fact => fact.id === id).frameId}: ${fact(id)}`),
                `At this sampled endpoint only, material change from CURRENT: White minus Black ${line.materialDeltaWhite >= 0 ? '+' : ''}${line.materialDeltaWhite} points (P1 N/B3 R5 Q9); not a guaranteed gain.`])
        ]), ...(packet.strategyComparisons || []).map(item => `VERIFIED PAIRED STRATEGIC EVIDENCE:\n${item.text}`),
        `Other exact effects omitted: ${packet.omittedFactCount}. Omission does not mean an effect is absent.`].join('\n');
}
