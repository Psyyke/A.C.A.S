import { PositionGraph } from './positions.js';
import { spatialFacts } from './spatial.js';
import { pieceAfterState, afterStateText } from './coaching-state.js';
import { humanCandidates } from './human.js';
import { compactCoachingInput } from './coaching-compact.js';
import { moveInsightFacts } from './insights.js';
import { groundedCoachingBudget } from './models.js';
import { packGroundedMessages } from './grounded-packing.js';
import { recordedHistoryEvidence, recordedHistoryFact } from './history-evidence.js';
import { strategicCoachingEvidence } from './strategic-coaching-input.js';

const freeze = value => {
    if(value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};
const listHistory = history => JSON.stringify(history.slice(-8));

/** Shared app/export view of real engine outputs. No target reply participates. */
export function engineCoachingEvidence({ snapshot, maia = null, maiaModelSha256 = null, maxPlies = 4 }) {
    if(snapshot?.schema !== 'pena-v2-search/1' || snapshot.perspective !== 'root-side-to-move'
        || !/^[a-f0-9]{64}$/.test(snapshot.engine?.networkSha256 || '')
        || !Number.isSafeInteger(snapshot.budget?.nodes) || snapshot.budget.nodes < 1
        || !Array.isArray(snapshot.budget.moves) || snapshot.budget.moves.length !== 0
        || !Array.isArray(snapshot.history) || !Array.isArray(snapshot.lines) || !Array.isArray(snapshot.candidates)
        || !Number.isSafeInteger(maxPlies) || maxPlies < 1 || maxPlies > 6)
        throw new Error('Engine coaching needs an unrestricted authenticated root-side search contract and bounded horizon.');
    const graph = new PositionGraph(snapshot.fen, snapshot.history.slice(-8));
    graph.root.spatial = spatialFacts(graph.root);
    const legal = graph.root.spatial.legalMoves;
    const refs = [], frames = [], used = new Set();
    const lines = [];
    if(snapshot.bestMove !== null && !legal.some(move => move.uci === snapshot.bestMove))
        throw new Error('Engine preference is not legal on its recorded board.');
    const preferred = snapshot.lines.find(line => line.pv?.[0] === snapshot.bestMove);
    if(snapshot.bestMove && !preferred) throw new Error('Engine preference lacks its supplied continuation.');
    for(const line of [...(preferred ? [preferred] : []), ...snapshot.lines]) {
        if(used.has(line.pv?.[0])) continue;
        if(lines.length === 2) break;
        if(!Array.isArray(line.pv) || !line.pv.length) throw new Error('Empty engine continuation.');
        used.add(line.pv[0]);
        const path = graph.branch(`lc0-${lines.length + 1}`, line.pv.slice(0, maxPlies), { maxPlies });
        const stats = snapshot.candidates.find(candidate => candidate.move === line.pv[0]);
        if(!stats || !Number.isSafeInteger(stats.visits) || stats.visits < 0
            || !Number.isFinite(stats.policyPrior) || stats.policyPrior < 0 || stats.policyPrior > 1
            || stats.visits > 0 && (!stats.search || !Number.isFinite(stats.search.q) || Math.abs(stats.search.q) > 1.001))
            throw new Error('Engine continuation lacks valid actual visit/prior/value metadata.');
        const id = `LC${lines.length + 1}`, first = path[0];
        first.spatial = spatialFacts(first);
        const before = new Map(graph.root.pieces.map(piece => [piece.id, piece]));
        const moved = first.pieces.filter(piece => before.get(piece.id)?.square !== piece.square)
            .map(piece => pieceAfterState(first, piece.id));
        const changes = moveInsightFacts(graph.root, first).filter(fact =>
            ['capture', 'check', 'promotion', 'created-pin', 'removed-pin', 'extended-ray', 'lost-attack'].includes(fact.kind));
        const isPreferred = line.pv[0] === snapshot.bestMove;
        const text = `${isPreferred ? 'Recorded LC0 preference' : 'LC0 alternative'} for ${graph.root.spatial.turn}: `
            + `${path.map(frame => `${frame.move.color}:${frame.move.san}`).join(' ')}; N=${stats.visits}; P=${stats.policyPrior}; `
            + `Q=${stats.visits > 0 ? stats.search.q : 'UNAVAILABLE(unvisited)'}.`;
        refs.push({ id, kind: 'lc0-line', frameId: first.id, text, data: { moves: path.map(frame => frame.move.uci),
            frameIds: path.map(frame => frame.id), preferred: isPreferred, visits: stats.visits,
            policyPrior: stats.policyPrior, q: stats.visits > 0 ? stats.search.q : null } });
        refs.push({ id: `${id}.S`, kind: 'lc0-first-move-state', frameId: first.id,
            text: `IF ${id}, after FIRST move only, not the leaf/live board. Complete occupied relations of ALL moved pieces: ${moved.map(piece => afterStateText(piece, first)).join(' | ')}`
                + (changes.length ? ` Exact first-move changes: ${changes.map(fact => fact.text).join(' ')}` : ''),
            data: { moved, capturedId: first.move.capturedId, capturedSquare: first.move.capturedSquare, changes } });
        frames.push(...path);
        lines.push(id);
    }
    const human = [];
    if(maia !== null) {
        if(!/^[a-f0-9]{64}$/.test(maiaModelSha256 || '')) throw new Error('Human-choice evidence requires its actual Maia model hash.');
        human.push(...humanCandidates(maia.result, snapshot.fen, { eloSelf: maia.eloSelf, eloOpponent: maia.eloOpponent }));
        for(const [index, item] of human.entries()) {
            const move = legal.find(move => move.uci === item.move);
            refs.push({ id: `MC${index + 1}`, kind: 'maia-choice', frameId: 'root', data: item,
                text: `Maia-3 ${item.color}:${move.san}, human-choice P=${item.probability}, configured self/opponent Elo=${item.eloSelf}/${item.eloOpponent}. These are model conditions, not observed player ratings.` });
        }
    }
    const evidence = ['NEW ENGINE CONTEXT: w/b=White/Black. LC*=current LC0 search, not the saved Stockfish L/A definitions. '
        + 'N=actual visits, P=network move prior, Q=bounded root-side searched value. None is calibrated confidence or an explanation. '
        + 'IF lines are legal sampled continuations, not forced or played. MC*=Maia human choice, not strength/win probability.',
    `LC0 network=${snapshot.engine.networkSha256.slice(0, 12)}; budget=${snapshot.budget.nodes} nodes; precision=${snapshot.engine.precision}; backend=${snapshot.engine.backend}. `
        + 'No draw probability or moves-left prediction is inferred from placeholder search fields without declared network heads.',
    ...refs.map(ref => `[${ref.id}] ${ref.text}`),
    ...(!snapshot.bestMove ? ['LC0 supplies no move recommendation on this root.'] : []),
    ...(maia === null ? ['Maia unavailable.'] : !human.length ? ['Maia legal-choice set is empty on this terminal board.'] : [])].join('\n');
    return freeze({ schema: 'pena-v2-engine-coaching-evidence/1', fen: snapshot.fen, history: [...snapshot.history.slice(-8)],
        references: refs, frames, evidence, human, source: { engine: structuredClone(snapshot.engine),
            budget: structuredClone(snapshot.budget), maiaModelSha256: maia === null ? null : maiaModelSha256 },
        boundary: 'Typed searched choices and complete first-move geometry, not private engine reasons, calibrated odds or proof of forced outcomes.' });
}

export function joinEngineMessages(messages, engineEvidence, { fen, history = [], question }, extraReferences = []) {
    if(!Array.isArray(messages) || messages[0]?.role !== 'system' || !Array.isArray(history)
        || !Array.isArray(engineEvidence?.history) || typeof question !== 'string' || !question.trim())
        throw new Error('Invalid engine-message context.');
    if(engineEvidence?.schema !== 'pena-v2-engine-coaching-evidence/1' || engineEvidence.fen !== fen
        || listHistory(engineEvidence.history) !== listHistory(history))
        throw new Error('Engine evidence does not match the exact model-input board/history.');
    const suffix = `\n\nPlayer question: ${question}`, last = messages.at(-1);
    if(last?.role !== 'user' || !last.content.endsWith(suffix)) throw new Error('Unexpected compact model-input framing.');
    const joined = messages.map((message, index) => index === messages.length - 1
        ? { ...message, content: last.content.slice(0, -suffix.length) + '\n' + engineEvidence.evidence
            + '\n' + recordedHistoryEvidence(fen, history)
            + (extraReferences.length ? '\n' + extraReferences.map(ref => `[${ref.id}] ${ref.text}`).join('\n') : '') + suffix } : { ...message });
    return freeze(packGroundedMessages(joined, question));
}

export function groundedCoachingInput({ engineEvidence, ...args }) {
    if(engineEvidence?.schema !== 'pena-v2-engine-coaching-evidence/1' || engineEvidence.fen !== args.fen
        || listHistory(engineEvidence.history) !== listHistory(args.history || []))
        throw new Error('Engine evidence does not match the exact model-input board/history.');
    const input = compactCoachingInput({ ...args, maia: null });
    const existing = new Set([...input.references.map(ref => ref.id), ...input.legacyReferenceIds]);
    const historyReference = recordedHistoryFact(args.fen, args.history || []);
    if(existing.has(historyReference.id)) throw new Error('History reference collides with an existing source definition.');
    if(engineEvidence.references.some(ref => existing.has(ref.id))) throw new Error('Engine reference collides with an existing source definition.');
    const strategy = strategicCoachingEvidence(input, engineEvidence);
    for(const ref of strategy.references) {
        if(existing.has(ref.id) || engineEvidence.references.some(item => item.id === ref.id))
            throw new Error('Strategic coaching reference collides with an existing source definition.');
        existing.add(ref.id);
    }
    const messages = joinEngineMessages(input.messages, engineEvidence, args, strategy.references);
    return freeze({ ...input, schema: 'pena-v2-grounded-coaching-input/3', packing: 'pena-v2-grounded-packing/3', messages,
        modelProfile: 'grounded-coaching', modelBudget: groundedCoachingBudget,
        references: [...input.references, ...engineEvidence.references, historyReference, ...strategy.references], frames: [...input.frames, ...engineEvidence.frames],
        engineEvidence, strategy, limitation: 'Shared grounded input with computed BinProp contrasts and exact conditional forcing effects. Target alignment, context budget and actual coaching quality remain independent gates.' });
}
