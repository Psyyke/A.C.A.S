import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeAIHost, AI_DEFAULTS, normalizeAISettings, buildLlamaArgs, vramModeFor, parseDeviceMemory,
    validateChatOptions, attachAIClient, readGGUFModelInfo, normalizeNativeReasoning } from '../appServer/backend/nativeAI.js';
import { parseClientMessage } from '../appServer/backend/uciCommand.js';

const settings = {
    ...AI_DEFAULTS, executablePath: path.resolve('llama-server.exe'),
    modelPath: path.resolve('Inkling.gguf'), loraPath: path.resolve('adapter.gguf')
};
const chat = { messages: [{ role: 'user', content: 'Test' }], max_tokens: 32 };
const jsonResponse = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

function fakeChild() {
    const child = new EventEmitter();
    child.pid = 12345;
    child.exitCode = null;
    child.signalCode = null;
    child.kills = [];
    child.kill = signal => {
        child.kills.push(signal);
        child.signalCode = signal;
        queueMicrotask(() => child.emit('exit', null, signal));
        return true;
    };
    return child;
}

function makeHost(overrides = {}) {
    const children = [], calls = [];
    const host = new NativeAIHost({
        validateFiles: async () => {}, getPort: async () => 49152, pollInterval: 1,
        startupTimeout: 50, readGpuMemory: async () => 16376,
        spawnProcess: (executable, args, options) => {
            const child = fakeChild();
            children.push(child);
            calls.push({ executable, args, options });
            return child;
        },
        fetchLocal: async url => url.endsWith('/props')
            ? jsonResponse({ default_generation_settings: { n_ctx: 4096 } })
            : jsonResponse({ status: 'ok' }),
        ...overrides
    });
    return { host, children, calls };
}

test('native startup uses loopback, private key, GGUF LoRA and GPU flags; stop owns its child', async () => {
    const { host, children, calls } = makeHost();
    const status = await host.start(settings);
    assert.equal(status.state, 'ready');
    assert.equal(status.context, 4096);
    assert.equal(status.model, 'Inkling.gguf');
    assert.equal(status.lora, 'adapter.gguf');
    assert.equal(status.capabilities.inkling, true);
    assert.ok(!JSON.stringify(status).includes(settings.modelPath));
    assert.ok(!JSON.stringify(status).includes(host.apiKey));
    const { args, options } = calls[0];
    assert.equal(args[args.indexOf('--host') + 1], '127.0.0.1');
    assert.equal(args[args.indexOf('--lora') + 1], settings.loraPath);
    assert.equal(args[args.indexOf('--alias') + 1], 'Inkling.gguf');
    assert.equal(args[args.indexOf('--flash-attn') + 1], 'auto');
    assert.ok(args.includes('--log-disable') && args.includes('--offline'));
    assert.equal(options.stdio, 'ignore');
    assert.equal(options.shell, false);
    assert.ok(Object.keys(options.env).every(key => !/^LLAMA_/i.test(key)));
    await host.stop();
    assert.deepEqual(children[0].kills, ['SIGTERM']);
    assert.equal(host.status().state, 'offline');
});

test('startup health timeout, early exit retries, unexpected exit and immediate cancellation', async () => {
    const timed = makeHost({ startupTimeout: 10, fetchLocal: async () => new Response(null, { status: 503 }) });
    assert.match((await timed.host.start(settings)).error, /timed out/);
    assert.deepEqual(timed.children[0].kills, ['SIGTERM']);
    const failedChildren = [];
    const failed = makeHost({ spawnProcess: () => {
        const child = fakeChild();
        failedChildren.push(child);
        queueMicrotask(() => { child.exitCode = 1; child.emit('exit', 1, null); });
        return child;
    } });
    assert.equal((await failed.host.start(settings)).state, 'offline');
    assert.equal(failedChildren.length, 3);
    const exited = makeHost();
    await exited.host.start(settings);
    exited.children[0].exitCode = 2;
    exited.children[0].emit('exit', 2, null);
    assert.match(exited.host.status().error, /exited \(2\)/);
    const cancelled = makeHost();
    const start = cancelled.host.start(settings);
    await cancelled.host.stop();
    await start;
    assert.equal(cancelled.children.length, 0);
});

