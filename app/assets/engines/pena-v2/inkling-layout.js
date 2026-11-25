// Inkling message layout. The chat template places the "Thinking effort level"
// line before the first non-system message, so evidence sent as a system message
// sits ahead of it and stays in the prompt cache whatever effort is chosen.
// Only the question-bound lines and the question itself come after.
const evidenceStart = 'Verified evidence:';
const guidance = '\nC=now V=if H=past.';
const questionMarker = '\n\nPlayer question: ';
const binding = /^(?:CURRENT question-subject|Question subject)/;

export const inklingLayoutName = 'pena-inkling-layout/1';

export function inklingLayout(messages) {
    if(!Array.isArray(messages) || !messages.length) throw new Error('Expected chat messages.');
    const last = messages.at(-1);
    if(last.role !== 'user' || typeof last.content !== 'string' || !last.content.startsWith(evidenceStart))
        throw new Error('The final message is not a Pena evidence message.');
    const questionAt = last.content.lastIndexOf(questionMarker), guidanceAt = last.content.indexOf(guidance);
    if(guidanceAt < 0 || questionAt <= guidanceAt) throw new Error('Unexpected Pena evidence envelope.');
    const header = last.content.slice(0, guidanceAt).split('\n');
    const bound = [];
    while(header.length > 1 && binding.test(header.at(-1))) bound.unshift(header.pop());
    const evidence = header.join('\n') + last.content.slice(guidanceAt, questionAt);
    const question = [...bound, ''].join('\n') + last.content.slice(questionAt + 2);
    const leading = messages.findIndex(message => message.role !== 'system');
    const system = messages.slice(0, leading);
    if(messages.slice(leading, -1).some(message => message.role === 'system'))
        throw new Error('System messages must lead the conversation.');
    return [...system, { role: 'system', content: evidence }, ...messages.slice(leading, -1), { role: 'user', content: question }];
}

/** Exact inverse of inklingLayout, used to prove a converted row lost nothing. */
export function flatLayout(messages) {
    const evidenceAt = messages.findIndex(message => message.role === 'system' && message.content.startsWith(evidenceStart));
    const last = messages.at(-1);
    if(evidenceAt < 0 || last?.role !== 'user') throw new Error('Not an Inkling layout conversation.');
    const evidence = messages[evidenceAt].content, guidanceAt = evidence.indexOf(guidance);
    const questionAt = last.content.indexOf('Player question: ');
    if(guidanceAt < 0 || questionAt < 0) throw new Error('Not an Inkling layout conversation.');
    const bound = last.content.slice(0, questionAt);
    const content = evidence.slice(0, guidanceAt) + (bound ? '\n' + bound.slice(0, -1) : '')
        + evidence.slice(guidanceAt) + '\n\n' + last.content.slice(questionAt);
    return [...messages.slice(0, evidenceAt), ...messages.slice(evidenceAt + 1, -1), { ...last, content }];
}

/** Mirrors the GGUF chat template, for exact token budgets. */
export function inklingPrompt(messages, effort = 'high') {
    const roles = { user: '<|message_user|>', assistant: '<|message_model|>', system: '<|message_system|>' };
    const level = { none: '0', minimal: '0.1', low: '0.2', medium: '0.7', high: '0.9', xhigh: '0.99', max: '0.99' }[effort];
    if(!level) throw new Error(`Unknown Inkling effort: ${effort}`);
    const effortLine = `<|message_system|><|content_text|>Thinking effort level: ${level}<|end_message|>`;
    let text = '', emitted = false;
    for(const message of messages) {
        if(!roles[message.role] || typeof message.content !== 'string' || /<\|[a-z_]+\|>/.test(message.content))
            throw new Error('Inkling prompts need plain text system, user and assistant messages.');
        if(!emitted && message.role !== 'system') { text += effortLine; emitted = true; }
        text += `${roles[message.role]}<|content_text|>${message.content}<|end_message|>`
            + (message.role === 'assistant' ? '<|content_model_end_sampling|>' : '');
    }
    return emitted ? text : text + effortLine;
}

/** The question-independent prefix worth reading before the player asks. */
export function inklingPrewarmMessages(messages) {
    const leading = messages.findIndex(message => message.role !== 'system');
    return messages.slice(0, leading < 0 ? messages.length : leading);
}
