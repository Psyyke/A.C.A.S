import { LocalAI } from './local-ai.js';
import { englishCoachingInput, pcfCoachingInput } from './pcf-input.js';
import { inklingPrompt } from './inkling-layout.js';
import { applyPromptOverrides, defaultPenaPrompt, hasPromptOverrides, penaChatVoice, penaVoice, personaPrompt } from './prompt-overrides.js';
import { boardGroundingNotes, coachingPolicy, hypotheticalKnightNotes } from './coaching-policy.js';
import { penaDefaults } from './preferences.js';
import { planEffort, escalation, ThoughtSplitter, SentenceChunker, CoachNotes, acknowledgement,
    ESCALATION_NOTE, STILL_READING, STILL_READING_AFTER_MS } from './inkling-effort.js';
import { cleanCoachAnswer, cleanEvidenceTalk, liveThinking, stripRefs } from './thought-injection.js';
import { createVerdictEngine } from './verdict-engine.js';

// The worker prepares chess evidence. Only the native local server runs the model.
let CONTEXT = 8192;
const QUIET_HELLO_MS = 1500;
let runtime = null;
let active = null;
let requestRevision = 0;
let queue = Promise.resolve();
let loadedLora = null;
let serverModel = null;
let inkling = false;
let options = { thinkingTokens: 1536, effort: 'auto' };
// Characters per Inkling token for PCF prompts. Starts below the measured 1.62
// minimum so the first prompt fits, then follows the runtime's real counts.
let charsPerToken = 1.55;
// Live thought evidence needs the server's raw completion action. Older servers turn it off for the session.
let liveSupported = true;
let verdictEngine = null;

const thinkingTokensOf = value => Number.isSafeInteger(value) && value >= 64 && value <= 4096 ? value : options.thinkingTokens;
const temperatureOf = value => Number.isFinite(value) && value >= 0 && value <= 1.5 ? value : penaDefaults.penaTemperature;
const markup = /<\|[a-z_]+\|>|<\/?(?:think|analysis)>/i;
const cleanAnswerPunctuation = text => cleanEvidenceTalk(text).replace(/\s*—\s*/g, ', ')
    .replace(/(^|[.!?])\s*,\s*/g, '$1 ')
    .replace(/,\s*([.!?;:]|$)/g, '$1')
    .replace(/ {2,}/g, ' ').trim();

self.onmessage = ({ data }) => {
    if(data?.type === 'initialize') void initialize(data);
    else if(data?.type === 'converse') {
        cancelActive();
        const revision = requestRevision;
        queue = queue.then(() => {
            if(revision === requestRevision) return converse(data);
        }).catch(error => self.postMessage({ type: 'pena', mode: 'grounded', chatId: data.chatId,
            phase: 'failed', message: error?.message || String(error) }));
    } else if(data?.type === 'cancel') cancelActive();
    else if(data?.type === 'setup' || data?.type === 'cancelSetup') {
        // Status updates arrive through onStatus, so only failures need reporting here.
        runtime?.request(data.type).catch(error =>
            self.postMessage({ type: 'connection', state: 'offline', connected: runtime?.socket?.readyState === 1, setup: { error: error.message } }));
    }
};

function cancelActive() {
    requestRevision++;
    active?.controller.abort();
    active = null;
}

async function initialize(data) {
    options = { thinkingTokens: thinkingTokensOf(data.thinkingTokens), effort: data.effort || 'auto' };
    runtime?.close();
    runtime = new LocalAI({ port: data.port,
        onVersion: version => self.postMessage({ type: 'serverVersion', version }),
        onStatus: status => {
        if(status.state !== 'ready') {
            cancelActive();
            serverModel = null;
            self.postMessage({ ...status, type: 'connection' });
            return;
        }
        const identity = JSON.stringify([status.model, status.lora, status.context, status.capabilities]);
        if(identity === serverModel) return;
        cancelActive();
        serverModel = identity;
        CONTEXT = Number.isSafeInteger(status.context) && status.context >= 512 ? status.context : 8192;
        loadedLora = status.lora || null;
        inkling = status.capabilities?.inkling === true || /inkling/i.test(status.model || '');
        charsPerToken = 1.55;
        self.postMessage({ type: 'ready', canChat: true, model: status.model, lora: loadedLora, context: CONTEXT });
    } });
    runtime.connect();
}