test('VRAM detection reads the runtime device list and skips integrated GPUs', () => {
    const list = lines => `Available devices:\n${lines.map(line => `  ${line}\n`).join('')}`;
    const uma = (index, value) => `ggml_vulkan: ${index} = GPU (Vendor) | uma: ${value} | rebar: 0 |`;
    assert.equal(parseDeviceMemory(list(['Vulkan0: NVIDIA (16061 MiB, 15293 MiB free)',
        'Vulkan1: AMD Radeon(TM) Graphics (16480 MiB, 15656 MiB free)']), `${uma(0, 0)}\n${uma(1, 1)}`), 16061);
    assert.equal(parseDeviceMemory(list(['Vulkan0: Intel UHD (8000 MiB, 7000 MiB free)',
        'Vulkan1: AMD Radeon RX 7600 (8176 MiB, 7900 MiB free)']), `${uma(0, 1)}\n${uma(1, 0)}`), 8176);
    assert.equal(parseDeviceMemory(list(['Vulkan0: Intel Iris Xe (7900 MiB, 7000 MiB free)']), uma(0, 1)), 7900);
    assert.equal(parseDeviceMemory(list(['MTL0: Apple M2 Pro (21845 MiB, 21845 MiB free)']), ''), 21845);
    assert.equal(parseDeviceMemory(list(['(none)']), ''), 0);
    assert.equal(parseDeviceMemory('', ''), null);
    for(const [total, mode] of [[null, null], [0, 'fast'], [16376, 'fast'], [12282, '12'], [11264, '12'],
        [10240, '10'], [8188, '8'], [6144, '6']]) assert.equal(vramModeFor(total), mode);
    assert.throws(() => normalizeAISettings({ vramMode: '7' }), /VRAM/);
    assert.equal(normalizeAISettings({}).vramMode, 'auto');
    const fast = buildLlamaArgs(settings, 1, 'k');
    assert.ok(!fast.includes('--n-cpu-moe') && !fast.includes('--cache-type-k'));
    const eight = buildLlamaArgs(settings, 1, 'k', '8');
    assert.equal(eight[eight.indexOf('--n-cpu-moe') + 1], '16');
    assert.ok(eight.includes('--no-op-offload'));
    assert.ok(!buildLlamaArgs({ ...settings, backend: 'cpu' }, 1, 'k', '8').includes('--n-cpu-moe'));
});

test('automatic VRAM mode follows the card, guesses safely and steps down after a load failure', async () => {
    const cpuMoe = args => args.includes('--n-cpu-moe') ? args[args.indexOf('--n-cpu-moe') + 1] : null;
    const paths = [];
    const twelve = makeHost({ readGpuMemory: async executable => { paths.push(executable); return 12282; } });
    const status = await twelve.host.start(settings);
    assert.equal(cpuMoe(twelve.calls[0].args), '6');
    assert.deepEqual([status.vramMode, status.vramAuto, status.vramGuessed, paths[0]], ['12', true, false, settings.executablePath]);
    await twelve.host.stop();

    const other = makeHost({ readGpuMemory: async () => 6144 });
    await other.host.start({ ...settings, modelPath: path.resolve('Qwen.gguf'), loraPath: '' });
    assert.equal(cpuMoe(other.calls[0].args), null);
    await other.host.stop();

    const manual = makeHost({ readGpuMemory: async () => 16376 });
    await manual.host.start({ ...settings, vramMode: '10' });
    assert.equal(cpuMoe(manual.calls[0].args), '24');
    await manual.host.stop();

    const unknown = makeHost({ readGpuMemory: async () => null });
    assert.equal((await unknown.host.start(settings)).vramGuessed, true);
    assert.equal(cpuMoe(unknown.calls[0].args), '16');
    assert.ok(unknown.calls[0].args.includes('--no-op-offload'));
    await unknown.host.stop();

    // The first child answers /health while loading, then dies like an out of memory load.
    let spawned = 0;
    const children = [];
    const oom = makeHost({
        spawnProcess: (executable, args) => {
            const child = fakeChild();
            child.args = args;
            child.loading = spawned++ === 0;
            children.push(child);
            return child;
        },
        fetchLocal: async url => {
            const child = children.at(-1);
            if(child.loading) {
                setTimeout(() => { child.exitCode = 1; child.emit('exit', 1, null); }, 5);
                child.loading = false;
                child.dying = true;
            }
            if(child.dying) return new Response(null, { status: 503 });
            return url.endsWith('/props') ? jsonResponse({ default_generation_settings: { n_ctx: 8192 } })
                : jsonResponse({ status: 'ok' });
        }
    });
    const stepped = await oom.host.start(settings);
    assert.equal(stepped.state, 'ready');
    assert.equal(stepped.vramMode, '12');
    assert.deepEqual(children.map(child => cpuMoe(child.args)), [null, '6']);
    await oom.host.stop();
    children.length = 0;
    await oom.host.start(settings);
    assert.equal(cpuMoe(children[0].args), '6');
    await oom.host.stop();
});

