import test from 'node:test';
import assert from 'node:assert/strict';
import { hypotheticalKnightNotes } from '../coaching-policy.js';
import { englishBoard } from '../english-board.js';
import { defaultPenaPrompt } from '../prompt-overrides.js';

test('English evidence identifies the c3 knight and gives exact hypothetical d5 controls', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/8/3P4/2N5/PPP2PPP/R1BQKBNR b KQkq d3 0 4';
    const board = englishBoard(fen, { playerColor: 'b' });
    const note = hypotheticalKnightNotes(fen, 'Think where a knight sees if it goes to d5');

    assert.match(board, /White knight c3:/);
    assert.doesNotMatch(board, /queen c3/);
    assert.equal(note, 'Imagined knight on d5, not on the board: it would control c7, e7, b6, f6, b4, f4, c3, e3. Just name those squares and what sits on them.');
});

test('worker replacement skips queued positions instead of generating their stale thoughts', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.route('**/pena-v2/local-ai.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        export class LocalAI {
            constructor({ onStatus, onVersion }) { this.onStatus = onStatus; this.onVersion = onVersion; }
            connect() { this.onVersion('1.2.0'); this.onStatus({ state: 'ready', model: 'test.gguf', context: 512 }); }
            close() {}
            async promptInfo() { return { tokens: 42 }; }
            async createChatCompletion(options) {
                const question = options.messages.at(-1).content;
                self.postMessage({ type: 'started', question });
                if(question === 'old') await new Promise((resolve, reject) => {
                    options.abortSignal.addEventListener('abort', () =>
                        setTimeout(() => reject(new DOMException('Cancelled', 'AbortError')), 50), { once: true });
                });
                else options.onData({ choices: [{ delta: { content: 'Current.' }, finish_reason: 'stop' }] });
            }
        }
    ` }));
    await page.goto(`${url}/app/index.html`);
    const result = await page.evaluate(() => new Promise((resolve, reject) => {
        const worker = new Worker('./assets/engines/pena-v2/app-worker.js', { type: 'module' });
        const started = [], answers = [], versions = [];
        const send = question => worker.postMessage({ type: 'converse', plain: true, chatId: question,
            input: { question }, effort: 'none' });
        const timer = setTimeout(() => { worker.terminate(); reject(new Error('Replacement timed out')); }, 10000);
        worker.onmessage = ({ data }) => {
            if(data.type === 'serverVersion') versions.push(data.version);
            if(data.type === 'ready') send('old');
            if(data.type === 'started') {
                started.push(data.question);
                if(data.question === 'old') { send('skipped'); send('latest'); }
            }
            if(data.phase === 'failed') { clearTimeout(timer); worker.terminate(); reject(new Error(data.message)); }
            if(data.phase === 'complete') {
                answers.push(data.chatId);
                clearTimeout(timer);
                worker.terminate();
                resolve({ started, answers, versions });
            }
        };
        worker.postMessage({ type: 'initialize', port: 2800 });
    }));
    assert.deepEqual(result, { started: ['old', 'latest'], answers: ['latest'], versions: ['1.2.0'] });
});

test('chess coaching off keeps the System prompt and thinking controls without chess processing', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.route('**/pena-v2/local-ai.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        export class LocalAI {
            constructor({ onStatus }) { this.onStatus = onStatus; }
            connect() { this.onStatus({ state: 'ready', model: 'inkling-test.gguf', context: 8192 }); }
            close() {}
            async promptInfo() { return { tokens: 42 }; }
            async createChatCompletion(options) {
                self.postMessage({ type: 'sent', messages: options.messages, effort: options.reasoning_effort,
                    budget: options.reasoning_budget_tokens, temperature: options.temperature });
                options.onData({ choices: [{ delta: { reasoning_content: 'The knight on c3 attacks the queen on d8.' } }] });
                options.onData({ choices: [{ delta: { content: 'Wait, supplied evidence [A1]—knight c3 attacks d8.' }, finish_reason: 'length' }] });
            }
        }
    ` }));
    await page.goto(`${url}/app/index.html`);
    const fen = 'rnbqkbnr/ppp1pppp/8/8/3P4/2N5/PPP2PPP/R1BQKBNR b KQkq d3 0 4';
    const sent = await page.evaluate(fen => Promise.all([
        { board: true, fen, prompt: { systemPrompt: '' }, effort: 'auto' },
        { board: true, fen, prompt: { systemPrompt: 'You are a grumpy pirate.' }, effort: 'medium' },
        { board: false, fen: null, prompt: { systemPrompt: '' }, effort: 'none' },
        { board: true, fen, prompt: { systemPrompt: 'You are a grumpy pirate.' }, effort: 'high', thinkingTokens: 64 },
        { board: true, fen, prompt: { systemPrompt: 'You are a grumpy pirate.' }, effort: 'high', thinkingTokens: 4096 },
        { board: false, prompt: { systemPrompt: 'You are Pena, an AI chess coach. Speak naturally, like a relaxed player beside the board: '
            + 'plain words, contractions, and an honest, occasionally dry tone. Do not claim to be a real person. '
            + 'Respond to what was said, explain what matters, then stop. No canned friendliness, pep talks, or unnecessary follow-up questions. '
            + 'Don\'t say who is winning, better, ahead or equal, or give the evaluation, unless the player asks. Talk about the pieces and plans instead. '
            + 'Admit uncertainty and stick to the supplied evidence. Never use em dashes.' }, effort: 'none' }
    ].map(options => new Promise((resolve, reject) => {
        const worker = new Worker('./assets/engines/pena-v2/app-worker.js', { type: 'module' });
        let messages, calls = 0;
        const sentences = [], notes = [];
        const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Worker did not answer.')); }, 10000);
        worker.onmessage = ({ data }) => {
            if(data.type === 'ready') worker.postMessage({ type: 'converse', plain: true, raw: true, chatId: 'raw',
                input: { question: 'Where can the c3 knight go?' }, conversation: [
                    { player: 'Hi', pena: 'Hello.' },
                    { player: 'What is the real idea?', pena: 'Bg5 is the real idea: it pins the knight.' }
                ],
                effort: 'medium', thinkingTokens: 320, temperature: 0.75, notes: 'Chess notes must not be read.', ...options });
            if(data.type === 'sent') { messages = data; calls++; }
            if(data.phase === 'sentence') sentences.push(data.text);
            if(data.phase === 'note') notes.push(data.text);
            if(data.phase === 'failed') { clearTimeout(timeout); worker.terminate(); reject(new Error(data.message)); }
            if(data.phase === 'complete') { clearTimeout(timeout); worker.terminate();
                resolve({ ...messages, schema: data.inputSchema, raw: data.raw, sentences, notes, calls, escalated: data.escalated }); }
        };
        worker.postMessage({ type: 'initialize', port: 2800 });
    }))), fen);
    const question = { role: 'user', content: 'Where can the c3 knight go?' };
    const chat = [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello.' },
        { role: 'user', content: 'What is the real idea?' },
        { role: 'assistant', content: 'Bg5 is worth considering: it pins the knight.' }];
    // Even when a caller passes a board, plain Inkling gets no chess context at all.
    const defaultSystem = { role: 'system', content: defaultPenaPrompt };
    assert.deepEqual(sent[0].messages, [defaultSystem, ...chat, question]);
    assert.deepEqual(sent[1].messages, [{ role: 'system', content: 'You are a grumpy pirate.' }, ...chat, question]);
    assert.deepEqual(sent[2].messages, [defaultSystem, ...chat, question]);
    assert.deepEqual(sent[5].messages, [defaultSystem, ...chat, question], 'Plain mode upgrades an unchanged saved default too');
    assert.ok(sent.every(item => !JSON.stringify(item.messages).includes(fen.split(' ')[0])));
    assert.deepEqual(sent.map(item => [item.effort, item.budget]), [
        ['low', 160], ['medium', 320], ['none', 0], ['high', 64], ['high', 1536], ['none', 0]
    ]);
    for(const item of sent) {
        assert.equal(item.schema, 'pena-plain-chat/1');
        assert.equal(item.temperature, 0.75);
        assert.equal(item.raw, 'Wait, supplied evidence [A1]—knight c3 attacks d8.');
        assert.deepEqual(item.sentences, [item.raw]);
        assert.deepEqual(item.notes, [], 'Plain mode does not extract chess coach notes from thoughts');
        assert.equal(item.calls, 1, 'Plain mode does not retry or override manual effort');
        assert.equal(item.escalated, false);
    }
});