// Every model reads the board as plain English, questions about earlier moves included. Only the optional LoRA
// was trained on PCF, so it alone keeps PCF.
const usesEnglishBoard = () => !loadedLora;

// Light evidence shrinks the budget, but never below what the current board itself needs.
function buildInput(message, maxPromptTokens) {
    if(usesEnglishBoard(message)) return englishCoachingInput(message.input, { history: message.history || [], playerColor: message.playerColor, inkling });
    const { share = 1, ...include } = message.evidence || {};
    const build = limit => pcfCoachingInput(message.input, { history: message.history || [], playerColor: message.playerColor, inkling, plain: true,
        serializePrompt: messages => promptText(messages),
        include, tokenCount: text => Math.ceil(text.length / charsPerToken), maxPromptTokens: limit });
    if(!(share > 0 && share < 1)) return build(maxPromptTokens);
    try { return build(Math.floor(maxPromptTokens * share)); }
    catch(error) { if(/Mandatory PCF/.test(error.message)) return build(maxPromptTokens); throw error; }
}

// Custom prompts change the prompt length, so the evidence budget shrinks by any extra they add.
function prepareInput(message, maxPromptTokens) {
    const overrides = message.prompt || {};
    const root = message.input.frames.find(frame => frame.id === 'root');
    const reminder = usesEnglishBoard(message) ? hypotheticalKnightNotes(root.fen, message.input.question)
        : boardGroundingNotes(root.fen, message.input.question);
    let input = buildInput(message, maxPromptTokens);
    const custom = hasPromptOverrides(overrides);
    const restyle = messages => {
        const styled = custom ? applyPromptOverrides(messages, overrides)
            : messages.map((item, index) => index === 0 && item.role === 'system'
                ? { ...item, content: `${item.content} ${penaVoice}` } : item);
        return styled.map((item, index) => index === 0 && item.role === 'system'
            ? { ...item, content: `${item.content} ${coachingPolicy}${message.moveRequested && !message.hideMoves
                ? ' The player explicitly asked for a move. Give the move and a short explanation, rather than offering to reveal it.'
                : message.hideMoves ? ' Do not name or describe specific suggested moves or lines unless the player explicitly asks for one.' : ''}` }
            : index === styled.length - 1 && reminder ? { ...item, content: `${reminder}\n\n${item.content}` } : item);
    };
    const apply = built => ({ ...built, messages: restyle(built.messages) });
    let styled = apply(input);
    const extra = Math.ceil((promptText(styled.messages).length - promptText(input.messages).length) / charsPerToken);
    if(extra > 0) styled = apply(buildInput(message, maxPromptTokens - extra));
    return styled;
}

// 1.55 chars per token is a cautious first guess. A crowded board can look too big for it, so the real count decides.
async function boardInput(message, maxPromptTokens, effort, signal) {
    try { return prepareInput(message, maxPromptTokens); }
    catch(error) {
        if(!/Mandatory PCF/.test(error.message)) throw error;
        let probe;
        try { probe = prepareInput(message, maxPromptTokens * 2); } catch { throw error; }
        const measured = await runtime.promptInfo(templateMessages(probe.messages), { enable_thinking: effort !== 'none' }, signal, effort);
        const ratio = 0.97 * promptText(probe.messages).length / measured.tokens;
        if(!(Number.isSafeInteger(measured.tokens) && measured.tokens > 0 && ratio > charsPerToken)) throw error;
        charsPerToken = ratio;
        return prepareInput(message, maxPromptTokens);
    }
}

function promptText(messages, effort = 'high') {
    return inkling ? inklingPrompt(messages, effort) : JSON.stringify(messages);
}