test('settings and chat options reject launch/file options and preserve bounded reasoning kwargs', () => {
    assert.throws(() => normalizeAISettings({ executablePath: 'relative.exe' }), /absolute/);
    assert.throws(() => normalizeAISettings({ context: 0 }), /context/);
    const args = buildLlamaArgs({ ...settings, backend: 'cpu' }, 1234, 'secret');
    assert.equal(args[args.indexOf('--n-gpu-layers') + 1], '0');
    for(const key of ['executablePath', 'modelPath', 'lora', 'grammar_file', 'url'])
        assert.throws(() => validateChatOptions({ ...chat, [key]: 'untrusted' }), /Unsupported/);
    assert.throws(() => validateChatOptions({ ...chat, max_tokens: 8193 }), /limit/);
    assert.throws(() => validateChatOptions({ messages: [{ role: 'user', content: [{ type: 'image_url' }] }] }), /text/);
    const options = validateChatOptions({
        ...chat, model: 'ignored', stream: false, cache_prompt: true,
        chat_template_kwargs: { enable_thinking: false }, reasoning_effort: 'none',
        reasoning_budget_tokens: 0, return_progress: true
    });
    assert.equal(options.stream, true);
    assert.equal(options.cache_prompt, false);
    assert.equal(options.model, undefined);
    assert.equal(options.reasoning_budget_tokens, 0);
    assert.deepEqual(options.chat_template_kwargs, { enable_thinking: false });
    const payload = JSON.stringify({ type: 'ai', action: 'generate', requestId: 'chat',
        options: { messages: [{ role: 'user', content: 'x'.repeat(8000) }] } });
    assert.equal(parseClientMessage(payload).type, 'ai');
    assert.throws(() => parseClientMessage(JSON.stringify({ type: 'getEngines', padding: 'x'.repeat(8000) })), /too long/);
});

test('renamed Inkling GGUF is identified from embedded identity, not its filename or LoRA', async () => {
    const file = path.resolve('appServer', `.native-ai-metadata-${randomUUID()}.gguf`);
    const encodeString = value => {
        const bytes = Buffer.from(value);
        const length = Buffer.alloc(8);
        length.writeBigUInt64LE(BigInt(bytes.length));
        return Buffer.concat([length, bytes]);
    };
    const values = {
        'general.architecture': 'inkling2_loop',
        'general.name': 'A renamed local model',
        'tokenizer.chat_template': '{{ enable_thinking }}'
    };
    const header = Buffer.alloc(24);
    header.write('GGUF');
    header.writeUInt32LE(3, 4);
    header.writeBigUInt64LE(BigInt(Object.keys(values).length), 16);
    const stringType = Buffer.alloc(4);
    stringType.writeUInt32LE(8);
    await writeFile(file, Buffer.concat([header, ...Object.entries(values).flatMap(([key, value]) =>
        [encodeString(key), stringType, encodeString(value)])]));
    try {
        const metadata = await readGGUFModelInfo(file);
        assert.equal(metadata.inkling, true);
        assert.equal(metadata.architecture, 'inkling2_loop');
        assert.equal(metadata.identitySource, 'gguf-metadata');
        const { host } = makeHost({ readModelInfo: async () => metadata });
        await host.start({ ...settings, modelPath: path.resolve('atomic-iq2-m.gguf') });
        assert.equal(host.status().capabilities.inkling, true);
        assert.equal(host.status().modelInfo.templateFamily, 'inkling');
        assert.equal(host.status().capabilities.noThinkingBudgetTokens, 16);
        await host.stop();
    } finally { await rm(file, { force: true }); }
});

test('Inkling zero-reasoning requests use its actual template control without hiding the answer', () => {
    const requested = validateChatOptions({
        ...chat, reasoning_effort: 'none', reasoning_budget_tokens: 0,
        chat_template_kwargs: { enable_thinking: false, other_template_option: 2 }
    });
    const normalized = normalizeNativeReasoning(requested, { inkling: true });
    assert.equal(normalized.reasoning_effort, undefined);
    assert.equal(normalized.reasoning_budget_tokens, 0);
    assert.deepEqual(normalized.chat_template_kwargs, { other_template_option: 2, reasoning_effort: 'none' });
    assert.deepEqual(requested.messages, chat.messages, 'The supplied conversation must not be mutated.');
    const promptOptions = normalizeNativeReasoning(validateChatOptions({
        ...chat, chat_template_kwargs: { enable_thinking: false, other_template_option: 2 }
    }), { inkling: true });
    assert.deepEqual(promptOptions.chat_template_kwargs, normalized.chat_template_kwargs);
    assert.equal(promptOptions.reasoning_budget_tokens, normalized.reasoning_budget_tokens);
    assert.deepEqual(promptOptions.messages, normalized.messages);
    assert.equal(normalizeNativeReasoning(requested, { inkling: false }), requested);
});

