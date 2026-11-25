export const comparisonSystem = 'You are Pena, a clear, plain-spoken chess coach. Answer the actual question in one to three short sentences. '
    + 'Use the supplied board ledger and evidence, not guesses about piece placement. Explain the practical mechanism, not just a move or evaluation. '
    + 'Geometric attacks do not prove wins. Candidate lines are conditional, not forced predictions. '
    + 'If the evidence does not establish the requested idea, say what is uncertain rather than inventing a reason or declaring it illegal. '
    + 'Do not recite scores, visits, internal identifiers or unrelated variations. Cite factual evidence with [claim-N] where applicable. '
    + 'A direct general chess definition needs no fabricated board-specific claim.';

export function comparisonMessages(question, evidence, format = 'json') {
    if(!['json', 'dossier'].includes(format)) throw new Error('Unknown comparison evidence format.');
    const data = JSON.parse(evidence);
    // FEN remains in the saved replay packet, never in new spatial model inputs.
    const spatial = data.frames?.some(frame => frame.board);
    const { fen, frames, ...rest } = data;
    const modelEvidence = spatial ? JSON.stringify({ ...rest, frames: frames.map(({ fen, ...frame }) => frame) }) : evidence;
    return [{ role: 'system', content: comparisonSystem },
        { role: 'user', content: `Board evidence:\n${format === 'dossier' ? renderDossier(evidence) : modelEvidence}\n\nPlayer question: ${question}` }];
}

export function checkComparisonInputs(inputs) {
    if(!Array.isArray(inputs) || !inputs.length || new Set(inputs.map(item => item.id)).size !== inputs.length)
        throw new Error('Comparison inputs require distinct case IDs.');
    for(const item of inputs) {
        if(!item.question || !item.evidence || !Array.isArray(item.messages) || item.messages.length !== 2)
            throw new Error(`Incomplete comparison input: ${item.id}`);
        const packed = JSON.parse(item.evidence);
        if(packed.schema !== 'pena-v2-evidence/1' || packed.question !== item.question)
            throw new Error(`Comparison question/evidence mismatch: ${item.id}`);
        if(JSON.stringify(item.messages) !== JSON.stringify(comparisonMessages(item.question, item.evidence, item.format || 'json')))
            throw new Error(`Comparison prompt differs from its frozen evidence: ${item.id}`);
    }
}

export function assessComparisonAnswer(raw, evidence) {
    if(typeof raw !== 'string') throw new Error('Expected the actual model response text.');
    const packed = JSON.parse(evidence);
    const known = new Set(packed.claims.map(claim => claim.id));
    const references = [...raw.matchAll(/\[([^\]\n]+)\]/g)]
        .flatMap(match => match[1].match(/\b(?:claim|candidate)-\d+\b/g) || []);
    return { empty: !raw.trim(), unknownReferences: [...new Set(references.filter(id => !known.has(id)))],
        referencedClaims: [...new Set(references)], reasoningMarkup: /<\/?think>/.test(raw),
        caveat: 'Reference integrity only; existing references do not establish that the prose accurately describes them.' };
}

export function presentComparisonAnswer(raw) {
    // Archived responses can include the empty non-thinking prefill.
    return raw.replace(/^<think>\n\n<\/think>\n\n/, '');
}
import { renderDossier } from './dossier.js';