// Most GGUF templates accept one leading system message, not several.
function templateMessages(messages) {
    if(inkling) return messages;
    const leading = messages.findIndex(message => message.role !== 'system');
    const end = leading < 0 ? messages.length : leading;
    if(end < 2) return messages;
    return [{ role: 'system', content: messages.slice(0, end).map(message => message.content).join('\n\n') }, ...messages.slice(end)];
}

// With no board open there is no evidence, only the system prompt and the recent chat.
function plainInput(message) {
    const overrides = message.prompt || {};
    const custom = hasPromptOverrides(overrides);
    if(custom && /<\|[a-z_]+\|>/i.test(overrides.systemPrompt)) throw new Error('Custom Pena prompts cannot contain <|...|> chat markup.');
    const turns = (message.conversation || []).slice(-6).flatMap(({ player, pena }) =>
        [{ role: 'user', content: String(player) }, { role: 'assistant', content: String(pena) }]);
    const question = { role: 'user', content: String(message.input?.question || '') };
    // Plain mode uses the displayed System prompt without any coaching additions.
    if(message.raw) {
        const system = overrides.systemPrompt?.trim() || defaultPenaPrompt;
        return { messages: [{ role: 'system', content: system }, ...turns, question],
            references: [], legacyReferenceIds: [], schema: 'pena-plain-chat/1', pcf: { promptTokens: null } };
    }
    const system = custom ? personaPrompt(overrides.systemPrompt, { plain: true })
        : `${message.board ? 'A game is open, but this is small talk. Keep it short and leave the position alone.'
            : 'No board is open. Chat about chess and A.C.A.S without inventing a position or engine numbers.'} ${penaChatVoice}`;
    const notes = String(message.notes || '').trim() ? [{ role: 'system', content: `${String(message.notes).trim()}\nAnswer questions about A.C.A.S from these notes and the player's words only. If they don't cover it, say you're not sure and point to the usage guide. No board is open, so you can't see the player's engine or profile settings, only your own. Never use square brackets.` }] : [];
    return { messages: [{ role: 'system', content: system }, ...notes, ...turns, question],
        references: [], legacyReferenceIds: [], schema: 'pena-plain-chat/1', pcf: { promptTokens: null } };
}

