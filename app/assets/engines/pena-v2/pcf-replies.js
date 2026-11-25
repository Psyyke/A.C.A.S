import { PositionGraph, playUci, boardAt } from './positions.js';
import { parseQuestionMoves } from './questions.js';

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function rootContext(input) {
    if(input?.schema !== 'pena-v2-grounded-coaching-input/3' || input.engineEvidence?.schema !== 'pena-v2-engine-coaching-evidence/1')
        throw new Error('Reply searches require the actual grounded root evidence.');
    const root = input.frames.find(frame => frame.id === 'root'), engine = input.engineEvidence;
    if(!root || root.fen !== engine.fen || !Array.isArray(engine.history) || !Number.isSafeInteger(engine.source?.budget?.nodes))
        throw new Error('Reply searches require an authenticated root, history and search budget.');
    return { root, engine };
}

function validateSearch(snapshot, { fen, history, engine, nodes, maxReplies }) {
    if(snapshot?.schema !== 'pena-v2-search/1' || snapshot.fen !== fen || !equal(snapshot.history, history)
        || !equal(snapshot.engine, engine) || snapshot.perspective !== 'root-side-to-move'
        || snapshot.budget?.nodes !== nodes || !Array.isArray(snapshot.budget.moves) || snapshot.budget.moves.length
        || !Array.isArray(snapshot.lines) || !Array.isArray(snapshot.candidates))
        throw new Error('Conditional reply search differs from its exact board, history, engine or budget.');
    const board = boardAt(fen), seen = new Set(), ranks = new Set(), replies = [];
    if(snapshot.bestMove !== null) playUci(boardAt(fen), snapshot.bestMove);
    const preferred = snapshot.lines.find(line => line.pv?.[0] === snapshot.bestMove);
    if(snapshot.bestMove && !preferred) throw new Error('Conditional reply preference lacks a searched continuation.');
    for(const line of snapshot.lines) {
        if(!Number.isSafeInteger(line.rank) || line.rank < 1 || ranks.has(line.rank)) throw new Error('Conditional reply has an invalid or duplicate MultiPV rank.');
        ranks.add(line.rank);
    }
    const ordered = [...snapshot.lines].sort((a, b) => Number(b.pv?.[0] === snapshot.bestMove) - Number(a.pv?.[0] === snapshot.bestMove) || a.rank - b.rank);
    for(const line of ordered) {
        if(!Array.isArray(line.pv) || !line.pv.length) throw new Error('Conditional reply has an empty continuation.');
        if(seen.has(line.pv[0])) continue;
        seen.add(line.pv[0]);
        const graph = new PositionGraph(fen, history);
        graph.branch(`reply${seen.size}`, line.pv.slice(0, 4), { maxPlies: 4 });
        const stats = snapshot.candidates.find(item => item.move === line.pv[0]);
        if(!stats || !Number.isSafeInteger(stats.visits) || stats.visits < 0
            || !Number.isFinite(stats.policyPrior) || stats.policyPrior < 0 || stats.policyPrior > 1
            || stats.visits > 0 && (!Number.isFinite(stats.search?.q) || Math.abs(stats.search.q) > 1.001))
            throw new Error('Conditional reply lacks actual visit, policy or searched-value metadata.');
        if(replies.length < maxReplies) replies.push({ move: line.pv[0], line: line.pv.slice(0, 4), rank: line.rank,
            preferred: line.pv[0] === snapshot.bestMove, visits: stats.visits, policyPrior: stats.policyPrior,
            q: stats.visits ? stats.search.q : null });
    }
    if(snapshot.bestMove === null && (snapshot.lines.length || !board.in_checkmate() && !board.in_stalemate()))
        throw new Error('A missing conditional reply is valid only for a terminal board.');
    return { replies, available: seen.size, omitted: Math.max(0, seen.size - replies.length), turn: board.turn(), terminal: !snapshot.bestMove };
}

