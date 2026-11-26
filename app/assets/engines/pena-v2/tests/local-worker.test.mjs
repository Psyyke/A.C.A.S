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
    assert.equal(note, 'Hypothetical knight on d5: complete geometric controls c7, e7, b6, f6, b4, f4, c3, e3. This does not place a knight there or establish a legal move, capture, or forced win.');
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
        { board: true, fen, prompt: { systemPrompt: 'You are a grumpy pirate.' }, effort: 'high', thinkingTokens: 4096 }
    ].map(options => new Promise((resolve, reject) => {
        const worker = new Worker('./assets/engines/pena-v2/app-worker.js', { type: 'module' });
        let messages, calls = 0;
        const sentences = [], notes = [];
        const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Worker did not answer.')); }, 10000);
        worker.onmessage = ({ data }) => {
            if(data.type === 'ready') worker.postMessage({ type: 'converse', plain: true, raw: true, chatId: 'raw',
                input: { question: 'Where can the c3 knight go?' }, conversation: [{ player: 'Hi', pena: 'Hello.' }],
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
    const chat = [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello.' }];
    // Even when a caller passes a board, plain Inkling gets no chess context at all.
    const defaultSystem = { role: 'system', content: defaultPenaPrompt };
    assert.deepEqual(sent[0].messages, [defaultSystem, ...chat, question]);
    assert.deepEqual(sent[1].messages, [{ role: 'system', content: 'You are a grumpy pirate.' }, ...chat, question]);
    assert.deepEqual(sent[2].messages, [defaultSystem, ...chat, question]);
    assert.ok(sent.every(item => !JSON.stringify(item.messages).includes(fen.split(' ')[0])));
    assert.deepEqual(sent.map(item => [item.effort, item.budget]), [
        ['low', 160], ['medium', 320], ['none', 0], ['high', 64], ['high', 1536]
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
    // Real Inkling prompts pack more characters into a token than the worker's 1.55 guess.
    await page.route('**/pena-v2/local-ai.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        export class LocalAI {
            constructor({ onStatus }) { this.onStatus = onStatus; }
            connect() { this.onStatus({ state: 'ready', model: 'Inkling.gguf', lora: 'pena.gguf', context: 3200 }); }
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
                if(data.type === 'ready') worker.postMessage({ type: 'converse', chatId: 'crowded', input, history: [], playerColor: 'w', automatic: true });
                if(data.phase === 'failed') { clearTimeout(timeout); worker.terminate(); reject(new Error(data.message)); }
                if(data.phase === 'complete') { clearTimeout(timeout); worker.terminate(); resolve({ raw: data.raw, measured }); }
            };
            worker.postMessage({ type: 'initialize', port: 2800 });
        });
    });
    assert.equal(result.raw, 'Push the h-pawn.');
    // A roomier probe is measured first, then the answer goes out with what fits.
    assert.equal(result.measured.length, 2);
    assert.ok(result.measured[0] > result.measured[1], JSON.stringify(result.measured));
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
    assert.match(english.prompt, /Hypothetical knight on d5: complete geometric controls c7, e7, b6, f6, b4, f4, c3, e3\./);
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