async function converse(message) {
    const controller = new AbortController();
    const { chatId } = message;
    active = { chatId, controller };
    const live = () => active?.controller === controller && !controller.signal.aborted;
    const post = data => { if(live()) self.postMessage({ type: 'pena', mode: 'grounded', chatId, ...data }); };
    const timers = [];
    try {
        if(!runtime || !serverModel) throw new Error('Start a model in the A.C.A.S local server first.');
        const automatic = Boolean(message.automatic);
        const thinkingTokens = thinkingTokensOf(message.thinkingTokens);
        // Chat without a board can run longer than a coaching answer, so it gets more room after thinking.
        const generated = Math.min(4096, Math.floor(CONTEXT / 2), thinkingTokens + (message.plain ? 768 : 256));
        const limits = { maxTokens: generated, context: CONTEXT, budget: thinkingTokens, hasEvidence: !message.plain };
        const maxPromptTokens = CONTEXT - generated - 1;
        const question = String(message.input?.question || '');
        let plan = planEffort(question, automatic ? 'none' : message.effort || options.effort, limits);
        if(message.raw && (message.effort || options.effort) === 'auto')
            plan = planEffort(question, 'low', limits);
        // Coaching small talk thinks lightly, and greetings not at all.
        if(message.plain && !message.raw && !automatic) {
            const auto = planEffort(question, 'auto', limits).effort;
            if(auto === 'none') plan = planEffort(question, 'none', limits);
            else if((message.effort || options.effort) === 'auto' && plan.effort !== 'low') plan = planEffort(question, 'low', limits);
        }
        const state = { firstToken: false };
        if(!automatic) {
            const hello = acknowledgement(question, plan.effort);
            if(hello) post({ phase: 'hello', text: hello });
            else timers.push(setTimeout(() => { if(!state.firstToken) post({ phase: 'hello', text: acknowledgement(question, 'medium') }); }, QUIET_HELLO_MS));
            timers.push(setTimeout(() => { if(!state.firstToken) post({ phase: 'hello', text: message.plain ? 'Still thinking, nearly there.' : STILL_READING }); }, STILL_READING_AFTER_MS));
        }
        let input = message.plain ? plainInput(message) : await boardInput(message, maxPromptTokens, plan.effort, controller.signal);
        let result, measuredTokens = null;
        // Plain chat and the English board are ordinary text, so they must not recalibrate the PCF token ratio.
        const english = !message.plain && input.schema === 'pena-v2-english-coaching-input/1';
        const calibrate = !message.plain && !english;
        for(let attempt = 0; ; attempt++) {
            const measured = await runtime.promptInfo(templateMessages(input.messages),
                { enable_thinking: plan.effort !== 'none' }, controller.signal, plan.effort);
            if(!Number.isSafeInteger(measured.tokens) || measured.tokens < 1)
                throw new Error('The local model returned an invalid prompt token count.');
            measuredTokens = measured.tokens;
            if(measured.tokens > maxPromptTokens) {
                // The English board has nothing optional to drop, so a smaller rebuild cannot help.
                if(attempt >= 2 || english) throw new Error('Pena could not fit the position evidence into the context window.');
                if(calibrate) {
                    charsPerToken = Math.min(charsPerToken, 0.95 * promptText(input.messages).length / measured.tokens);
                    input = prepareInput(message, maxPromptTokens);
                } else {
                    input = plainInput({ ...message, conversation: attempt ? [] : (message.conversation || []).slice(-2) });
                }
                continue;
            }
            post({ phase: 'prefill', processed: 0, total: measuredTokens });
            result = await respond(message, input, plan, { post, controller, state, maxPromptTokens, measuredTokens, calibrate, temperature: temperatureOf(message.temperature) });
            if(!result.overflow) break;
            // The estimate undercounted. charsPerToken is now calibrated, so rebuild once smaller.
            if(attempt >= 2 || english) throw new Error('Pena could not fit the position evidence into the context window.');
            input = message.plain ? plainInput({ ...message, conversation: (message.conversation || []).slice(attempt ? -1 : -3) })
                : prepareInput(message, maxPromptTokens);
        }
        const retry = !automatic && !message.raw && escalation(plan, result, limits);
        if(retry) {
            plan = { ...plan, ...retry };
            post({ phase: 'escalating', text: ESCALATION_NOTE, effort: plan.effort });
            const first = result;
            result = await respond(message, input, plan, { post, controller, state, maxPromptTokens, measuredTokens, calibrate, temperature: temperatureOf(message.temperature) });
            if(result.overflow) throw new Error('Pena could not fit the position evidence into the context window.');
            result.tokens += first.tokens;
        }
        if(result.cancelled) return;
        post({ phase: 'complete', raw: result.answer, tokens: result.tokens, promptTokens: result.promptTokens ?? measuredTokens,
            finishReason: result.finishReason, inputSchema: input.schema, effort: plan.effort, escalated: Boolean(plan.escalated),
            definedIds: [...input.references.map(ref => ref.id), ...input.legacyReferenceIds] });
    } catch(error) {
        if(controller.signal.aborted || error?.name === 'AbortError') return;
        post({ phase: 'failed', message: error?.message || String(error) });
    } finally {
        timers.forEach(clearTimeout);
        if(active?.controller === controller) active = null;
    }
}

// Inkling on the English board thinks with live evidence: rule-checked facts and engine reasons
// about the moves it imagines are added to its thinking as it goes. Anything else streams as before.
async function respond(message, input, plan, context) {
    const live = liveSupported && inkling && plan.effort !== 'none' && message.liveEvidence !== false
        && input.schema === 'pena-v2-english-coaching-input/1' && typeof runtime.createCompletion === 'function';
    if(!live) return generate(input, plan, { ...context, raw: Boolean(message.raw) });
    try { return await liveGenerate(message, input, plan, context); }
    catch(error) {
        if(context.controller.signal.aborted || context.state.firstToken
            || !/Unknown AI action|Unsupported completion option|returned no prompt/i.test(String(error?.message || error))) throw error;
        liveSupported = false;
        return generate(input, plan, context);
    }
}

