import { coachingInput } from './coaching-input.js';
import { firstMoveStates, afterStateText } from './coaching-state.js';

/** Research-only successor. Does not change v3 or production model selection. */
export function coachingInputV4(args) {
    const { legacyEvidence = null, ...context } = args;
    const base = coachingInput({ ...context, history: context.history?.slice(-8) });
    if(legacyEvidence !== null && (legacyEvidence.fen !== args.fen || legacyEvidence.kind !== 'saved-v1-factsheet'
        || !/^[a-f0-9]{64}$/.test(legacyEvidence.sourcePromptSha256 || '')
        || typeof legacyEvidence.text !== 'string' || !legacyEvidence.text.trim()
        || /<\|(?:im_start|im_end|endoftext)\|>|<\/?think>/.test(legacyEvidence.text)))
        throw new Error('Legacy compatibility evidence needs the exact board, original prompt identity and plain saved factsheet.');
    const afterStates = firstMoveStates(base);
    const references = [...base.references, ...afterStates.map(state => {
        const frame = base.frames.find(frame => frame.id === state.frameId);
        return { id: `S.${state.lineId}`, kind: 'complete-first-move-state', frameId: state.frameId, data: state,
            text: `CONDITIONAL ${state.lineId} first move, not played. Complete occupied relations of ALL moved pieces: `
                + state.moved.map(piece => afterStateText(piece, frame)).join(' | ') };
    })];
    const legacyIds = new Set([...legacyEvidence?.text.matchAll(/^\[([^\]\n]+)\]/gm) || []].map(match => match[1]));
    const evidence = ['V4 relation dictionary: w/b=White/Black; P/N/B/R/Q/K=piece type; @=square. '
        + 'enemyTargets is outgoing geometric attack; attackers is incoming enemy attack; defenders is incoming friendly defense. '
        + 'S rows are COMPLETE for the listed moved pieces. NONE means empty, N/A means the piece is not on move. '
        + 'check describes the actual side to move in that labelled frame. Geometric targets do NOT establish legal or safe captures.',
    legacyEvidence ? base.evidence.split('\n').filter(line => !legacyIds.has(line.match(/^\[([^\]]+)\]/)?.[1])).join('\n') : base.evidence,
    ...(legacyEvidence ? ['SAVED V1 REFERENCE COMPATIBILITY: the following original annotations retain their recorded Stockfish/rules/context provenance. '
        + 'They are not fresh LC0 results. Their existing IDs refer to these saved definitions, not new searches. '
        + 'A source annotation is not a formal proof of a forced outcome. Source-to-current semantic/visual binding requires a separate audit.', legacyEvidence.text] : []),
    ...references.slice(base.references.length).map(ref => `[${ref.id}] ${ref.text}`)].join('\n');
    const messages = base.messages.map((message, index) => index === base.messages.length - 1
        ? { ...message, content: `Verified evidence:\n${evidence}\n\nPlayer question: ${args.question}` } : { ...message });
    messages.forEach(Object.freeze);
    return Object.freeze({ ...base, schema: 'pena-v2-coaching-input/4', evidence, messages: Object.freeze(messages),
        afterStates, references: Object.freeze(references.filter(ref => !legacyIds.has(ref.id)).map(Object.freeze)),
        legacyReferenceIds: Object.freeze([...legacyIds]),
        limitation: 'Research v4 after-state contract. Full v1 citation compatibility and complete-corpus readiness require separate verification.' });
}