test('only metadata-identified loop Inkling gets sixteen-token no-thinking headroom in both schemas', () => {
    const options = validateChatOptions({
        ...chat, reasoning_effort: 'none', reasoning_budget_tokens: 0,
        chat_template_kwargs: { enable_thinking: false }
    });
    const metadata = { inkling: true, architecture: 'inkling2_loop' };
    const generate = normalizeNativeReasoning(options, metadata);
    const count = normalizeNativeReasoning(validateChatOptions({
        ...chat, chat_template_kwargs: { enable_thinking: false }
    }), metadata);
    assert.equal(generate.reasoning_budget_tokens, 16);
    assert.equal(count.reasoning_budget_tokens, 16);
    assert.deepEqual(generate.messages, options.messages);
    assert.deepEqual(generate.chat_template_kwargs, { reasoning_effort: 'none' });
    assert.equal(normalizeNativeReasoning(options, { inkling: true, architecture: 'inkling2' }).reasoning_budget_tokens, 0);
    assert.equal(normalizeNativeReasoning(options, { inkling: false, architecture: 'other_loop' }).reasoning_budget_tokens, 0);
});

test('empty native answers fail explicitly and retain usage/timing diagnostics over WebSocket', async () => {
    const usage = { prompt_tokens: 5000, completion_tokens: 256 };
    const timings = { prompt_n: 5000, prompt_ms: 6000, predicted_ms: 4000 };
    const { host } = makeHost({ fetchLocal: async url => url.endsWith('/v1/chat/completions')
        ? new Response(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }], usage, timings })}\n\ndata: [DONE]\n\n`)
        : jsonResponse({ status: 'ok' }) });
    await host.start(settings);
    const socket = new FakeSocket();
    const handle = attachAIClient(socket, host);
    await handle({ action: 'generate', requestId: 'empty', options: chat });
    const error = socket.messages.at(-1);
    assert.equal(error.phase, 'error');
    assert.equal(error.code, 'NO_VISIBLE_ANSWER');
    assert.deepEqual(error.usage, usage);
    assert.deepEqual(error.timings, timings);
    assert.equal(error.finishReason, 'length');
    assert.equal(host.requests.size, 0);
    socket.close();
    await host.stop();
});

test('raw split UTF-8 SSE preserves reasoning, progress, usage and timings without displaying reasoning', async () => {
    const chunks = [
        { choices: [{ delta: { reasoning_content: 'private thought' } }] },
        { prompt_progress: { total: 8, processed: 4, cache: 0, time_ms: 5 } },
        { choices: [{ delta: { content: 'Héllo' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 8, completion_tokens: 2 }, timings: { predicted_ms: 3 } }
    ];
    const bytes = new TextEncoder().encode(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\r\n\r\n`).join('') + 'data: [DONE]\n\n');
    const { host } = makeHost({ fetchLocal: async url => url.endsWith('/v1/chat/completions')
        ? new Response(new ReadableStream({ start(controller) {
            for(let offset = 0; offset < bytes.length; offset += 3) controller.enqueue(bytes.slice(offset, offset + 3));
            controller.close();
        } })) : jsonResponse({ status: 'ok' }) });
    await host.start(settings);
    const emitted = [];
    const complete = await host.generate(chat, chunk => emitted.push(chunk));
    assert.deepEqual(emitted.map(value => value.chunk), chunks);
    assert.equal(complete.text, 'Héllo');
    assert.equal(complete.finishReason, 'stop');
    assert.deepEqual(complete.usage, chunks.at(-1).usage);
    assert.deepEqual(complete.timings, chunks.at(-1).timings);
    assert.equal(host.requests.size, 0);
    await host.stop();
});

test('promptInfo counts the full native chat template with the same kwargs', async () => {
    const posts = [];
    const { host } = makeHost({ fetchLocal: async (url, options) => {
        if(options.method === 'POST') posts.push({ url, body: JSON.parse(options.body) });
        if(url.endsWith('/apply-template')) return jsonResponse({ prompt: '<bos>[USER]Test[ASSISTANT]' });
        if(url.endsWith('/tokenize')) return jsonResponse({ tokens: [1, 2, 3, 4, 5] });
        return jsonResponse({ status: 'ok' });
    } });
    await host.start(settings);
    const result = await host.promptInfo(chat.messages, { enable_thinking: false }, undefined,
        { reasoning_effort: 'none', reasoning_budget_tokens: 0 });
    assert.equal(result.phase, 'promptInfo');
    assert.equal(result.tokens, 5);
    assert.equal(posts[0].body.add_generation_prompt, true);
    assert.deepEqual(posts[0].body.chat_template_kwargs, { enable_thinking: false });
    assert.equal(posts[0].body.reasoning_effort, 'none');
    assert.equal(posts[0].body.reasoning_budget_tokens, 0);
    assert.deepEqual(posts[1].body, { content: '<bos>[USER]Test[ASSISTANT]', add_special: false });
    assert.equal(result.prompt, undefined);
    await host.stop();
});