test('native-only worker uses the selected template and fits a small model context', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.route('**/pena-v2/local-ai.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `
            export class LocalAI {
                constructor({ onStatus }) { this.onStatus = onStatus; }
                connect() { this.onStatus({ state: 'ready', model: 'other-chat-model.gguf', context: 512 }); }
                close() {}
                async promptInfo(messages) {
                    if(messages.filter(m => m.role === 'system').length !== 1) throw new Error('Unmerged system messages.');
                    if(!messages[0].content.includes('unnecessary follow-up questions'))
                        throw new Error('Missing default personality.');
                    if(!messages[0].content.includes('Never use em dashes'))
                        throw new Error('Missing punctuation instruction.');
                    if(messages[0].content.includes('never with a dot')) throw new Error('Old spelling instruction was sent.');
                    return { tokens: 42, context: 512 };
                }
                async createChatCompletion(options) {
                    if(options.max_tokens > 256) throw new Error('Output exceeds selected context.');
                    if(options.reasoning_budget_tokens !== 0) throw new Error('Greeting reasoning was not disabled.');
                    if(options.messages.some(m => /<\\|/.test(m.content))) throw new Error('Inkling markup sent to another model.');
                    self.postMessage({ type: 'sampling', temperature: options.temperature, seed: options.seed, system: options.messages[0].content });
                    options.onData({ choices: [{ delta: { content: 'Hi—there.' }, finish_reason: 'stop' }] });
                }
            }
        `
    }));
    await page.goto(`${url}/app/index.html`);
    const answers = await page.evaluate(async () => Promise.all([[undefined, false], [0, false], [0, true]].map(([temperature, board]) => new Promise((resolve, reject) => {
        const worker = new Worker('./assets/engines/pena-v2/app-worker.js', { type: 'module' });
        let sampling;
        const sentences = [];
        const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Worker did not answer.')); }, 10000);
        worker.onerror = event => { clearTimeout(timeout); worker.terminate(); reject(new Error(event.message)); };
        worker.onmessage = ({ data }) => {
            if(data.type === 'ready') worker.postMessage({ type: 'converse', plain: true, chatId: 'greeting',
                input: { question: 'Hello' }, notes: board ? '' : 'The app has settings.', temperature, board });
            if(data.type === 'sampling') sampling = { temperature: data.temperature, seed: data.seed, system: data.system };
            if(data.phase === 'sentence') sentences.push(data.text);
            if(data.phase === 'failed') { clearTimeout(timeout); worker.terminate(); reject(new Error(data.message)); }
            if(data.phase === 'complete') { clearTimeout(timeout); worker.terminate(); resolve({ answer: data, sampling, sentences }); }
        };
        worker.postMessage({ type: 'initialize', port: 2800 });
    }))));
    for(const { answer } of answers) {
        assert.equal(answer.raw, 'Hi, there.');
        assert.equal(answer.promptTokens, 42);
        assert.equal(answer.effort, 'none');
        assert.equal(answer.inputSchema, 'pena-plain-chat/1');
    }
    assert.doesNotMatch(answers[0].sentences.join(''), /—/);
    assert.deepEqual(answers.map(({ sampling: { temperature, seed } }) => ({ temperature, seed })), [{ temperature: 0.3, seed: -1 },
        { temperature: 0, seed: 42 }, { temperature: 0, seed: 42 }]);
    assert.match(answers[0].sampling.system, /No board is open/);
    assert.match(answers[2].sampling.system, /A game is open, but this is small talk/);
    for(const { sampling } of answers) {
        assert.match(sampling.system, /your entire reply must be a greeting of one or two words/);
        assert.doesNotMatch(sampling.system, /Keep small talk to a line or two/);
    }
    const mobile = await page.evaluate(async () => {
        Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { mobile: true } });
        const enabled = document.querySelector('[data-key="penaEnabled"]');
        enabled.checked = true;
        window.Worker = class { constructor() { throw new Error('Mobile must not start a worker.'); } };
        const { initializePenaSettings } = await import('./assets/engines/pena-v2/app-settings.js');
        const { initializePena } = await import('./assets/engines/pena-v2/service.js');
        initializePenaSettings();
        initializePena();
        return { checked: enabled.checked, disabled: enabled.disabled,
            hidden: getComputedStyle(enabled.closest('.custom-input')).display === 'none',
            chat: Boolean(document.querySelector('#pena-window')) };
    });
    assert.deepEqual(mobile, { checked: false, disabled: true, hidden: true, chat: false });
});

test('a thinking loop or printed chat markup stops early and gets one quick retry without thinking', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.route('**/pena-v2/local-ai.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        export class LocalAI {
            constructor({ onStatus }) { this.onStatus = onStatus; this.count = 0; }
            connect() { this.onStatus({ state: 'ready', model: 'inkling-test.gguf', context: 8192 }); }
            close() {}
            async promptInfo() { return { tokens: 42 }; }
            async createChatCompletion(options) {
                const mode = options.messages.at(-1).content, first = ++this.count === 1;
                let sent = 0;
                const stream = chunks => {
                    for(const chunk of chunks) {
                        if(options.abortSignal.aborted) throw new DOMException('Cancelled', 'AbortError');
                        sent++;
                        options.onData({ choices: [chunk] });
                    }
                };
                const report = () => self.postMessage({ type: 'sent', effort: options.reasoning_effort, temperature: options.temperature, sent });
                try {
                    if(mode === 'loop' && first) stream(Array.from({ length: 3000 }, () => ({ delta: { reasoning_content: 'Need continue. ' } })));
                    else if(mode === 'markup') stream(Array.from({ length: 500 }, (_, i) => ({ delta: { content: ['<|message_model|>', '<|content_thinking|>', '<|end_message|>'][i % 3] } })));
                    else if(mode === 'tail') stream(['The e5 pawn is weak.', '<|end_message|>', '<|message_model|>', 'Again.']
                        .map(content => ({ delta: { content } })));
                    else if(mode === 'empty' && first) {
                        const error = new Error('The local model returned no visible final answer.');
                        error.code = 'NO_VISIBLE_ANSWER';
                        throw error;
                    } else stream([{ delta: { content: 'Your knight is loose.' }, finish_reason: 'stop' }]);
                } finally { report(); }
            }
        }
    ` }));
    await page.goto(`${url}/app/index.html`);
    const results = await page.evaluate(() => Promise.all([
        { question: 'loop', effort: 'medium' }, { question: 'empty', effort: 'high' },
        { question: 'tail', effort: 'none' }, { question: 'markup', effort: 'none', automatic: true },
        { question: 'markup', effort: 'none' }
    ].map(({ question, ...options }) => new Promise((resolve, reject) => {
        const worker = new Worker('./assets/engines/pena-v2/app-worker.js', { type: 'module' });
        const calls = [];
        const timeout = setTimeout(() => { worker.terminate(); reject(new Error(`${question} did not answer.`)); }, 10000);
        worker.onmessage = ({ data }) => {
            if(data.type === 'ready') worker.postMessage({ type: 'converse', plain: true, chatId: question,
                input: { question }, temperature: 0, ...options });
            if(data.type === 'sent') calls.push({ effort: data.effort, temperature: data.temperature, sent: data.sent });
            if(data.phase === 'failed' || data.phase === 'complete') { clearTimeout(timeout); worker.terminate();
                resolve({ question, phase: data.phase, message: data.message, raw: data.raw,
                    effort: data.effort, escalated: data.escalated, calls }); }
        };
        worker.postMessage({ type: 'initialize', port: 2800 });
    }))));
    const [loop, empty, tail, ...markup] = results;
    assert.equal(loop.raw, 'Your knight is loose.');
    assert.deepEqual(loop.calls.map(call => call.effort), ['medium', 'none'], 'Thinking harder does not fix a loop');
    assert.ok(loop.calls[0].sent < 700, `The loop stopped after ${loop.calls[0].sent} thinking tokens`);
    assert.equal(loop.calls[1].temperature, 0.4, 'The retry is a little warmer so it does not repeat itself');
    assert.equal(loop.escalated, true);
    assert.equal(empty.raw, 'Your knight is loose.');
    assert.deepEqual(empty.calls.map(call => call.effort), ['high', 'none']);
    assert.equal(tail.raw, 'The e5 pawn is weak.', 'Text before printed chat markup is the whole answer');
    assert.equal(tail.calls.length, 1);
    assert.equal(tail.calls[0].sent, 2);
    for(const result of markup) {
        assert.equal(result.phase, 'failed', 'A failed retry is reported, not a successful empty comment');
        assert.match(result.message, /got stuck thinking/);
        assert.deepEqual(result.calls.map(call => [call.effort, call.sent]), [['none', 1], ['none', 1]]);
    }
});

