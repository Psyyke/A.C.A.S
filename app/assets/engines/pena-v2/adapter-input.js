import { PositionGraph } from './positions.js';
import { spatialFacts } from './spatial.js';
import { moveInsightFacts } from './insights.js';
import { coachingMessages } from './coaching-language.js';

const side = color => color === 'w' ? 'White' : 'Black';
const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const label = piece => `${side(piece.color)} ${names[piece.type]} on ${piece.square}`;
const freeze = value => {
    if(value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
};

/** Shared opt-in inference/training input. Saved source PVs are not new Lc0 searches. */
export function adapterInput({ fen, history = [], playerColor, question, continuations = [],
    tone = 'warm, plain spoken and concise, with occasional understated dry wit; no filler or tacked-on verdict',
    source = { kind: 'legal-analysis-only' }, referenceMode = false, conversation = [], includeLastMove = false, maxPlies = 3 }) {
    if(!['w', 'b'].includes(playerColor) || typeof question !== 'string' || !question.trim()
        || typeof referenceMode !== 'boolean' || typeof includeLastMove !== 'boolean'
        || !Number.isSafeInteger(maxPlies) || maxPlies < 1 || maxPlies > (referenceMode ? 6 : 3)
        || !Array.isArray(continuations) || continuations.length > (referenceMode ? 4 : 2) || typeof tone !== 'string' || !tone.trim()
        || !Array.isArray(conversation) || conversation.length > 4 || !referenceMode && (conversation.length || includeLastMove)
        || conversation.some(turn => typeof turn?.player !== 'string' || !turn.player.trim() || typeof turn.pena !== 'string' || !turn.pena.trim()
            || /<\|(?:im_start|im_end|endoftext)\|>|<\/?think>/.test(turn.player + turn.pena))
        || !['legal-analysis-only', 'saved-stockfish-analysis', 'qualified-lc0-analysis'].includes(source?.kind))
        throw new Error('Invalid adapter input context or evidence source.');
    if(source.kind === 'saved-stockfish-analysis' && (!Number.isSafeInteger(source.depth) || source.depth < 1))
        throw new Error('Saved Stockfish input needs its actual recorded depth.');
    if(source.kind === 'qualified-lc0-analysis' && (typeof source.searchId !== 'string' || !source.searchId))
        throw new Error('Qualified Lc0 input needs its independently checked search identity.');
    const graph = new PositionGraph(fen, history), frames = [graph.root], lines = [], facts = [];
    graph.root.spatial = spatialFacts(graph.root);
    const ids = new Set();
    let omittedEffects = 0;
    const paths = new Map();
    for(const [index, continuation] of continuations.entries()) {
        if(!(referenceMode ? /^[LA][1-9]\d*$/ : /^L[1-9]\d*$/).test(continuation?.id) || ids.has(continuation.id) || !Array.isArray(continuation.moves)
            || !continuation.moves.length || continuation.moves.length > maxPlies)
            throw new Error('Adapter continuations require unique source IDs within the explicit legal-ply budget.');
        ids.add(continuation.id);
        const key = continuation.moves.join(' '), existing = referenceMode && paths.get(key);
        const path = existing || graph.branch(`adapter${index + 1}`, continuation.moves, { maxPlies });
        paths.set(key, path);
        let before = graph.root;
        for(const frame of existing ? [] : path) {
            frame.spatial = spatialFacts(frame);
            const effects = moveInsightFacts(before, frame);
            const required = effects.filter(fact => ['action', 'check', 'capture', 'promotion', 'new-center-control'].includes(fact.kind)
                || ['new-attack', 'new-defend'].includes(fact.kind) && fact.data.source.id === frame.move.pieceId);
            const others = effects.filter(fact => !required.includes(fact)).sort((a, b) => b.priority - a.priority).slice(0, 2);
            const selected = [...required, ...others];
            omittedEffects += effects.length - selected.length;
            facts.push(...selected.map((fact, at) => ({ id: `${continuation.id}/${frame.id}/${at + 1}`, ...fact })));
            before = frame;
        }
        if(!existing) frames.push(...path);
        lines.push({ id: continuation.id, moves: [...continuation.moves], frameIds: path.map(frame => frame.id),
            scope: `Only this legally replayed ${path.length}-ply supplied continuation, not forced or proof of move quality.` });
    }
    const describe = frame => [
        `FRAME ${frame.id}; ${frame.id === 'root' ? 'CURRENT' : 'CONDITIONAL, not the live board'}; actual turn ${side(frame.spatial.turn)}; `
            + `in check ${frame.spatial.check}; checkmate ${frame.spatial.checkmate}.`,
        `Allowed pieces: ${frame.pieces.map(label).join('; ')}.`,
        ...(frame.id === 'root' ? [
            `Current material White minus Black: ${frame.spatial.material.whiteMinusBlack} ordinary piece points, not engine evaluation.`,
            ...frame.spatial.pieces.map(piece => {
                const list = ids => ids.map(id => label(frame.pieces.find(piece => piece.id === id))).join(', ') || 'none';
                return `${label(piece)}: geometric attackers ${list(piece.attackers)}; geometric defenders ${list(piece.defenders)}.`;
            }),
            ...frame.spatial.pins.filter(pin => pin.kind === 'pin').map(pin => {
                const at = id => frame.pieces.find(piece => piece.id === id);
                return `Current ${pin.pinType} pin geometry: ${label(at(pin.sliderId))} -> ${label(at(pin.frontId))} -> ${label(at(pin.backId))}.`;
            })
        ] : []),
        ...facts.filter(fact => fact.frameId === frame.id).map(fact => `[${fact.id}] ${fact.text}`)
    ].join('\n');
    let evidence = [`Player ${side(playerColor)}. Exact rules supply geometry; no mental board reconstruction is needed.`,
        source.kind === 'saved-stockfish-analysis' ? `Source continuations: SAVED Stockfish analysis at recorded depth ${source.depth}, NOT fresh Lc0 searches. Scores, strength labels and old heuristic notes are NOT imported.`
            : `Continuation provenance: ${source.kind}. Caller owns source authenticity; legal replay alone does not authenticate a search.`,
        'Geometric controls include pinned pieces; they do not establish safe captures. Current and conditional states are distinct.',
        ...lines.map(line => `[${line.id}] Supplied line: ${line.frameIds.map(id => {
            const frame = frames.find(frame => frame.id === id); return `${side(frame.move.color)} ${frame.move.san}`;
        }).join(', ')}. ${line.scope}`), ...frames.map(describe),
        `Other exact move effects omitted: ${omittedEffects}. Omission never establishes absence. Unlisted legacy citations are unavailable, not implicitly verified.`].join('\n');
    let references;
    if(referenceMode) {
        references = [];
        const add = (id, kind, frameId, text, data) => references.push({ id, kind, frameId, text, data });
        const current = graph.root.spatial, byId = id => graph.root.pieces.find(piece => piece.id === id);
        const show = list => list.map(id => byId(id).square).join(', ') || 'none';
        add('C.material', 'material', 'root', `Current material White minus Black: ${current.material.whiteMinusBlack} ordinary piece points, not engine evaluation.`, current.material);
        for(const piece of current.pieces) {
            const targets = current.pieces.filter(target => target.color !== piece.color && piece.controls.includes(target.square));
            add(`C.${piece.square}`, 'piece', 'root', `${label(piece)}: geometric attackers ${show(piece.attackers)}; defenders ${show(piece.defenders)}; attacks ${targets.map(piece => piece.square).join(', ') || 'none'}.`,
                { pieceId: piece.id, square: piece.square, attackers: piece.attackers, defenders: piece.defenders, targets: targets.map(piece => piece.id) });
        }
        for(const pawn of current.pawns) add(`C.pawn.${pawn.square}`, 'pawn', 'root', `${side(pawn.color)} pawn ${pawn.square}: passed ${pawn.passed}; isolated ${pawn.isolated}; doubled ${pawn.doubled}; promotion ${pawn.square[0]}${pawn.color === 'w' ? 8 : 1}, ${Math.abs(Number(pawn.square[1]) - (pawn.color === 'w' ? 8 : 1))} ranks.`, pawn);
        for(const [index, pin] of current.pins.filter(pin => pin.kind === 'pin').entries())
            add(`C.pin${index + 1}`, 'pin', 'root', `Current ${pin.pinType} pin geometry: ${label(byId(pin.sliderId))} -> ${label(byId(pin.frontId))} -> ${label(byId(pin.backId))}. `
                + (pin.frontLegalMoves === null ? 'Pinned-side legal mobility is unavailable on this actual turn.'
                    : `Actual-turn legal moves of that pinned piece: ${pin.frontLegalMoves.map(uci => current.legalMoves.find(move => move.uci === uci).san).join(', ') || 'none'}.`), pin);
        if(includeLastMove) {
            const before = graph.frames.get(`history-${history.length - 1}`);
            if(!before || !graph.root.move) throw new Error('An actual last-move reference requires its legal history transition.');
            before.spatial = spatialFacts(before);
            frames.unshift(before);
            add('M', 'last-move', 'root', `Actual last move: ${side(graph.root.move.color)} ${graph.root.move.san}, ${graph.root.move.from} to ${graph.root.move.to}, from HISTORICAL ${before.id} to CURRENT root. No move-quality grade or alternative is established.`,
                { beforeFrameId: before.id, move: graph.root.move });
            const effects = moveInsightFacts(before, { ...graph.root, parentId: before.id });
            facts.push(...effects.map((fact, index) => ({ id: `M/${index + 1}`, ...fact })));
        }
        for(const line of lines) add(line.id, 'line', line.frameIds[0], `Supplied line: ${line.frameIds.map(id => {
            const move = frames.find(frame => frame.id === id).move; return `${side(move.color)} ${move.san}`;
        }).join(', ')}. ${line.scope}`, { frameIds: line.frameIds, moves: line.moves });
        for(const fact of facts) add(fact.id, 'effect', fact.frameId,
            ['new-attack', 'new-defend'].includes(fact.kind)
                ? `${fact.frameId}: ${label(fact.data.source)} now geometrically ${fact.kind === 'new-attack' ? 'attacks' : 'defends'} ${label(fact.data.target)}.`
                : fact.text, fact);
        const ledger = frame => `FRAME ${frame.id}; ${frame.id === 'root' ? 'CURRENT' : frame.branch === 'history' ? 'HISTORICAL, not the live board' : 'CONDITIONAL, not the live board'}; actual turn ${side(frame.spatial.turn)}; in check ${frame.spatial.check}; checkmate ${frame.spatial.checkmate}; stalemate ${frame.spatial.stalemate}; legal move count ${frame.spatial.legalMoves.length}.\n`
            + `Allowed pieces: ${['w', 'b'].map(color => `${side(color)}: ${['k', 'q', 'r', 'b', 'n', 'p'].map(type => {
                const squares = frame.pieces.filter(piece => piece.color === color && piece.type === type).map(piece => piece.square);
                return squares.length ? `${names[type]} ${squares.join(', ')}` : null;
            }).filter(Boolean).join('; ')}`).join(' | ')}.`;
        evidence = [evidence.split('\n').slice(0, 3).join('\n'),
            'Square lists below refer to the explicit piece ledger, not inferred moves. Prior assistant messages are conversational context, not independent chess evidence; recheck their claims against the current evidence. Only defined bracketed IDs may be cited.',
            'Pawn promotion distances are ranks, not move counts or forced promotions. Geometric attacks/defenses never alone prove safe captures or material gains.',
            ...frames.map(ledger), ...references.map(ref => `[${ref.id}] ${ref.text}`),
            `Other exact continuation effects omitted: ${omittedEffects}. Omission never establishes absence. No evaluation, move-quality grade, forced outcome or legacy heuristic is supplied merely by citing a line.`].join('\n');
    }
    const base = coachingMessages({ question }, evidence, { arm: 'free', tone });
    const messages = [base[0], ...conversation.flatMap(turn => [{ role: 'user', content: turn.player }, { role: 'assistant', content: turn.pena }]), base[1]];
    return freeze({ schema: referenceMode ? 'pena-v2-adapter-input/2' : 'pena-v2-adapter-input/1', question, playerColor, frames, lines, facts,
        ...(referenceMode ? { references, conversation: structuredClone(conversation) } : {}),
        source: structuredClone(source), evidence, messages, omittedEffects,
        limitation: 'Input-fact correctness is not target-prose entailment or coaching quality. Targets need separate semantic/citation alignment; no automatic training approval.' });
}

export function qwenAdapterPrompt(messages) {
    if(!Array.isArray(messages) || messages.length < 2 || messages.length > 10 || messages.length % 2 !== 0 || messages[0]?.role !== 'system'
        || messages.some((message, index) => index && message?.role !== (index % 2 ? 'user' : 'assistant'))
        || messages.some(message => typeof message?.content !== 'string' || !message.content.trim() || /<\|(?:im_start|im_end|endoftext)\|>|<\/?think>/.test(message.content)))
        throw new Error('Adapter pilot requires alternating complete chat messages without injected chat delimiters.');
    return messages.map(message => `<|im_start|>${message.role}\n${message.content}<|im_end|>\n`).join('')
        + '<|im_start|>assistant\n<think>\n\n</think>\n\n';
}