async function liveGenerate(message, input, plan, { post, controller, state, measuredTokens, temperature = 0 }) {
    const signal = controller.signal;
    const messages = templateMessages(input.messages).map(({ role, content }) => ({ role, content }));
    const template = await runtime.promptInfo(messages, { enable_thinking: true }, signal, plan.effort, { includePrompt: true });
    if(typeof template?.prompt !== 'string' || !template.prompt) throw new Error('The local server returned no prompt for live evidence.');
    verdictEngine ??= createVerdictEngine();
    const root = message.input.frames.find(frame => frame.id === 'root');
    const visible = new SentenceChunker(), answerSentences = new SentenceChunker(), notes = new CoachNotes();
    let answerText = '', streaming = true;
    const thought = text => {
        post({ phase: 'thought', text });
        for(const sentence of visible.push(text)) {
            const note = notes.push(sentence);
            if(note) post({ phase: 'note', text: note });
        }
    };
    const sentences = (final = false) => {
        for(const sentence of answerSentences.push(answerText, final)) {
            if(!streaming) break;
            if(markup.test(sentence) || /\[[^\]\n]+\]/.test(stripRefs(sentence))) { streaming = false; break; }
            const clean = cleanAnswerPunctuation(cleanCoachAnswer(sentence));
            if(clean) post({ phase: 'sentence', text: clean });
        }
        answerText = '';
    };
    const result = await liveThinking({
        complete: options => runtime.createCompletion({ ...options, cache_prompt: true, return_tokens: true }),
        prompt: template.prompt, rootFen: root.fen, question: String(message.input?.question || ''),
        history: message.history || [], promptText: messages.map(item => item.content).join('\n'),
        engine: verdictEngine, thinkBudget: plan.reasoningBudget,
        answerBudget: Math.max(256, plan.maxTokens - plan.reasoningBudget), room: CONTEXT - measuredTokens - 8,
        temperature, seed: temperature > 0 ? Math.floor(Math.random() * 2147480000) : 42,
        nameMoves: !message.hideMoves || Boolean(message.moveRequested), signal,
        onFirstToken: () => {
            state.firstToken = true;
            if(measuredTokens > 0) post({ phase: 'prefill', processed: measuredTokens, total: measuredTokens });
        },
        onThought: thought,
        onCheck: note => post({ phase: 'thought', text: `\n(Checked: ${note})\n` }),
        onAnswer: delta => { answerText += delta; sentences(); }
    });
    for(const sentence of visible.push('', true)) {
        const note = notes.push(sentence);
        if(note) post({ phase: 'note', text: note });
    }
    sentences(true);
    return { answer: cleanAnswerPunctuation(result.answer), finishReason: result.finishReason, promptTokens: measuredTokens,
        tokens: result.tokens, checks: result.checks, cancelled: signal.aborted };
}