test('Inkling with a Pena LoRA and custom personas both receive the live coaching policy', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.route('**/pena-v2/local-ai.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `
            export class LocalAI {
                constructor({ onStatus }) { this.onStatus = onStatus; }
                connect() { this.onStatus({ state: 'ready', model: 'Inkling.gguf', lora: 'pena.gguf', context: 8192 }); }
                close() {}
                async promptInfo(messages) {
                    const system = messages[0].content;
                    if(!messages.at(-1).content.includes('Rule-checked CURRENT board')
                        || !messages.at(-1).content.includes('White: pawn h3, king h1.'))
                        throw new Error('Missing rule-checked board reminder.');
                    if(!system.includes('Explain the purpose behind an idea')) throw new Error('Missing coaching policy.');
                    if(messages.at(-1).content.includes('I want the move')) {
                        if(!system.includes('The player explicitly asked for a move. Give the move'))
                            throw new Error('Missing explicit move permission.');
                        if(system.includes('Do not name or describe specific suggested moves'))
                            throw new Error('Requested move was still hidden.');
                    } else if(!system.includes('Do not name or describe specific suggested moves')) throw new Error('Missing hide-moves policy.');
                    if(messages.at(-1).content.includes('custom persona test') && !system.includes('Talk like a pirate'))
                        throw new Error('Custom persona was lost.');
                    if(!messages.at(-1).content.includes('custom persona test')
                        && !system.includes('unnecessary follow-up questions'))
                        throw new Error('Default personality was lost with the LoRA.');
                    if(system.includes('never with a dot')) throw new Error('Old spelling instruction was sent.');
                    return { tokens: 1000, context: 8192 };
                }
                async createChatCompletion(options) {
                    options.onData({ choices: [{ delta: { content: 'Keep an eye on your king.' }, finish_reason: 'stop' }] });
                }
            }
        `
    }));
    await page.goto(`${url}/app/index.html`);
    const answers = await page.evaluate(async () => {
        const { rebuildCoachingNotes, liveCoachingInput } = await import('./assets/engines/pena-v2/app-input.js');
        const { engineCoachingEvidence } = await import('./assets/engines/pena-v2/engine-coaching-input.js');
        const fen = 'k7/8/8/5b2/8/7P/8/7K w - - 0 1';
        const record = { fen, engine: { depth: 12, lines: [{ pv: ['h3h4', 'a8b8'], move: 'h3h4', score: { cp: 0, mate: null } }] }, recent: [] };
        const evidence = engineCoachingEvidence({ snapshot: { schema: 'pena-v2-search/1', fen, history: [],
            perspective: 'root-side-to-move', budget: { nodes: 128, moves: [] },
            engine: { networkSha256: 'a'.repeat(64), precision: 'f32', backend: 'webgpu' }, bestMove: 'h3h4',
            lines: [{ pv: ['h3h4', 'a8b8'] }], candidates: [{ move: 'h3h4', visits: 100, policyPrior: 0.3, search: { q: 0.2 } }] } });
        const results = [];
        for(const [question, prompt, moveRequested = false] of [['What matters here?', {}],
            ['custom persona test', { systemPrompt: 'Talk like a pirate.' }], ['I want the move.', {}, true]]) {
            const prepared = rebuildCoachingNotes({ schema: 'pena-live-notes-source/1', fen, history: [], record, playerColor: 'w', question });
            const input = await liveCoachingInput({ prepared, fen, history: [], playerColor: 'w', question, engineEvidence: evidence });
            results.push(await new Promise((resolve, reject) => {
                const worker = new Worker('./assets/engines/pena-v2/app-worker.js', { type: 'module' });
                const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Worker timed out.')); }, 15000);
                worker.onerror = event => { clearTimeout(timeout); worker.terminate(); reject(new Error(event.message)); };
                worker.onmessage = ({ data }) => {
                    if(data.type === 'ready') worker.postMessage({ type: 'converse', chatId: question, input,
                        history: [], playerColor: 'w', automatic: !moveRequested, hideMoves: !moveRequested, moveRequested, prompt });
                    if(data.phase === 'failed') { clearTimeout(timeout); worker.terminate(); reject(new Error(data.message)); }
                    if(data.phase === 'complete') { clearTimeout(timeout); worker.terminate(); resolve(data.raw); }
                };
                worker.postMessage({ type: 'initialize', port: 2800 });
            }));
        }
        return results;
    });
    assert.deepEqual(answers, ['Keep an eye on your king.', 'Keep an eye on your king.', 'Keep an eye on your king.']);
});

test('a board that only looks too big for the first token guess is measured instead of refused', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    // With the full voice prompt, 4K fits at 2.5 chars/token but not at the worker's initial 1.55 guess.
    await page.route('**/pena-v2/local-ai.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        export class LocalAI {
            constructor({ onStatus }) { this.onStatus = onStatus; }
            connect() { this.onStatus({ state: 'ready', model: 'Inkling.gguf', lora: 'pena.gguf', context: 4096 }); }
            close() {}
            async promptInfo(messages) {
                const chars = messages.reduce((total, message) => total + message.content.length, 0);
                self.postMessage({ type: 'measured', chars });
                return { tokens: Math.ceil(chars / 2.5) };
            }
            async createChatCompletion(options) { options.onData({ choices: [{ delta: { content: 'Push the h-pawn.' }, finish_reason: 'stop' }] }); }
        }` }));
    await page.goto(`${url}/app/index.html`);
    const result = await page.evaluate(async () => {
        const { rebuildCoachingNotes, liveCoachingInput } = await import('./assets/engines/pena-v2/app-input.js');
        const { engineCoachingEvidence } = await import('./assets/engines/pena-v2/engine-coaching-input.js');
        const fen = 'k7/8/8/5b2/8/7P/8/7K w - - 0 1', question = 'What matters here?';
        const record = { fen, engine: { depth: 12, lines: [{ pv: ['h3h4', 'a8b8'], move: 'h3h4', score: { cp: 0, mate: null } }] }, recent: [] };
        const evidence = engineCoachingEvidence({ snapshot: { schema: 'pena-v2-search/1', fen, history: [],
            perspective: 'root-side-to-move', budget: { nodes: 128, moves: [] },
            engine: { networkSha256: 'a'.repeat(64), precision: 'f32', backend: 'webgpu' }, bestMove: 'h3h4',
            lines: [{ pv: ['h3h4', 'a8b8'] }], candidates: [{ move: 'h3h4', visits: 100, policyPrior: 0.3, search: { q: 0.2 } }] } });
        const prepared = rebuildCoachingNotes({ schema: 'pena-live-notes-source/1', fen, history: [], record, playerColor: 'w', question });
        const input = await liveCoachingInput({ prepared, fen, history: [], playerColor: 'w', question, engineEvidence: evidence });
        return new Promise((resolve, reject) => {
            const worker = new Worker('./assets/engines/pena-v2/app-worker.js', { type: 'module' });
            const measured = [];
            const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Worker timed out.')); }, 15000);
            worker.onmessage = ({ data }) => {
                if(data.type === 'measured') measured.push(data.chars);
                if(data.type === 'ready') worker.postMessage({ type: 'converse', chatId: 'crowded', input, history: [], playerColor: 'w', automatic: true, thinkingTokens: 1536 });
                if(data.phase === 'failed') { clearTimeout(timeout); worker.terminate(); reject(new Error(`${data.message} Measured prompt characters: ${JSON.stringify(measured)}`)); }
                if(data.phase === 'complete') { clearTimeout(timeout); worker.terminate(); resolve({ raw: data.raw, measured }); }
            };
            worker.postMessage({ type: 'initialize', port: 2800 });
        });
    });
    assert.equal(result.raw, 'Push the h-pawn.');
    // The estimate rejects the prompt, but measurement proves the actual request fits.
    assert.equal(result.measured.length, 2);
    const promptBudget = 4096 - (1536 + 256) - 1;
    assert.ok(Math.ceil(result.measured[0] / 1.55) > promptBudget, JSON.stringify(result.measured));
    assert.ok(Math.ceil(result.measured[1] / 2.5) <= promptBudget, JSON.stringify(result.measured));
});

