import { adapterInput } from './adapter-input.js';
import { createFactContext, resolveFactSubject, resolveFactQuestion, compileFactAnswer } from './fact-answer.js';
import { coachingMessages, defaultCoachTone } from './coaching-language.js';
import { humanCandidates } from './human.js';

const side = color => color === 'w' ? 'White' : 'Black';
const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const label = piece => `${side(piece.color)} ${names[piece.type]} on ${piece.square}`;
const freeze = value => {
    if(value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
};

/** Opt-in expressive-coaching input; exact facts and bounded search estimates keep distinct provenance. */
export function coachingInput({ evaluations = [], maia = null, maxPlies = 4, ...args }) {
    const base = adapterInput({ ...args, referenceMode: true, maxPlies });
    const preferred = base.source.preferredLineId;
    if(preferred !== undefined && (base.source.kind === 'legal-analysis-only' || typeof preferred !== 'string'
        || !base.lines.some(line => line.id === preferred))) throw new Error('Recorded search preference must name a supplied searched line.');
    const root = base.frames.find(frame => frame.id === 'root'), refs = [], query = [];
    const at = (frame, id) => {
        const piece = frame.pieces.find(piece => piece.id === id);
        if(!piece) throw new Error('Coaching reference names an absent frame entity.');
        return piece;
    };
    const add = (id, kind, frameId, text, data) => {
        if(refs.some(ref => ref.id === id)) throw new Error('Duplicate coaching reference.');
        refs.push({ id, kind, frameId, text, data });
    };
    const context = createFactContext({ gameId: 'coaching-input', revision: 0, fen: args.fen,
        history: args.history || [], playerColor: args.playerColor });
    const question = args.question.replace(/\b[LA][1-9]\d*\b/g, id => base.lines.some(line => line.id === id) ? '' : id);
    const subject = resolveFactSubject(context, question);
    const resolved = resolveFactQuestion(context, question);
    const cards = [];
    if(subject.subject) {
        const location = compileFactAnswer(context, { intent: 'locate', subject: subject.subject });
        cards.push(...location.cards);
        query.push(`CURRENT question-subject match: ${location.status}.`);
        if(location.status === 'absent' && subject.subject.square) {
            const occupant = root.pieces.find(piece => piece.square === subject.subject.square);
            if(occupant) cards.push(...compileFactAnswer(context, { intent: 'defense', subject: { id: occupant.id } }).cards);
        } else if(location.status === 'answerable') {
            const intent = resolved.intent === 'unavailable' ? /\b(pin|pinned)\b/i.test(args.question) ? 'pins' : 'defense' : resolved.intent;
            if(intent !== 'locate' && resolved.intent !== 'compare-frames')
                cards.push(...compileFactAnswer(context, { intent: ['mobility', 'pins', 'controls', 'defense', 'blockers'].includes(intent) ? intent : 'defense',
                    subject: subject.subject, ...(intent === 'blockers' && resolved.direction ? { direction: resolved.direction } : {}) }).cards);
        }
    } else query.push(`Question subject not uniquely bound by the supported parser (${subject.reason}); do not substitute another piece.`);
    if(!subject.subject && ['material', 'status', 'king-geometry', 'move-effects'].includes(resolved.intent))
        cards.push(...compileFactAnswer(context, resolved).cards);
    for(const card of cards) add(`Q${refs.filter(ref => ref.kind === 'question-fact').length + 1}`, 'question-fact', card.frameId,
        `CURRENT: ${card.segments.map(segment => segment.text).join(' ')}`, card);
    const currentScope = /\b(current|live|actual)\s+board\b/i.test(args.question);
    query.push(currentScope ? 'Question explicitly mentions the live/current board: conditional moves have NOT been played there.'
        : 'CURRENT and CONDITIONAL facts are labelled separately; a supplied continuation does not update the live board.');
    const spatial = root.spatial;
    add('C.status', 'status', 'root', `CURRENT: ${side(spatial.turn)} to move; in check ${spatial.check}; checkmate ${spatial.checkmate}; stalemate ${spatial.stalemate}.`
        + (spatial.check ? ` Complete legal replies: ${spatial.legalMoves.map(move => move.san).join(', ') || 'none'}.` : ''),
    { turn: spatial.turn, check: spatial.check, checkmate: spatial.checkmate, stalemate: spatial.stalemate, legalMoves: spatial.legalMoves });
    const effectIds = new Map();
    const effectFrames = new Set();
    for(const ref of base.references) {
        if(ref.kind === 'piece') {
            const piece = at(root, ref.data.pieceId), list = ids => ids.map(id => label(at(root, id))).join(', ') || 'none';
            add(ref.id, ref.kind, ref.frameId, `CURRENT ${label(piece)}; attacked by ${list(ref.data.attackers)}; defended by ${list(ref.data.defenders)}; attacks ${list(ref.data.targets)}.`, ref.data);
        } else if(ref.kind === 'line') {
            const line = base.lines.find(line => line.id === ref.id), leaf = base.frames.find(frame => frame.id === line.frameIds.at(-1));
            const path = line.frameIds.map(id => { const move = base.frames.find(frame => frame.id === id).move; return `${side(move.color)} ${move.san}`; });
            add(ref.id, ref.kind, ref.frameId, `CONDITIONAL ${ref.id}: ${path.join(', ')}.`
                + (ref.id === preferred ? ` Recorded ${side(spatial.turn)} search preference at the supplied budget.` : '')
                + ` Leaf: ${side(leaf.spatial.turn)} to move; check ${leaf.spatial.check}; mate ${leaf.spatial.checkmate}; stalemate ${leaf.spatial.stalemate}; material White-minus-Black ${leaf.spatial.material.whiteMinusBlack} piece points. Not a forced line or proof of unique optimality.`, ref.data);
        } else if(ref.kind === 'effect') {
            if(effectFrames.has(ref.frameId)) continue;
            effectFrames.add(ref.frameId);
            const line = base.lines.find(line => line.frameIds.includes(ref.frameId));
            const id = line ? `${line.id}.p${line.frameIds.indexOf(ref.frameId) + 1}` : 'M.effects';
            const facts = base.references.filter(item => item.kind === 'effect' && item.frameId === ref.frameId);
            const frame = base.frames.find(frame => frame.id === ref.frameId), descriptions = [];
            const relations = new Map();
            for(const fact of facts) {
                effectIds.set(fact.id, id);
                const data = fact.data.data;
                if(['new-attack', 'new-defend'].includes(fact.data.kind)) {
                    const key = `${fact.data.kind}/${data.source.id}`;
                    if(!relations.has(key)) relations.set(key, { kind: fact.data.kind, source: data.source, targets: [] });
                    relations.get(key).targets.push(data.target);
                } else if(fact.data.kind === 'action') descriptions.push(`${side(data.move.color)} ${names[at(base.frames.find(item => item.id === fact.data.beforeFrameId), data.move.pieceId).type]} ${data.move.from} to ${data.move.to} (${data.move.san})`);
                else if(fact.data.kind === 'capture') descriptions.push(`captures ${label(data.captured)}`);
                else if(fact.data.kind === 'check') descriptions.push(`${side(frame.spatial.turn)} ${data.checkmate ? 'checkmated' : 'in check'}`);
                else if(fact.data.kind === 'promotion') descriptions.push(`promotes to ${names[data.type]}`);
                else if(fact.data.kind === 'new-center-control') descriptions.push(`${label(data.piece)} newly controls ${data.squares.join(', ')}`);
                else if(fact.data.kind === 'lost-attack') descriptions.push(`${label(data.source)} no longer attacks ${label(data.target)}`);
                else if(fact.data.kind === 'extended-ray') descriptions.push(`${label(data.slider)} ray extends through ${data.gainedSquares.join(', ')} after ${label(data.formerBlocker)} moves`);
                else if(['created-pin', 'removed-pin'].includes(fact.data.kind)) {
                    const source = fact.data.kind === 'created-pin' ? frame : base.frames.find(frame => frame.id === fact.data.beforeFrameId);
                    descriptions.push(`${fact.data.kind === 'created-pin' ? 'creates' : 'removes'} ${data.pin.pinType} pin: ${label(at(source, data.pin.sliderId))} through ${label(at(source, data.pin.frontId))} to ${label(at(source, data.pin.backId))}`);
                } else throw new Error(`Unsupported compact coaching effect: ${fact.data.kind}`);
            }
            descriptions.push(...[...relations.values()].map(relation => `${label(relation.source)} newly ${relation.kind === 'new-attack' ? 'attacks' : 'defends'} ${relation.targets.map(label).join(', ')}`));
            add(id, 'effects', ref.frameId, `${line ? `CONDITIONAL ${line.id}, ply ${line.frameIds.indexOf(ref.frameId) + 1}` : 'ACTUAL LAST MOVE'}: ${descriptions.join('; ')}.`, facts.map(fact => fact.data));
        } else add(ref.id, ref.kind, ref.frameId, ref.text, ref.data);
    }
    if(subject.subject) {
        const current = root.pieces.filter(piece => (!subject.subject.id || piece.id === subject.subject.id)
            && (!subject.subject.square || piece.square === subject.subject.square) && (!subject.subject.type || piece.type === subject.subject.type)
            && (!subject.subject.color || piece.color === subject.subject.color));
        if(current.length === 1) for(const line of base.lines) {
            const leaf = base.frames.find(frame => frame.id === line.frameIds.at(-1)), piece = leaf.pieces.find(piece => piece.id === current[0].id);
            add(`Q.${line.id}`, 'tracked-subject', leaf.id, `CURRENT ${label(current[0])}. CONDITIONAL ${line.id} leaf: ${piece ? label(piece) : 'that piece has been captured'}. The live board is unchanged.`,
                { currentPiece: current[0], conditionalPiece: piece || null, lineId: line.id });
        }
    }
    if(!Array.isArray(evaluations) || evaluations.length > base.lines.length || new Set(evaluations.map(item => item?.lineId)).size !== evaluations.length)
        throw new Error('Coaching evaluations require distinct supplied line IDs.');
    for(const evaluation of evaluations) {
        if(base.source.kind === 'legal-analysis-only' || !base.lines.some(line => line.id === evaluation?.lineId)
            || evaluation.perspective !== 'root-side-to-move') throw new Error('A coaching evaluation needs an authenticated source, supplied line and explicit root perspective.');
        const { score, search } = evaluation;
        if(Boolean(score) === Boolean(search)) throw new Error('Supply exactly one engine score representation.');
        let description;
        if(score) {
            if(!['cp', 'mate'].includes(score.kind) || !Number.isSafeInteger(score.value) || score.kind === 'mate' && score.value === 0)
                throw new Error('Invalid bounded engine cp/mate estimate.');
            const sign = spatial.turn === 'w' ? 1 : -1, white = sign * score.value, player = args.playerColor === 'w' ? white : -white;
            description = score.kind === 'cp' ? `centipawns from White ${white}, from player ${player}`
                : `mate-distance estimate ${score.value} from ${side(spatial.turn)}; ${score.value > 0 ? side(spatial.turn) : side(spatial.turn === 'w' ? 'b' : 'w')} is the predicted mating side. This is a searched mate estimate, not a complete proof tree`;
        } else {
            if(base.source.kind !== 'qualified-lc0-analysis' || !Number.isFinite(search.q) || Math.abs(search.q) > 1 || !Number.isFinite(search.draw) || search.draw < 0 || search.draw > 1
                || Math.abs(search.q) + search.draw > 1.001 || !Number.isSafeInteger(search.visits) || search.visits < 1)
                throw new Error('Lc0 estimates require a visited candidate and valid root-side Q/draw values.');
            description = `root-side Q ${search.q}, draw ${search.draw}, visits ${search.visits}; not calibrated confidence or human move likelihood`;
        }
        add(`E.${evaluation.lineId}`, 'evaluation', 'root', `${base.source.kind}, ${evaluation.lineId}: ${description}. Bounded engine estimate, not material or a statement of the engine's internal reason.`, evaluation);
    }
    let human = [];
    if(maia !== null) {
        if(!/^[a-f0-9]{64}$/.test(maia?.modelSha256 || '')) throw new Error('Maia evidence needs its exact model hash.');
        human = humanCandidates(maia.result, args.fen, { eloSelf: maia.eloSelf, eloOpponent: maia.eloOpponent, limit: 2 });
        for(const [index, candidate] of human.entries()) {
            const move = spatial.legalMoves.find(move => move.uci === candidate.move);
            add(`H${index + 1}`, 'human-choice', 'root', `Maia-3 estimates ${side(spatial.turn)} human choice ${move.san} at self/opponent Elo ${candidate.eloSelf}/${candidate.eloOpponent}: ${(candidate.probability * 100).toFixed(1)}%. NOT move quality, winning probability or a claim about this particular player's intention.`,
                { ...candidate, modelSha256: maia.modelSha256 });
        }
    }
    const ledger = ['w', 'b'].map(color => `${side(color)}: ${['k', 'q', 'r', 'b', 'n', 'p'].map(type => {
        const squares = root.pieces.filter(piece => piece.color === color && piece.type === type).map(piece => piece.square);
        return squares.length ? `${names[type]} ${squares.join(', ')}` : null;
    }).filter(Boolean).join('; ')}`).join(' | ');
    const evidence = [`Player ${side(args.playerColor)}. Complete CURRENT piece ledger: ${ledger}.`,
        `Continuation source: ${base.source.kind}${base.source.depth ? `, recorded depth ${base.source.depth}` : ''}${base.source.searchId ? `, search ${base.source.searchId}` : ''}. Saved analysis is not a fresh Lc0 search.`,
        ...query, 'Rules facts are exact for their labelled board. Geometric attacks/defenses include pinned pieces and do not establish safe captures. Engine estimates and human-choice probabilities have separate meanings. Previous assistant messages are not chess evidence.',
        ...refs.map(ref => `[${ref.id}] ${ref.text}`),
        `Other exact effects omitted: ${base.omittedEffects}. Omitted is not false. Unknown evaluations, unsearched alternatives and longer continuations remain unknown. Cite only defined IDs, with their actual actor, relation and frame.`].join('\n');
    const tone = args.tone || defaultCoachTone;
    const messages = coachingMessages({ question: args.question }, evidence, { arm: 'free', tone, contextual: true });
    messages.splice(1, 0, ...(args.conversation || []).flatMap(turn => [{ role: 'user', content: turn.player }, { role: 'assistant', content: turn.pena }]));
    return freeze({ ...base, schema: 'pena-v2-coaching-input/3', maxPlies, evidence, messages, references: refs,
        facts: base.facts.map(fact => ({ ...fact, referenceId: effectIds.get(fact.id) })), evaluations: structuredClone(evaluations), human,
        query: { subject: structuredClone(subject), resolved: structuredClone(resolved), explicitlyCurrent: currentScope },
        limitation: 'Exact question facts and legal consequences are not arbitrary-prose verification. Search estimates are not forced proofs; targets require separate alignment approval.' });
}
