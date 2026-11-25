import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
import { AI_DEFAULTS } from '../../appServer/backend/nativeAI.js';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(new URL('../../appServer/package.json', import.meta.url));
const WebSocket = require('ws');
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
app.setPath('userData', process.env.ACAS_AI_TEST_DIRECTORY);
await writeFile(path.join(process.env.ACAS_AI_TEST_DIRECTORY, 'config.json'), JSON.stringify({ serverPort: port }));
await import('../../appServer/backend/main.js');
app.whenReady().then(async () => {
    const window = BrowserWindow.getAllWindows()[0];
    await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
    let socket;
    try {
        assert.equal(await window.webContents.executeJavaScript('typeof window.aiAPI.start'), 'function');
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#serverConnectionInfo').nextElementSibling.id"), 'open-local-ai');
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#local-ai').open"), false);
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#open-local-ai').textContent.trim()"), 'AI');
        const originalStatus = await window.webContents.executeJavaScript('window.aiAPI.getStatus()');
        window.webContents.send('aiStatus', { state: 'ready', model: 'example-model.gguf', lora: null,
            context: 8192, capabilities: { backend: 'cuda' }, setup: { installed: true } });
        await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                if(document.getElementById('ai-summary').textContent.includes('example-model.gguf')) return resolve();
                if(Date.now() - start > 3000) return reject(new Error('AI status did not arrive.'));
                setTimeout(check, 10);
            };
            check();
        })`);
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#open-local-ai').textContent.trim()"), 'AI');
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#local-ai').open"), false);
        await window.webContents.executeJavaScript("document.querySelector('#open-local-ai').click()");
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#local-ai').matches(':modal')"), true);
        assert.match(await window.webContents.executeJavaScript("document.querySelector('#ai-summary').textContent"), /example-model\.gguf/);
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#ai-summary').parentElement.className"), 'ai-dialog-header');
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#close-local-ai')"), null);
        await window.webContents.executeJavaScript(`(() => {
            const dialog = document.querySelector('#local-ai');
            const bounds = dialog.getBoundingClientRect();
            dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: bounds.left + 2, clientY: bounds.top + 2 }));
            document.querySelector('#ai-summary').click();
        })()`);
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#local-ai').open"), true);
        window.webContents.send('aiStatus', originalStatus);
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#acas-version-tag').textContent"), `v${app.getVersion()}`);
        const numberControls = await window.webContents.executeJavaScript(`(() => {
            const inputs = [...document.querySelectorAll('input[type="number"]')];
            const input = document.getElementById('ai-gpu-layers');
            const original = input.value;
            input.value = input.max;
            input.stepUp();
            const maximum = input.value;
            input.value = input.min;
            input.stepDown();
            const minimum = input.value;
            input.stepUp();
            const incremented = input.value;
            input.value = original;
            return { schemes: inputs.map(item => getComputedStyle(item).colorScheme),
                maximum, minimum, incremented };
        })()`);
        assert.deepEqual(numberControls.schemes, ['dark', 'dark', 'dark', 'dark']);
        assert.equal(numberControls.maximum, '999');
        assert.equal(numberControls.minimum, '0');
        assert.equal(numberControls.incremented, '1');
        await window.webContents.executeJavaScript(`(() => {
            document.querySelector('.ai-advanced').open = true;
            const input = document.getElementById('ai-gpu-layers');
            input.value = '5';
            input.focus();
        })()`);
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#local-ai').getBoundingClientRect().bottom <= innerHeight"), true);
        assert.equal(await window.webContents.executeJavaScript("document.activeElement.id"), 'ai-gpu-layers');
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Up' });
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Up' });
        assert.equal(await window.webContents.executeJavaScript("document.getElementById('ai-gpu-layers').value"), '6');
        await window.webContents.executeJavaScript(`(() => {
            document.getElementById('ai-gpu-layers').value = '99';
            document.querySelector('.ai-advanced').open = false;
        })()`);
        window.webContents.sendInputEvent({ type: 'mouseDown', x: 1, y: 1, button: 'left', clickCount: 1 });
        window.webContents.sendInputEvent({ type: 'mouseUp', x: 1, y: 1, button: 'left', clickCount: 1 });
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#local-ai').open"), false);
        await window.webContents.executeJavaScript("document.querySelector('#open-local-ai').click()");
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#local-ai').open"), false);
        await window.webContents.executeJavaScript("document.querySelector('#panelsToggle').click()");
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#open-local-ai').checkVisibility()"), false);
        await window.webContents.executeJavaScript("document.querySelector('#panelsToggle').click()");
        const cardCheck = await window.webContents.executeJavaScript(`(async () => {
            const oldToast = toast.message;
            const oldPrompt = AcasPrompt.prompt;
            const messages = [];
            toast.message = text => messages.push(text);
            AcasPrompt.prompt = async () => null;
            try {
                const engine = { engineId: 'fixture', name: 'engine.exe', title: 'Engine',
                    path: 'C:\\\\engines\\\\engine.exe' };
                await renderEngineGrid([engine]);
                const card = document.querySelector('.engine-card');
                const icon = card.querySelector('.engine-card-icon').getBoundingClientRect();
                const title = card.querySelector('.engine-card-title').getBoundingClientRect();
                const idle = {
                    text: card.innerText,
                    width: card.getBoundingClientRect().width,
                    height: card.getBoundingClientRect().height,
                    status: card.querySelector('.engine-status').textContent,
                    statusClip: getComputedStyle(card.querySelector('.engine-status')).clipPath,
                    label: card.getAttribute('aria-label'),
                    sameRow: title.left >= icon.right && Math.abs(
                        (title.top + title.bottom) / 2 - (icon.top + icon.bottom) / 2) < 2
                };
                card.click();
                card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                card.querySelector('.edit-btn').click();
                const afterEdit = messages.length;
                refreshEngineCards(Array.from({ length: 4 }, (_, i) => ({ identifierObj: {
                    engineId: 'fixture', instanceId: String(i), profileName: 'Profile', siteDomain: 'lichess.org'
                } })));
                const list = card.querySelector('.engine-process-list');
                const active = { status: card.querySelector('.engine-status').textContent,
                    label: card.getAttribute('aria-label'),
                    highlighted: card.classList.contains('active'),
                    rows: list.children.length, scrollable: list.scrollHeight > list.clientHeight,
                    killButtons: list.querySelectorAll('.kill-engine-btn').length };
                refreshEngineCards([]);
                return { idle, active, messages, afterEdit, idleListEmpty: !list.children.length };
            } finally {
                toast.message = oldToast;
                AcasPrompt.prompt = oldPrompt;
                await renderEngineGrid([]);
            }
        })()`);
        assert.equal(cardCheck.idle.status, 'Idle');
        assert.equal(cardCheck.idle.statusClip, 'inset(50%)');
        assert.match(cardCheck.idle.label, /Idle/);
        assert.equal(cardCheck.idle.sameRow, true);
        assert.match(cardCheck.idle.text, /Engine[\s\S]*engine\.exe[\s\S]*engines/);
        assert.doesNotMatch(cardCheck.idle.text, /Ready to use from the web GUI/);
        assert.ok(cardCheck.idle.width < 280 && cardCheck.idle.height < 100);
        assert.equal(cardCheck.messages.length, 2);
        assert.equal(cardCheck.afterEdit, 2);
        assert.match(cardCheck.messages[0], /web GUI/);
        assert.deepEqual(cardCheck.active, { status: '4 running', label: 'Engine. 4 running. Press Enter for usage information.',
            highlighted: true, rows: 4, scrollable: true, killButtons: 4 });
        assert.equal(cardCheck.idleListEmpty, true);
        const appStatus = await window.webContents.executeJavaScript('window.aiAPI.getStatus()');
        assert.equal(appStatus.state, 'offline');
        assert.equal(appStatus.setup.installed, false);
        socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://localhost' });
        await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
        const command = payload => new Promise((resolve, reject) => {
            const cleanup = () => { socket.removeListener('message', onMessage); socket.removeListener('error', onError); };
            const onError = error => { cleanup(); reject(error); };
            const onMessage = data => {
                const message = JSON.parse(data.toString());
                if(message.requestId !== payload.requestId) return;
                cleanup();
                resolve(message);
            };
            socket.on('error', onError);
            socket.on('message', onMessage);
            socket.send(JSON.stringify(payload));
        });
        const status = await command({ type: 'ai', action: 'status', requestId: 'smoke' });
        assert.equal(status.phase, 'status');
        assert.equal(status.state, 'offline');
        assert.equal(status.executablePath, undefined);
        assert.equal(status.apiKey, undefined);
        const rejected = await command({ type: 'ai', action: 'start', requestId: 'attack', executablePath: process.execPath });
        assert.equal(rejected.phase, 'error');
        assert.equal((await window.webContents.executeJavaScript('window.aiAPI.getStatus()')).state, 'offline');
        const blocked = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'https://untrusted.example' });
        await new Promise((resolve, reject) => { blocked.once('error', resolve); blocked.once('open', () => reject(new Error('Untrusted origin accepted'))); });
        blocked.terminate();
        const reload = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Renderer did not recover.')), 10000);
            window.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
        });
        window.webContents.forcefullyCrashRenderer();
        await reload;
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#serverConnectionInfo').nextElementSibling.id"), 'open-local-ai');
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('#local-ai').open"), false);
        assert.match(await window.webContents.executeJavaScript("document.querySelector('#acas-toast-container').textContent"), /reloaded/);
        assert.equal((await command({ type: 'ai', action: 'status', requestId: 'after-recovery' })).phase, 'status');
        if(process.env.ACAS_AI_NATIVE_SMOKE === '1') {
            const nativeSettings = {
                ...AI_DEFAULTS, context: process.env.ACAS_AI_PCF_SMOKE === '1' ? 8192 : 2048,
                backend: process.env.ACAS_AI_NATIVE_EXECUTABLE ? 'cuda' : 'auto',
                executablePath: process.env.ACAS_AI_NATIVE_EXECUTABLE
                    || path.join(process.env.USERPROFILE, 'Desktop', 'Pena-chat', 'model-chat', 'assets', 'runtime', 'llama-server.exe'),
                modelPath: process.env.ACAS_AI_NATIVE_MODEL
            };
            await window.webContents.executeJavaScript(`window.aiAPI.start(${JSON.stringify(nativeSettings)})`);
            let loaded;
            for(let tries = 0; tries < 600; tries++) {
                loaded = await window.webContents.executeJavaScript('window.aiAPI.getStatus()');
                if(loaded.state !== 'loading' && !loaded.setup.busy) break;
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            assert.equal(loaded.ready, true, loaded.error || loaded.setup.error);
            if(process.env.ACAS_AI_NATIVE_EXECUTABLE) {
                const { localAIHost } = await import('../../appServer/backend/server.js');
                const pid = localAIHost.child.pid;
                const gpuRows = execFileSync('nvidia-smi',
                    ['--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits'],
                    { encoding: 'utf8', timeout: 10000, windowsHide: true });
                const ownRow = gpuRows.split(/\r?\n/).find(row => Number(row.split(',')[0]) === pid);
                assert.ok(ownRow, 'The owned native process must be registered on the CUDA GPU.');
                console.log(JSON.stringify({ marker: 'NATIVE_AI_CUDA_OK', pid, gpuMemory: ownRow.split(',')[1]?.trim() }));
            }
            const request = (payload, onChunk = () => {}, timeoutMs = 60000) => new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    socket.send(JSON.stringify({ type: 'ai', action: 'cancel', requestId: payload.requestId }));
                    cleanup();
                    reject(new Error('Native request exceeded its bounded deadline.'));
                }, timeoutMs);
                const cleanup = () => { clearTimeout(timer); socket.removeListener('message', onMessage); };
                const onMessage = data => {
                    const result = JSON.parse(data.toString());
                    if(result.requestId !== payload.requestId) return;
                    if(result.phase === 'chunk') { onChunk(result.chunk); return; }
                    cleanup();
                    if(result.phase === 'error') {
                        console.log(JSON.stringify({ marker: 'NATIVE_AI_REQUEST_ERROR', ...result }));
                        reject(new Error(result.error));
                    } else resolve(result);
                };
                socket.on('message', onMessage);
                socket.send(JSON.stringify(payload));
            });
            const messages = [{ role: 'user', content: 'Hello! Please greet me in one short sentence.' }];
            const kwargs = { enable_thinking: false };
            if(process.env.ACAS_AI_NATIVE_SKIP_GREETING !== '1') {
                const info = await request({ type: 'ai', action: 'promptInfo', requestId: 'native-count',
                    messages, chat_template_kwargs: kwargs });
                let timings, progress = 0;
                const generated = await request({ type: 'ai', action: 'generate', requestId: 'native-greeting',
                    options: { messages, max_tokens: 512, temperature: 0.6,
                        reasoning_budget_tokens: 0, reasoning_effort: 'none',
                        chat_template_kwargs: kwargs, return_progress: true } }, chunk => {
                    if(chunk.timings) timings = chunk.timings;
                    if(chunk.prompt_progress) progress++;
                });
                assert.ok(generated.text.trim().length, 'Native greeting produced no visible answer.');
                assert.equal(generated.finishReason, 'stop', 'Native greeting exhausted its token budget.');
                if(generated.usage) assert.equal(info.tokens, generated.usage.prompt_tokens, 'Template count must match actual native prompt tokens.');
                console.log(JSON.stringify({
                    marker: 'NATIVE_AI_GREETING_OK', model: loaded.model, capabilities: loaded.capabilities,
                    promptTokens: info.tokens, visibleText: generated.text,
                    finishReason: generated.finishReason, progressChunks: progress, usage: generated.usage, timings
                }));
            }
            if(process.env.ACAS_AI_PCF_SMOKE === '1') {
                const { developmentCases } = await import('../../app/assets/engines/pena-v2/tests/cases.js');
                const { engineCoachingEvidence, groundedCoachingInput } = await import('../../app/assets/engines/pena-v2/engine-coaching-input.js');
                const { pcfCoachingInput } = await import('../../app/assets/engines/pena-v2/pcf-input.js');
                const fixture = developmentCases.find(item => item.id === 'italian-2');
                const history = fixture.history;
                const move = 'c2c3';
                const snapshot = {
                    schema: 'pena-v2-search/1', fen: fixture.fen, history,
                    perspective: 'root-side-to-move', budget: { nodes: 128, moves: [] },
                    engine: { networkSha256: 'a'.repeat(64), precision: 'f32', backend: 'webgpu' },
                    bestMove: move, lines: [{ pv: [move, 'g8f6', 'd2d4', 'e5d4', 'c3d4', 'c5b6'] }],
                    candidates: [{ move, visits: 64, policyPrior: 0.5, search: { q: 0.1 } }]
                };
                const input = groundedCoachingInput({
                    fen: fixture.fen, history, playerColor: fixture.playerColor,
                    question: fixture.question, maxPlies: 6,
                    engineEvidence: engineCoachingEvidence({ snapshot, maxPlies: 6 })
                });
                const pcf = pcfCoachingInput(input, {
                    playerColor: fixture.playerColor, history, inkling: true, tokenCount: () => 1
                });
                const pcfOptions = {
                    messages: pcf.messages, max_tokens: process.env.ACAS_AI_PCF_MAX_TOKENS ? Number(process.env.ACAS_AI_PCF_MAX_TOKENS) : 256, temperature: 0.6,
                    reasoning_budget_tokens: 0, reasoning_effort: 'none',
                    chat_template_kwargs: kwargs, return_progress: true
                };
                const pcfInfo = await request({ type: 'ai', action: 'promptInfo', requestId: 'native-pcf-count', options: pcfOptions });
                console.log(JSON.stringify({ marker: 'NATIVE_AI_PCF_COUNT', tokens: pcfInfo.tokens, context: pcfInfo.context }));
                assert.ok(pcfInfo.tokens + pcfOptions.max_tokens < 8192, 'Fixture must fit the selected native context.');
                let pcfTimings, pcfProgress = 0, reasoningChunks = 0, reasoningCharacters = 0, visibleChunks = 0;
                const pcfStarted = performance.now();
                const pcfResult = await request({ type: 'ai', action: 'generate', requestId: 'native-pcf', options: pcfOptions }, chunk => {
                    if(chunk.timings) pcfTimings = chunk.timings;
                    if(chunk.prompt_progress) pcfProgress++;
                    const delta = chunk.choices?.[0]?.delta || {};
                    if(delta.reasoning_content) { reasoningChunks++; reasoningCharacters += delta.reasoning_content.length; }
                    if(delta.content) visibleChunks++;
                }, 180000);
                if(pcfResult.usage) assert.equal(pcfInfo.tokens, pcfResult.usage.prompt_tokens);
                console.log(JSON.stringify({
                    marker: pcfResult.text.trim() ? 'NATIVE_AI_PCF_OK' : 'NATIVE_AI_PCF_EMPTY', fixture: fixture.id,
                    promptTokens: pcfInfo.tokens, context: 8192,
                    totalMs: Math.round(performance.now() - pcfStarted),
                    outputCharacters: pcfResult.text.length, finishReason: pcfResult.finishReason,
                    progressChunks: pcfProgress, usage: pcfResult.usage, timings: pcfTimings,
                    requestedReasoningBudget: 0, effectiveReasoningBudget: loaded.capabilities.noThinkingBudgetTokens,
                    reasoningChunks, reasoningCharacters, visibleChunks,
                    visibleAnswer: pcfResult.text,
                    latencyOnly: true, searchSource: 'existing-test-style synthetic snapshot'
                }));
                assert.ok(pcfResult.text.trim().length, 'Native PCF request produced no visible answer.');
                if(process.env.ACAS_AI_PCF_MAX_TOKENS)
                    assert.equal(pcfResult.finishReason, 'stop', 'Native PCF request must return a final reply within its token budget.');
            }
            await window.webContents.executeJavaScript('window.aiAPI.stop()');
        }
        console.log('NATIVE_AI_ELECTRON_OK');
    } catch(error) {
        if(process.env.ACAS_AI_NATIVE_SMOKE === '1')
            console.log(JSON.stringify({ marker: 'NATIVE_AI_VALIDATION_ERROR', error: error.message }));
        console.error(error);
        process.exitCode = 1;
    } finally {
        socket?.terminate();
        app.quit();
    }
});