test('a stock "Your <piece> on" opener in an automatic comment is caught before speech and asked once more', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.route('**/pena-v2/local-ai.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        export class LocalAI {
            constructor({ onStatus }) { this.onStatus = onStatus; }
            connect() { this.onStatus({ state: 'ready', model: 'Inkling.gguf', context: 8192 }); }
            close() {}
            async promptInfo() { return { tokens: 1000 }; }
            async createChatCompletion(options) {
                const nudged = options.messages.at(-1).content.includes("not with one of the player's pieces");
                const words = nudged ? ['The ', 'bishop ', 'on ', 'f5 ', 'is ', 'eyeing ', 'h3.']
                    : ['Your ', 'pawn ', 'on ', 'h3 ', 'is ', 'loose ', 'to ', 'the ', 'bishop.'];
                let sent = 0;
                try {
                    for(const content of words) {
                        if(options.abortSignal.aborted) throw new DOMException('Cancelled', 'AbortError');
                        sent++;
                        options.onData({ choices: [{ delta: { content } }] });
                    }
                    options.onData({ choices: [{ delta: {}, finish_reason: 'stop' }] });
                } finally { self.postMessage({ type: 'sent', nudged, sent }); }
            }
        }` }));
    await page.goto(`${url}/app/index.html`);
    const results = await page.evaluate(async () => {
        const { rebuildCoachingNotes, liveCoachingInput } = await import('./assets/engines/pena-v2/app-input.js');
        const { engineCoachingEvidence } = await import('./assets/engines/pena-v2/engine-coaching-input.js');
        const before = 'k7/8/8/5b2/8/8/7P/7K w - - 0 1', fen = 'k7/8/8/5b2/8/7P/8/7K b - - 0 1', history = [before];
        const record = { fen, engine: { depth: 12, lines: [{ pv: ['a8b8'], move: 'a8b8', score: { cp: 0, mate: null } }] }, recent: [] };
        const evidence = engineCoachingEvidence({ snapshot: { schema: 'pena-v2-search/1', fen, history,
            perspective: 'root-side-to-move', budget: { nodes: 128, moves: [] },
            engine: { networkSha256: 'a'.repeat(64), precision: 'f32', backend: 'webgpu' }, bestMove: 'a8b8',
            lines: [{ pv: ['a8b8', 'h3h4'] }], candidates: [{ move: 'a8b8', visits: 100, policyPrior: 0.3, search: { q: 0.2 } }] } });
        const question = '(position after White played h3)';
        const prepared = rebuildCoachingNotes({ schema: 'pena-live-notes-source/1', fen, history, record, playerColor: 'w', question });
        const input = await liveCoachingInput({ prepared, fen, history, playerColor: 'w', question, engineEvidence: evidence });
        const results = {};
        for(const [name, extra] of [['natural', {}], ['legacy', { style: 'legacy' }], ['asked', { automatic: false }]]) {
            results[name] = await new Promise((resolve, reject) => {
                const worker = new Worker('./assets/engines/pena-v2/app-worker.js', { type: 'module' });
                const calls = [], sentences = [];
                const timeout = setTimeout(() => { worker.terminate(); reject(new Error(`${name} timed out.`)); }, 15000);
                worker.onmessage = ({ data }) => {
                    if(data.type === 'ready') worker.postMessage({ type: 'converse', chatId: name, input, history, playerColor: 'w',
                        automatic: true, effort: 'none', ...extra });
                    if(data.type === 'sent') calls.push(data);
                    if(data.phase === 'sentence') sentences.push(data.text);
                    if(data.phase === 'failed') { clearTimeout(timeout); worker.terminate(); reject(new Error(data.message)); }
                    if(data.phase === 'complete') { clearTimeout(timeout); worker.terminate(); resolve({ raw: data.raw, calls, sentences }); }
                };
                worker.postMessage({ type: 'initialize', port: 2800 });
            });
        }
        return results;
    });
    const { natural, legacy, asked } = results;
    assert.equal(natural.raw, 'The bishop on f5 is eyeing h3.');
    assert.deepEqual(natural.calls.map(call => [call.nudged, call.sent]), [[false, 4], [true, 7]], 'The first try stops after four words');
    assert.deepEqual(natural.sentences, ['The bishop on f5 is eyeing h3.'], 'Nothing from the first try reaches speech');
    assert.equal(legacy.raw, 'Your pawn on h3 is loose to the bishop.', 'The legacy A/B style is left alone');
    assert.equal(legacy.calls.length, 1);
    assert.equal(asked.raw, 'Your pawn on h3 is loose to the bishop.', 'Answers to typed questions are left alone');
    assert.equal(asked.calls.length, 1);
});

test('plain Inkling reads the board as English sentences, history questions included', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.route('**/pena-v2/local-ai.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        export class LocalAI {
            constructor({ onStatus }) { this.onStatus = onStatus; }
            connect() { this.onStatus({ state: 'ready', model: 'Inkling.gguf', context: 8192 }); }
            close() {}
            async promptInfo(messages) {
                self.postMessage({ type: 'prompt', text: messages.map(message => message.content).join('\\n') });
                return { tokens: 1000 };
            }
            async createChatCompletion(options) { options.onData({ choices: [{ delta: { content: 'Push the h-pawn.' }, finish_reason: 'stop' }] }); }
        }` }));
    await page.goto(`${url}/app/index.html`);
    const results = await page.evaluate(async () => {
        const { rebuildCoachingNotes, liveCoachingInput } = await import('./assets/engines/pena-v2/app-input.js');
        const { engineCoachingEvidence } = await import('./assets/engines/pena-v2/engine-coaching-input.js');
        const before = 'k7/8/8/5b2/8/8/7P/7K w - - 0 1', fen = 'k7/8/8/5b2/8/7P/8/7K b - - 0 1', history = [before];
        const record = { fen, engine: { depth: 12, lines: [{ pv: ['a8b8', 'h3h4'], move: 'a8b8', score: { cp: 0, mate: null } }] }, recent: [] };
        const evidence = engineCoachingEvidence({ snapshot: { schema: 'pena-v2-search/1', fen, history,
            perspective: 'root-side-to-move', budget: { nodes: 128, moves: [] },
            engine: { networkSha256: 'a'.repeat(64), precision: 'f32', backend: 'webgpu' }, bestMove: 'a8b8',
            lines: [{ pv: ['a8b8', 'h3h4'] }], candidates: [{ move: 'a8b8', visits: 100, policyPrior: 0.3, search: { q: 0.2 } }] } });
        const results = [];
        for(const question of ['Where would a knight on d5 see?', 'What did their last move do?']) {
            const prepared = rebuildCoachingNotes({ schema: 'pena-live-notes-source/1', fen, history, record, playerColor: 'b', question });
            const input = await liveCoachingInput({ prepared, fen, history, playerColor: 'b', question, engineEvidence: evidence });
            results.push(await new Promise((resolve, reject) => {
                const worker = new Worker('./assets/engines/pena-v2/app-worker.js', { type: 'module' });
                let prompt = '';
                const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Worker timed out.')); }, 15000);
                worker.onmessage = ({ data }) => {
                    if(data.type === 'prompt') prompt = data.text;
                    if(data.type === 'ready') worker.postMessage({ type: 'converse', chatId: question, input, history, playerColor: 'b', automatic: true });
                    if(data.phase === 'failed') { clearTimeout(timeout); worker.terminate(); reject(new Error(data.message)); }
                    if(data.phase === 'complete') { clearTimeout(timeout); worker.terminate(); resolve({ prompt, schema: data.inputSchema }); }
                };
                worker.postMessage({ type: 'initialize', port: 2800 });
            }));
        }
        return results;
    });
    const [english, past] = results;
    assert.equal(english.schema, 'pena-v2-english-coaching-input/1');
    assert.match(english.prompt, /White pawn h3: attacks no enemy piece; guards nothing; attacked by Black bishop f5; defended by nobody\./);
    assert.match(english.prompt, /Last move: White played h3, pawn from h2 to h3\./);
    assert.match(english.prompt, /Imagined knight on d5, not on the board: it would control c7, e7, b6, f6, b4, f4, c3, e3\./);
    assert.doesNotMatch(english.prompt, /PCF\/3p|Rule-checked CURRENT board/);
    assert.equal(past.schema, 'pena-v2-english-coaching-input/1');
    assert.match(past.prompt, /Moves so far \(H, already played\): \.\.\. 1\.h3\./);
    assert.doesNotMatch(past.prompt, /PCF\/3p|Rule-checked CURRENT board/);
});

