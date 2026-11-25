export const defaultCoachTone = 'warm, plain spoken and concise, with occasional understated dry wit; no filler or tacked-on verdict';

export function coachingMessages(packet, evidence, { arm, tone = 'warm, direct and conversational', contextual = false }) {
    if(!['hybrid', 'free'].includes(arm) || typeof tone !== 'string' || !tone.trim() || typeof contextual !== 'boolean') throw new Error('Invalid coaching expression arm or tone.');
    return [{ role: 'system', content: (contextual
        ? 'You are Pena, a chess coach. Answer the actual message. Greetings, acknowledgments and questions about yourself need no board advice or chess citation. Correct an incorrect piece or square premise before answering the useful part. '
        : 'You are Pena, a chess coach. Answer the actual question with one useful position-specific idea and relevant counterplay. ')
        + `Your tone is ${tone}. You may use personality, an apt analogy or a short question; no fixed wording is required. `
        + 'All board-specific claims must follow the supplied facts with their exact actors and frames. Do not mentally reconstruct or extend a line. '
        + 'Separate current facts, immediate effects and conditional replies. Do not pretend that a geometric attack is a legal capture, a sampled line is forced, or an observed effect proves why an engine prefers a move. '
        + 'If only part of the question is supported, retain the useful supported part and name the specific limitation. Do not recite search scores or internal IDs as explanations. '
        + (arm === 'hybrid'
            ? 'Return JSON with lead (one natural introductory sentence), factIds (two or three distinct IDs from the supplied facts), and closing (one natural concluding sentence). The chosen facts will be inserted verbatim between lead and closing. Lead and closing may be expressive but must not invent or contradict chess facts.'
            : (contextual ? 'Use as few natural sentences as the question needs, with enough explanation to answer it completely. ' : 'Write two to four natural sentences. ')
                + 'Explain rather than list facts. Cite only exact bracketed reference IDs defined in the supplied evidence, not guessed IDs; a citation does not license a stronger claim.') },
    { role: 'user', content: `Verified evidence:\n${evidence}\n\nPlayer question: ${packet.question}` }];
}

export function hybridSchema(packet) {
    return { type: 'object', properties: { lead: { type: 'string' }, factIds: { type: 'array', minItems: 2, maxItems: 3,
        items: { type: 'string', enum: packet.facts.map(fact => fact.id) } }, closing: { type: 'string' } },
    required: ['lead', 'factIds', 'closing'], additionalProperties: false };
}

export function renderHybrid(raw, packet) {
    const choice = JSON.parse(raw);
    if(!choice || Object.keys(choice).sort().join(',') !== 'closing,factIds,lead'
        || typeof choice.lead !== 'string' || !choice.lead.trim() || typeof choice.closing !== 'string' || !choice.closing.trim()
        || !Array.isArray(choice.factIds) || choice.factIds.length < 2 || choice.factIds.length > 3
        || new Set(choice.factIds).size !== choice.factIds.length || choice.factIds.some(id => !packet.facts.some(fact => fact.id === id)))
        throw new Error('Invalid hybrid prose/fact selection.');
    const facts = choice.factIds.map(id => packet.facts.find(fact => fact.id === id));
    if(facts.some(fact => typeof fact.scope !== 'string' || !fact.scope)) throw new Error('Hybrid fact is missing its conditional source scope.');
    return { text: [choice.lead, ...facts.map(fact => `${fact.scope} ${fact.text}`), choice.closing].join(' '),
        choice, caveat: 'Inserted facts are exact; unrestricted lead/closing and relevance still require semantic evaluation. This is not a certified safe renderer.' };
}