/** Explicit opt-in: make actual opponent-root searches after recorded current candidates. */
export async function collectPcfReplySearches(input, engine, { maxParents = 3, maxReplies = 3, signal } = {}) {
    const { root, engine: rootEngine } = rootContext(input);
    if(typeof engine?.search !== 'function' || !Number.isSafeInteger(maxParents) || maxParents < 1 || maxParents > 4
        || !Number.isSafeInteger(maxReplies) || maxReplies < 1 || maxReplies > 3)
        throw new Error('Invalid bounded PCF reply-search request.');
    const lc = rootEngine.references.filter(ref => ref.kind === 'lc0-line');
    const requested = parseQuestionMoves(input.question, root.fen).filter(item => !item.opponent)
        .map(item => item.move.from + item.move.to + (item.move.promotion || ''));
    const known = [...lc.map(ref => ref.data.moves[0]), ...input.lines.map(line => line.moves[0])];
    const parents = [...new Set([lc.find(ref => ref.data.preferred)?.data.moves[0], ...requested.filter(move => known.includes(move)), ...known].filter(Boolean))].slice(0, maxParents);
    const records = [];
    for(const [index, parentMove] of parents.entries()) {
        signal?.throwIfAborted();
        const graph = new PositionGraph(root.fen, rootEngine.history);
        const after = graph.branch(`reply-parent${index + 1}`, [parentMove])[0];
        const history = [...rootEngine.history, root.fen].slice(-8);
        const snapshot = await engine.search(after.fen, { history, nodes: rootEngine.source.budget.nodes, signal });
        validateSearch(snapshot, { fen: after.fen, history, engine: rootEngine.source.engine, nodes: rootEngine.source.budget.nodes, maxReplies });
        records.push({ parentMove, snapshot });
    }
    return { schema: 'pena-pcf-reply-searches/1', rootFen: root.fen, rootHistory: [...rootEngine.history],
        engine: structuredClone(rootEngine.source.engine), nodes: rootEngine.source.budget.nodes, maxReplies, records,
        boundary: 'Real separate searches on each conditional child. Q is child-side-to-move search value; alternatives are sampled, not forced or a calibrated confidence.' };
}

/** Revalidate recorded child searches before exposing their FEN-free PCF rows. */
export function pcfReplyFacts(input, evidence) {
    const { root, engine: rootEngine } = rootContext(input);
    if(evidence?.schema !== 'pena-pcf-reply-searches/1' || evidence.rootFen !== root.fen
        || !equal(evidence.rootHistory, rootEngine.history) || !equal(evidence.engine, rootEngine.source.engine)
        || evidence.nodes !== rootEngine.source.budget.nodes || !Number.isSafeInteger(evidence.maxReplies)
        || evidence.maxReplies < 1 || evidence.maxReplies > 3 || !Array.isArray(evidence.records) || evidence.records.length > 4
        || new Set(evidence.records.map(item => item.parentMove)).size !== evidence.records.length)
        throw new Error('PCF conditional reply evidence does not match the actual root.');
    const known = new Set([...rootEngine.references.filter(ref => ref.kind === 'lc0-line').map(ref => ref.data.moves[0]),
        ...input.lines.map(line => line.moves[0])]);
    const rows = [], references = [];
    for(const [index, record] of evidence.records.entries()) {
        if(!known.has(record.parentMove)) throw new Error('PCF reply search names an unrecorded parent candidate.');
        const graph = new PositionGraph(root.fen, rootEngine.history);
        const child = graph.branch(`reply-parent${index + 1}`, [record.parentMove])[0];
        const history = [...rootEngine.history, root.fen].slice(-8);
        const parsed = validateSearch(record.snapshot, { fen: child.fen, history, engine: evidence.engine, nodes: evidence.nodes, maxReplies: evidence.maxReplies });
        const parentFrame = input.frames.find(frame => frame.parentId === 'root' && frame.move?.uci === record.parentMove);
        if(!parentFrame) throw new Error('PCF reply search lacks its exact conditional parent frame.');
        for(const reply of parsed.replies) {
            const id = `RP${index + 1}.${reply.rank}`;
            const data = { parentMove: record.parentMove, ...reply, childTurn: parsed.turn, nodes: evidence.nodes,
                source: 'lc0', perspective: 'conditional-child-side-to-move', available: parsed.available, omitted: parsed.omitted };
            rows.push({ kind: 'REPLY', values: ['C', id, record.parentMove, reply.move, String(reply.rank), reply.preferred ? '1' : '0',
                parsed.turn, String(reply.visits), String(reply.policyPrior), reply.q === null ? '?' : String(reply.q),
                String(evidence.nodes), String(parsed.available), String(parsed.omitted), reply.line.join(',')] });
            references.push({ id, kind: 'pcf-reply-search', frameId: parentFrame.id, data,
                text: `Conditional LC0 child search after ${record.parentMove}: reply ${reply.move}, MultiPV rank ${reply.rank}, ${evidence.nodes} nodes. Q is from the child side to move; sampled alternatives are not forced.` });
        }
    }
    return { rows, references, searchedParents: evidence.records.length };
}