test('plain Inkling thinks through the live evidence path and its answer drops evidence talk', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.route('**/pena-v2/local-ai.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        export class LocalAI {
            constructor({ onStatus }) { this.onStatus = onStatus; }
            connect() { this.onStatus({ state: 'ready', model: 'Inkling.gguf', context: 8192 }); }
            close() {}
            async promptInfo(messages, kwargs, signal, effort, extra) { return { tokens: 1000, prompt: extra?.includePrompt ? 'TEMPLATE' : undefined }; }
            async createChatCompletion(options) { options.onData({ choices: [{ delta: { content: 'fallback' }, finish_reason: 'stop' }] }); }
            async createCompletion({ prompt, onData }) {
                self.postMessage({ type: 'raw', prompt });
                if(prompt.endsWith('<|content_text|>')) onData({ content: 'The supplied evidence shows the h-pawn is loose.', tokens: [5], stop: true });
                else { onData({ content: 'The bishop can take h3.', tokens: [3] }); onData({ content: '', tokens: [200010] }); }
            }
        }` }));
    await page.goto(`${url}/app/index.html`);
    const result = await page.evaluate(async () => {
        const { rebuildCoachingNotes, liveCoachingInput } = await import('./assets/engines/pena-v2/app-input.js');
        const { engineCoachingEvidence } = await import('./assets/engines/pena-v2/engine-coaching-input.js');
        const fen = 'k7/8/8/5b2/8/7P/8/7K b - - 0 1', history = ['k7/8/8/5b2/8/8/7P/7K w - - 0 1'], question = 'Is their h-pawn weak?';
        const record = { fen, engine: { depth: 12, lines: [{ pv: ['a8b8', 'h3h4'], move: 'a8b8', score: { cp: 0, mate: null } }] }, recent: [] };
        const engineEvidence = engineCoachingEvidence({ snapshot: { schema: 'pena-v2-search/1', fen, history,
            perspective: 'root-side-to-move', budget: { nodes: 128, moves: [] },
            engine: { networkSha256: 'a'.repeat(64), precision: 'f32', backend: 'webgpu' }, bestMove: 'a8b8',
            lines: [{ pv: ['a8b8', 'h3h4'] }], candidates: [{ move: 'a8b8', visits: 100, policyPrior: 0.3, search: { q: 0.2 } }] } });
        const prepared = rebuildCoachingNotes({ schema: 'pena-live-notes-source/1', fen, history, record, playerColor: 'b', question });
        const input = await liveCoachingInput({ prepared, fen, history, playerColor: 'b', question, engineEvidence });
        return await new Promise((resolve, reject) => {
            const worker = new Worker('./assets/engines/pena-v2/app-worker.js', { type: 'module' });
            const raw = [];
            const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Worker timed out.')); }, 20000);
            worker.onmessage = ({ data }) => {
                if(data.type === 'raw') raw.push(data.prompt);
                if(data.type === 'ready') worker.postMessage({ type: 'converse', chatId: 'live', input, history, playerColor: 'b', effort: 'medium' });
                if(data.phase === 'failed') { clearTimeout(timeout); worker.terminate(); reject(new Error(data.message)); }
                if(data.phase === 'complete') { clearTimeout(timeout); worker.terminate(); resolve({ raw, text: data.raw, effort: data.effort, schema: data.inputSchema }); }
            };
            worker.postMessage({ type: 'initialize', port: 2800 });
        });
    });
    assert.deepEqual([result.effort, result.schema], ['medium', 'pena-v2-english-coaching-input/1']);
    assert.match(result.raw[0], /^TEMPLATE<\|message_model\|><\|content_thinking\|>$/);
    assert.match(result.raw.at(-1), /The bishop can take h3\..*<\|content_text\|>$/s);
    assert.equal(result.text, 'The h-pawn is loose.');
});
