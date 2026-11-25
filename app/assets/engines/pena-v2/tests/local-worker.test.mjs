import test from 'node:test';
import assert from 'node:assert/strict';

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
            constructor({ onStatus }) { this.onStatus = onStatus; }
            connect() { this.onStatus({ state: 'ready', model: 'test.gguf', context: 512 }); }
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
        const started = [], answers = [];
        const send = question => worker.postMessage({ type: 'converse', plain: true, chatId: question,
            input: { question }, effort: 'none' });
        const timer = setTimeout(() => { worker.terminate(); reject(new Error('Replacement timed out')); }, 10000);
        worker.onmessage = ({ data }) => {
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
                resolve({ started, answers });
            }
        };
        worker.postMessage({ type: 'initialize', port: 2800 });
    }));
    assert.deepEqual(result, { started: ['old', 'latest'], answers: ['latest'] });
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