async function generate(input, plan, { post, controller, state, maxPromptTokens, measuredTokens, calibrate = true, temperature = 0, raw = false }) {
    const clean = raw ? text => text.trim() : cleanAnswerPunctuation;
    const promptChars = promptText(input.messages, plan.effort).length;
    const known = new Set([...input.references.map(ref => ref.id), ...input.legacyReferenceIds]);
    const visible = new ThoughtSplitter(), thoughtSentences = new SentenceChunker(), answerSentences = new SentenceChunker();
    const notes = new CoachNotes();
    const overflow = new AbortController();
    const signal = AbortSignal.any([controller.signal, overflow.signal]);
    let finishReason = null, promptTokens = null, tokens = 0, answerSeen = 0, streaming = true, lastPrefill = 0, prefillFinished = false;
    const thought = text => {
        post({ phase: 'thought', text });
        if(raw) return;
        for(const sentence of thoughtSentences.push(text)) {
            const note = notes.push(sentence);
            if(note) post({ phase: 'note', text: note });
        }
    };
    // Only complete, markup-free sentences citing defined evidence are streamed.
    // The first bad sentence stops streaming; the final answer is still checked in full.
    const sentences = (text, final = false) => {
        for(const sentence of answerSentences.push(text.slice(answerSeen), final)) {
            if(!streaming) break;
            if(markup.test(sentence) || !raw && [...sentence.matchAll(/\[([^\]\n]+)\]/g)].some(match => !known.has(match[1]))) streaming = false;
            else post({ phase: 'sentence', text: clean(sentence) });
        }
        answerSeen = text.length;
    };
    try {
        await runtime.createChatCompletion({
            messages: templateMessages(input.messages).map(({ role, content }) => ({ role, content })),
            temperature, seed: temperature > 0 ? -1 : 42,
            max_tokens: plan.effort === 'none' ? Math.min(plan.maxTokens, plan.reasoningBudget + 512) : plan.maxTokens,
            reasoning_effort: plan.effort, reasoning_budget_tokens: plan.effort === 'none' ? 0 : plan.reasoningBudget,
            chat_template_kwargs: { enable_thinking: plan.effort !== 'none' },
            cache_prompt: true, stream: true, return_progress: true, abortSignal: signal,
            onData: chunk => {
                if(signal.aborted) return;
                const progress = chunk.prompt_progress;
                if(progress?.total > 0) {
                    if(promptTokens === null) {
                        promptTokens = progress.total;
                        if(calibrate) charsPerToken = Math.max(1, 0.97 * promptChars / progress.total);
                        if(progress.total > maxPromptTokens + 64) { overflow.abort(); return; }
                    }
                    const now = Date.now();
                    if(now - lastPrefill > 250 || progress.processed >= progress.total) {
                        lastPrefill = now;
                        post({ phase: 'prefill', processed: progress.processed, total: progress.total });
                        prefillFinished = progress.processed >= progress.total;
                    }
                }
                const choice = chunk.choices?.[0], delta = choice?.delta || {};
                if(delta.reasoning_content || delta.content) {
                    if(!prefillFinished && measuredTokens > 0) {
                        post({ phase: 'prefill', processed: measuredTokens, total: measuredTokens });
                        prefillFinished = true;
                    }
                    state.firstToken = true;
                    tokens++;
                }
                if(delta.reasoning_content) thought(delta.reasoning_content);
                if(delta.content) {
                    const before = visible.thoughts.length;
                    const text = visible.push(delta.content);
                    if(visible.thoughts.length > before) thought(visible.thoughts.slice(before));
                    if(!visible.hidden) sentences(text);
                }
                finishReason = choice?.finish_reason || finishReason;
            }
        });
    } catch(error) {
        if(overflow.signal.aborted && !controller.signal.aborted) return { overflow: true };
        // The server can refuse an oversized prompt before any progress arrives, and it says how big it was.
        const message = String(error?.message || error);
        if(!controller.signal.aborted && /exceeds the available context size|exceed_context_size/i.test(message)) {
            const counted = Number(error?.n_prompt_tokens || message.match(/request \((\d+) tokens\)/)?.[1]);
            if(calibrate && counted > 0) charsPerToken = Math.max(1, Math.min(charsPerToken, 0.97 * promptChars / counted));
            else if(calibrate) charsPerToken = Math.max(1, charsPerToken * 0.7);
            return { overflow: true };
        }
        if(controller.signal.aborted || error?.name === 'AbortError')
            return { cancelled: true, answer: clean(visible.text), tokens };
        throw error;
    }
    if(overflow.signal.aborted && !controller.signal.aborted) return { overflow: true };
    const answer = clean(visible.push('', true));
    for(const sentence of thoughtSentences.push('', true)) {
        const note = notes.push(sentence);
        if(note) post({ phase: 'note', text: note });
    }
    sentences(answer, true);
    return { answer, finishReason, promptTokens, tokens, cancelled: controller.signal.aborted };
}