test('broken native SSE rejects, generation cancellation aborts fetch and clears active state', async () => {
    let abortObserved = false;
    const broken = makeHost({ fetchLocal: async url => url.endsWith('/v1/chat/completions')
        ? new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')
        : jsonResponse({ status: 'ok' }) });
    await broken.host.start(settings);
    await assert.rejects(broken.host.generate(chat, () => {}), /ended unexpectedly/);
    await broken.host.stop();
    const pending = makeHost({ fetchLocal: async (url, options) => {
        if(!url.endsWith('/v1/chat/completions')) return jsonResponse({ status: 'ok' });
        return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
            abortObserved = true;
            reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true }));
    } });
    await pending.host.start(settings);
    const controller = new AbortController();
    const promise = pending.host.generate(chat, () => {}, controller.signal);
    await assert.rejects(pending.host.generate(chat, () => {}), /busy/);
    controller.abort();
    await assert.rejects(promise, /Aborted/);
    assert.equal(abortObserved, true);
    assert.equal(pending.host.requests.size, 0);
    await pending.host.stop();
});

class FakeSocket extends EventEmitter {
    constructor() { super(); this.readyState = 1; this.bufferedAmount = 0; this.messages = []; }
    send(data) { this.messages.push(JSON.parse(data)); }
    close() { this.readyState = 3; this.emit('close'); }
}

test('WebSocket AI has per-client requests, status pushes, explicit cancellation and disconnect cleanup', async () => {
    const host = new EventEmitter();
    host.status = () => ({ state: 'ready', context: 8192 });
    host.generate = (_options, emit, signal) => {
        emit({ phase: 'chunk', chunk: { choices: [{ delta: { content: 'one' } }] } });
        return new Promise((_resolve, reject) => signal.addEventListener('abort',
            () => reject(new Error('aborted')), { once: true }));
    };
    host.promptInfo = async () => ({ phase: 'promptInfo', tokens: 9, context: 8192 });
    const socket = new FakeSocket(), other = new FakeSocket();
    const handle = attachAIClient(socket, host), otherHandle = attachAIClient(other, host);
    await handle({ action: 'status', requestId: 's' });
    assert.equal(socket.messages[0].type, 'ai');
    assert.equal(socket.messages[0].state, 'ready');
    await handle({ action: 'promptInfo', requestId: 'p', messages: chat.messages });
    assert.equal(socket.messages.at(-1).tokens, 9);
    const request = handle({ action: 'generate', requestId: 'g', options: chat });
    await otherHandle({ action: 'cancel', requestId: 'g' });
    assert.equal(socket.messages.at(-1).phase, 'chunk');
    await handle({ action: 'cancel', requestId: 'g' });
    await request;
    assert.equal(socket.messages.at(-1).cancelled, true);
    host.emit('status', { state: 'offline' });
    assert.equal(socket.messages.at(-1).requestId, null);
    const disconnectRequest = handle({ action: 'generate', requestId: 'disconnect', options: chat });
    socket.close();
    await disconnectRequest;
    other.close();
    assert.equal(host.listenerCount('status'), 0);
});

test('real Electron UI exposes AI IPC and existing WebSocket serves AI without exposing configuration', { timeout: 45000 }, async () => {
    const require = createRequire(new URL('../appServer/package.json', import.meta.url));
    const directory = path.resolve('appServer', `.native-ai-test-${randomUUID()}`);
    await mkdir(directory);
    const env = { ...process.env, ACAS_AI_TEST_DIRECTORY: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [fileURLToPath(new URL('./fixtures/native-ai-electron.mjs', import.meta.url))], {
        cwd: path.resolve('appServer'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    const timer = setTimeout(() => child.kill('SIGKILL'), 40000);
    try {
        const code = await new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('close', resolve);
        });
        assert.equal(code, 0, `${stdout}\n${stderr}`);
        assert.match(stdout, /NATIVE_AI_ELECTRON_OK/, stderr);
    } finally {
        clearTimeout(timer);
        if(child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await rm(directory, { recursive: true, force: true });
    }
});
