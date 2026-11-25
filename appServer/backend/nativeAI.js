import { EventEmitter } from 'node:events';
import { execFile, spawn } from 'node:child_process';
import { access, open, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const AI_DEFAULTS = Object.freeze({
    executablePath: '', modelPath: '', loraPath: '', backend: 'auto',
    context: 8192, gpuLayers: 99, threads: 0, vramMode: 'auto'
});

// Measured with Inkling IQ2_M, ZONOS3 and a rank 64 attention LoRA running together
// (see appServer/PENA-12GB-PLAN.md). Smaller modes keep more expert weights in RAM.
const LOW_VRAM_BASE = ['--batch-size', '1024', '--ubatch-size', '256',
    '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0', '--load-mode', 'none'];
export const VRAM_MODES = Object.freeze({
    fast: [],
    12: [...LOW_VRAM_BASE, '--n-cpu-moe', '6'],
    10: [...LOW_VRAM_BASE, '--n-cpu-moe', '24'],
    8: [...LOW_VRAM_BASE, '--n-cpu-moe', '16', '--no-op-offload'],
    6: [...LOW_VRAM_BASE, '--n-cpu-moe', '24', '--no-op-offload']
});
const VRAM_ORDER = ['fast', '12', '10', '8', '6'];

// null means unknown. 0 means llama-server sees no GPU, so there is nothing to shrink.
export function vramModeFor(totalMiB) {
    if(totalMiB === null || totalMiB === undefined) return null;
    if(totalMiB === 0 || totalMiB >= 14000) return 'fast';
    if(totalMiB >= 11000) return '12';
    if(totalMiB >= 9500) return '10';
    if(totalMiB >= 7500) return '8';
    return '6';
}

// Integrated GPUs (Vulkan "uma: 1") are skipped when a discrete one exists, like llama.cpp does.
export function parseDeviceMemory(stdout, stderr) {
    if(!String(stdout).includes('Available devices:')) return null;
    const integrated = new Set([...String(stderr).matchAll(/ggml_vulkan: (\d+) = .*\| uma: 1 \|/g)]
        .map(match => `Vulkan${match[1]}`));
    const devices = [...String(stdout).matchAll(/^\s+(\S+): .+ \((\d+) MiB, \d+ MiB free\)\s*$/gm)]
        .map(([, name, total]) => ({ name, totalMiB: Number(total), integrated: integrated.has(name) }));
    const discrete = devices.filter(device => !device.integrated);
    return Math.max(0, ...(discrete.length ? discrete : devices).map(device => device.totalMiB));
}

function readNvidiaMemory() {
    return new Promise(resolve => execFile('nvidia-smi',
        ['--query-gpu=memory.total', '--format=csv,noheader,nounits'],
        { timeout: 8000, windowsHide: true },
        (error, stdout) => resolve(error ? null : Number(String(stdout).split(/\r?\n/)[0]) || null)));
}

export function detectGpuMemory(executablePath) {
    return new Promise(resolve => execFile(executablePath, ['--verbose', '--list-devices'],
        { cwd: path.dirname(executablePath), env: runtimeEnvironment(executablePath),
            timeout: 15000, windowsHide: true, maxBuffer: 1 << 20 },
        (error, stdout, stderr) => resolve(parseDeviceMemory(stdout, stderr))))
        .then(total => total ?? readNvidiaMemory());
}

export function normalizeAISettings(settings) {
    if(!settings || typeof settings !== 'object' || Array.isArray(settings))
        throw new Error('Invalid AI settings.');
    const result = { ...AI_DEFAULTS };
    for(const key of ['executablePath', 'modelPath', 'loraPath']) {
        if(settings[key] === undefined) continue;
        if(typeof settings[key] !== 'string' || settings[key].length > 4096
            || settings[key].includes('\0') || (settings[key] && !path.isAbsolute(settings[key])))
            throw new Error(`Invalid ${key}. Choose an absolute local file path.`);
        result[key] = settings[key];
    }
    if(settings.backend !== undefined) result.backend = settings.backend;
    if(!['auto', 'cpu', 'cuda', 'vulkan', 'metal'].includes(result.backend))
        throw new Error('Unknown AI backend.');
    for(const [key, min, max] of [['context', 512, 131072], ['gpuLayers', 0, 999], ['threads', 0, 256]]) {
        if(settings[key] !== undefined) result[key] = settings[key];
        if(!Number.isInteger(result[key]) || result[key] < min || result[key] > max)
            throw new Error(`Invalid ${key}: expected ${min}–${max}.`);
    }
    if(settings.vramMode !== undefined) result.vramMode = settings.vramMode;
    if(result.vramMode !== 'auto' && !Object.hasOwn(VRAM_MODES, result.vramMode))
        throw new Error('Unknown VRAM mode.');
    return result;
}

export function inferAIBackend(settings) {
    if(settings.backend !== 'auto') return settings.backend;
    const name = settings.executablePath.toLowerCase();
    return ['cuda', 'vulkan', 'metal'].find(backend => name.includes(backend)) || 'executable';
}

export async function readGGUFModelInfo(filePath) {
    const metadata = {};
    const file = await open(filePath, 'r');
    try {
        // Read only bounded metadata, never tensor weights. Unknown/malformed GGUF
        // metadata is a missing hint; llama-server remains the compatibility authority.
        const buffer = Buffer.alloc(Math.min((await file.stat()).size, 8388608));
        await file.read(buffer, 0, buffer.length, 0);
        if(buffer.length < 24 || buffer.toString('ascii', 0, 4) !== 'GGUF'
            || ![2, 3].includes(buffer.readUInt32LE(4))) return null;
        let offset = 24;
        const ensure = count => {
            if(!Number.isSafeInteger(count) || count < 0 || offset + count > buffer.length)
                throw new Error('Metadata exceeds the bounded read.');
        };
        const uint32 = () => { ensure(4); const value = buffer.readUInt32LE(offset); offset += 4; return value; };
        const uint64 = () => { ensure(8); const value = Number(buffer.readBigUInt64LE(offset)); offset += 8; return value; };
        const string = decode => {
            const length = uint64();
            ensure(length);
            const value = decode ? buffer.toString('utf8', offset, offset + length) : null;
            offset += length;
            return value;
        };
        const skip = (type, depth = 0) => {
            if(depth > 4) throw new Error('Invalid metadata nesting.');
            const size = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 }[type];
            if(size) { ensure(size); offset += size; }
            else if(type === 8) string(false);
            else if(type === 9) {
                const elementType = uint32(), count = uint64();
                if(!Number.isSafeInteger(count) || count > 1000000) throw new Error('Invalid metadata array.');
                for(let index = 0; index < count; index++) skip(elementType, depth + 1);
            } else throw new Error('Unknown metadata type.');
        };
        const count = Number(buffer.readBigUInt64LE(16));
        if(!Number.isSafeInteger(count) || count > 65536) return null;
        try {
            for(let index = 0; index < count; index++) {
                const key = string(true);
                if(key.length > 1024) break;
                const type = uint32();
                if(type === 8 && (key.startsWith('general.') || key === 'tokenizer.chat_template'))
                    metadata[key] = string(true);
                else skip(type);
            }
        } catch {}
        const identity = ['general.name', 'general.basename', 'general.finetune',
            'general.source.huggingface.repository'].map(key => metadata[key] || '').join(' ');
        const architecture = /^[a-z0-9_-]{1,64}$/i.test(metadata['general.architecture'] || '')
            ? metadata['general.architecture'] : null;
        const inkling = /inkling/i.test(identity) || /^inkling2(?:_loop)?$/i.test(architecture || '');
        const reasoningSupported = /enable_thinking|reasoning_effort|<think>/i.test(metadata['tokenizer.chat_template'] || '')
            ? true : null;
        return {
            architecture, inkling, reasoningSupported,
            templateFamily: inkling ? 'inkling' : architecture || 'unknown',
            identitySource: identity.trim() || architecture ? 'gguf-metadata' : 'unknown'
        };
    } finally { await file.close(); }
}

export function buildLlamaArgs(settings, port, apiKey, vramMode = 'fast') {
    const args = [
        '--host', '127.0.0.1', '--port', String(port),
        '--model', settings.modelPath, '--alias', path.basename(settings.modelPath),
        '--ctx-size', String(settings.context),
        '--n-gpu-layers', String(settings.backend === 'cpu' ? 0 : settings.gpuLayers),
        '--parallel', '1', '--flash-attn', 'auto', '--reasoning-budget', '0',
        '--no-webui', '--log-disable', '--offline', '--jinja', '--api-key', apiKey
    ];
    if(settings.threads) args.push('--threads', String(settings.threads));
    if(settings.loraPath) args.push('--lora', settings.loraPath);
    if(settings.backend !== 'cpu') args.push(...VRAM_MODES[vramMode]);
    return args;
}

// Downloaded Linux and macOS builds keep their shared libraries next to llama-server.
function runtimeEnvironment(executablePath) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^LLAMA_/i.test(key)));
    const directory = path.dirname(executablePath);
    if(process.platform === 'linux') env.LD_LIBRARY_PATH = [directory, env.LD_LIBRARY_PATH].filter(Boolean).join(':');
    if(process.platform === 'darwin') env.DYLD_FALLBACK_LIBRARY_PATH = [directory, env.DYLD_FALLBACK_LIBRARY_PATH].filter(Boolean).join(':');
    return env;
}

async function allocatePort() {
    const probe = createServer();
    await new Promise((resolve, reject) => {
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', resolve);
    });
    const port = probe.address().port;
    await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
    return port;
}

async function checkFiles(settings) {
    if(!settings.executablePath || !settings.modelPath)
        throw new Error('Select a llama-server executable and a GGUF model first.');
    for(const key of ['executablePath', 'modelPath', 'loraPath']) {
        const file = settings[key];
        if(!file) continue;
        let details;
        try { details = await stat(file); }
        catch { throw new Error('A selected AI file is missing or inaccessible. Choose readable local files.'); }
        if(!details.isFile()) throw new Error(`${key} must be a local file.`);
        if(key !== 'executablePath' && path.extname(file).toLowerCase() !== '.gguf')
            throw new Error('Models and LoRA adapters must be GGUF files.');
        if(key === 'executablePath') {
            if(process.platform === 'win32' && path.extname(file).toLowerCase() !== '.exe')
                throw new Error('Choose a native llama-server .exe, not a script.');
            try { await access(file, process.platform === 'win32' ? constants.F_OK : constants.X_OK); }
            catch { throw new Error('The selected native runtime is not executable. Check its permissions.'); }
        }
    }
}

export function validateChatOptions(options, context = AI_DEFAULTS.context) {
    if(!options || typeof options !== 'object' || Array.isArray(options))
        throw new Error('Generate requires chat completion options.');
    const allowed = new Set(['messages', 'max_tokens', 'max_completion_tokens', 'temperature',
        'top_p', 'top_k', 'min_p', 'repeat_penalty', 'presence_penalty', 'frequency_penalty',
        'seed', 'stop', 'stream', 'model', 'cache_prompt', 'chat_template_kwargs',
        'reasoning_effort', 'reasoning_budget_tokens', 'return_progress', 'timings_per_token', 'stream_options']);
    for(const key of Object.keys(options)) {
        if(!allowed.has(key)) throw new Error(`Unsupported chat option: ${key}`);
    }
    if(!Array.isArray(options.messages) || !options.messages.length || options.messages.length > 256)
        throw new Error('Expected 1–256 chat messages.');
    let length = 0;
    const messages = options.messages.map(message => {
        if(!message || !['system', 'user', 'assistant'].includes(message.role)
            || typeof message.content !== 'string')
            throw new Error('Messages require a system, user or assistant role and text content.');
        length += message.content.length;
        return { role: message.role, content: message.content };
    });
    if(length > 450000) throw new Error('Chat messages are too large.');
    const result = { messages, stream: true, stream_options: { include_usage: true }, cache_prompt: false };
    const maxTokens = options.max_completion_tokens ?? options.max_tokens ?? Math.min(2048, context);
    if(!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > Math.min(8192, context))
        throw new Error('Requested output tokens exceed the local limit.');
    result.max_tokens = maxTokens;
    const ranges = {
        temperature: [0, 2], top_p: [0, 1], top_k: [0, 1000], min_p: [0, 1],
        repeat_penalty: [0, 3], presence_penalty: [-2, 2], frequency_penalty: [-2, 2],
        seed: [-1, 2147483647]
    };
    for(const [key, [min, max]] of Object.entries(ranges)) {
        if(options[key] === undefined) continue;
        if(typeof options[key] !== 'number' || !Number.isFinite(options[key])
            || options[key] < min || options[key] > max
            || (['seed', 'top_k'].includes(key) && !Number.isInteger(options[key])))
            throw new Error(`Invalid ${key}.`);
        result[key] = options[key];
    }
    if(options.stop !== undefined) {
        const stops = typeof options.stop === 'string' ? [options.stop] : options.stop;
        if(!Array.isArray(stops) || stops.length > 16
            || stops.some(value => typeof value !== 'string' || value.length > 256))
            throw new Error('Invalid stop sequences.');
        result.stop = stops;
    }
    if(options.chat_template_kwargs !== undefined) {
        const kwargs = options.chat_template_kwargs;
        if(!kwargs || typeof kwargs !== 'object' || Array.isArray(kwargs)
            || Object.keys(kwargs).length > 32 || JSON.stringify(kwargs).length > 8192)
            throw new Error('Invalid chat template kwargs.');
        result.chat_template_kwargs = kwargs;
    }
    if(options.reasoning_effort !== undefined) {
        if(!['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'auto'].includes(options.reasoning_effort))
            throw new Error('Invalid reasoning effort.');
        result.reasoning_effort = options.reasoning_effort;
    }
    if(options.reasoning_budget_tokens !== undefined) {
        if(!Number.isInteger(options.reasoning_budget_tokens) || options.reasoning_budget_tokens < -1
            || options.reasoning_budget_tokens > Math.min(context, 8192))
            throw new Error('Invalid reasoning token budget.');
        result.reasoning_budget_tokens = options.reasoning_budget_tokens;
    }
    for(const key of ['return_progress', 'timings_per_token']) {
        if(options[key] !== undefined) {
            if(typeof options[key] !== 'boolean') throw new Error(`Invalid ${key}.`);
            result[key] = options[key];
        }
    }
    if(options.stream_options !== undefined) {
        const streamOptions = options.stream_options;
        if(!streamOptions || typeof streamOptions !== 'object' || Array.isArray(streamOptions)
            || Object.keys(streamOptions).some(key => key !== 'include_usage')
            || (streamOptions.include_usage !== undefined && typeof streamOptions.include_usage !== 'boolean'))
            throw new Error('Invalid stream options.');
        if(streamOptions.include_usage !== undefined)
            result.stream_options.include_usage = streamOptions.include_usage;
    }
    return result;
}

export function normalizeNativeReasoning(options, modelInfo) {
    if(!modelInfo?.inkling) return options;
    const kwargs = options.chat_template_kwargs || {};
    if(options.reasoning_effort !== 'none' && kwargs.reasoning_effort !== 'none'
        && kwargs.enable_thinking !== false) return options;
    // Keep Inkling's template-native effort knob. The generic API normalization
    // can remove it when template capabilities do not advertise "none".
    // Atomic's loop variant needs a small per-block margin instead of repeatedly
    // closing empty thinking blocks at zero; standard Inkling keeps a zero budget.
    const { reasoning_effort: _effort, ...result } = options;
    const { enable_thinking: _thinking, ...templateKwargs } = kwargs;
    return {
        ...result, reasoning_budget_tokens: modelInfo.architecture === 'inkling2_loop' ? 16 : 0,
        chat_template_kwargs: { ...templateKwargs, reasoning_effort: 'none' }
    };
}

export class NativeAIHost extends EventEmitter {
    constructor({ spawnProcess = spawn, fetchLocal = fetch, getPort = allocatePort,
        validateFiles = checkFiles, readModelInfo = readGGUFModelInfo, readGpuMemory = detectGpuMemory,
        startupTimeout = 180000, pollInterval = 250 } = {}) {
        super();
        this.dependencies = { spawnProcess, fetchLocal, getPort, validateFiles, readModelInfo, readGpuMemory, startupTimeout, pollInterval };
        this.settings = { ...AI_DEFAULTS };
        this.vramMode = 'fast';
        this.vramGuessed = false;
        this.vramFallbacks = new Map();
        this.state = 'offline';
        this.error = null;
        this.child = null;
        this.requests = new Set();
        this.lifecycle = Promise.resolve();
        this.operationId = 0;
    }

    isInkling() {
        const filenameHint = /inkling/i.test(path.basename(this.settings.modelPath));
        return this.modelInfo?.inkling === true || (!this.modelInfo
            || this.modelInfo.identitySource === 'unknown') && filenameHint;
    }

    // Automatic mode only shrinks Inkling, since the measured block counts only fit it.
    async pickVramMode(settings) {
        this.vramGuessed = false;
        if(settings.backend === 'cpu') return 'fast';
        if(settings.vramMode !== 'auto') return settings.vramMode;
        if(!this.isInkling()) return 'fast';
        let mode = vramModeFor(await this.dependencies.readGpuMemory(settings.executablePath).catch(() => null));
        if(!mode) { mode = '8'; this.vramGuessed = true; }
        const remembered = this.vramFallbacks.get(this.fallbackKey(settings));
        return remembered && VRAM_ORDER.indexOf(remembered) > VRAM_ORDER.indexOf(mode) ? remembered : mode;
    }

    fallbackKey(settings) { return `${settings.executablePath}\0${settings.modelPath}\0${settings.loraPath}`; }

    status() {
        const filenameHint = /inkling/i.test(path.basename(this.settings.modelPath));
        const inkling = this.isInkling();
        const modelInfo = {
            inkling, architecture: this.modelInfo?.architecture || null,
            templateFamily: inkling ? 'inkling' : this.modelInfo?.templateFamily || 'unknown',
            reasoningSupported: this.modelInfo?.reasoningSupported || (inkling ? true : null),
            identitySource: this.modelInfo?.identitySource === 'gguf-metadata'
                ? 'gguf-metadata' : filenameHint ? 'filename-hint' : 'unknown'
        };
        return {
            state: this.state, status: this.state, ready: this.state === 'ready', error: this.error,
            model: this.settings.modelPath ? path.basename(this.settings.modelPath) : null,
            context: this.actualContext || this.settings.context,
            lora: this.settings.loraPath ? path.basename(this.settings.loraPath) : null,
            vramMode: this.vramMode, vramGuessed: this.vramGuessed,
            vramAuto: this.settings.vramMode === 'auto',
            modelInfo,
            capabilities: {
                localOnly: true, chat: true, streaming: true, cancellation: true,
                promptInfo: true, gguf: true, lora: true, inkling,
                architecture: modelInfo.architecture,
                noThinkingBudgetTokens: modelInfo.architecture === 'inkling2_loop' ? 16 : 0,
                reasoningSupported: modelInfo.reasoningSupported, backend: inferAIBackend(this.settings)
            }
        };
    }

    updateState(state, error = null) {
        this.state = state;
        this.error = error;
        this.emit('status', this.status());
    }

    start(settings) {
        const normalized = normalizeAISettings(settings);
        const operationId = ++this.operationId;
        this.startupController?.abort();
        this.lifecycle = this.lifecycle.catch(() => {}).then(async () => {
            await this.stopProcess();
            if(operationId !== this.operationId) return this.status();
            this.settings = normalized;
            this.actualContext = null;
            this.modelInfo = null;
            this.updateState('loading');
            const controller = this.startupController = new AbortController();
            try {
                await this.dependencies.validateFiles(normalized);
                this.modelInfo = await this.dependencies.readModelInfo(normalized.modelPath).catch(() => null);
                this.vramMode = await this.pickVramMode(normalized);
                // Binding a probe to port zero lets the OS select a free port. The native
                // child cannot inherit that socket; retry a bounded number of bind races.
                for(let attempt = 0; attempt < 3; attempt++) {
                    if(controller.signal.aborted) throw new Error('Startup cancelled.');
                    this.port = await this.dependencies.getPort();
                    this.apiKey = randomUUID();
                    const child = this.dependencies.spawnProcess(normalized.executablePath,
                        buildLlamaArgs(normalized, this.port, this.apiKey, this.vramMode), {
                            cwd: path.dirname(normalized.executablePath), shell: false,
                            windowsHide: true, stdio: 'ignore',
                            env: runtimeEnvironment(normalized.executablePath)
                        });
                    this.child = child;
                    let exited = false, listening = false;
                    child.once('error', () => {
                        exited = true;
                        if(this.child === child) this.updateState('offline', 'Could not execute llama-server. Check its permissions and runtime dependencies.');
                    });
                    child.once('exit', (code, signal) => {
                        exited = true;
                        if(this.child !== child) return;
                        this.child = null;
                        this.abortRequests();
                        this.updateState('offline', `llama-server exited (${signal || code}). Check the selected build, model/LoRA compatibility and available memory.`);
                    });
                    const deadline = Date.now() + this.dependencies.startupTimeout;
                    while(!exited && Date.now() < deadline && !controller.signal.aborted) {
                        try {
                            const response = await this.dependencies.fetchLocal(this.url('/health'), {
                                headers: this.headers(),
                                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2000)])
                            });
                            if(!exited) listening = true;
                            if(response.ok && !exited && !controller.signal.aborted) {
                                await response.body?.cancel();
                                const models = await this.dependencies.fetchLocal(this.url('/v1/models'), {
                                    headers: this.headers(),
                                    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2000)])
                                });
                                if(!models.ok) {
                                    await models.body?.cancel();
                                    throw new Error('Native runtime authentication failed.');
                                }
                                await models.body?.cancel();
                                try {
                                    const propsResponse = await this.dependencies.fetchLocal(this.url('/props'), {
                                        headers: this.headers(),
                                        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2000)])
                                    });
                                    if(propsResponse.ok) {
                                        const props = await propsResponse.json();
                                        const context = props.default_generation_settings?.n_ctx;
                                        if(Number.isInteger(context) && context >= 512 && context <= 131072)
                                            this.actualContext = context;
                                    } else await propsResponse.body?.cancel();
                                } catch {}
                                if(exited || controller.signal.aborted) break;
                                this.updateState('ready');
                                return this.status();
                            }
                            await response.body?.cancel();
                        } catch {}
                        await new Promise(resolve => {
                            const timer = setTimeout(done, this.dependencies.pollInterval);
                            function done() {
                                clearTimeout(timer);
                                controller.signal.removeEventListener('abort', done);
                                resolve();
                            }
                            controller.signal.addEventListener('abort', done, { once: true });
                        });
                    }
                    const exitedBeforeStop = exited;
                    await this.stopProcess();
                    if(controller.signal.aborted) throw new Error('Startup cancelled.');
                    if(!exitedBeforeStop) throw new Error('llama-server startup timed out. Check model size, GPU memory and runtime compatibility.');
                    // llama-server answers /health before loading, so an exit after that is a
                    // load failure (usually out of memory), not a port race. Try one mode smaller.
                    const smaller = VRAM_ORDER[VRAM_ORDER.indexOf(this.vramMode) + 1];
                    if(listening && smaller && normalized.vramMode === 'auto'
                        && normalized.backend !== 'cpu' && this.isInkling()) {
                        this.vramMode = smaller;
                        this.vramFallbacks.set(this.fallbackKey(normalized), smaller);
                        this.updateState('loading');
                        attempt--;
                    }
                }
                throw new Error('llama-server could not start. Check the selected executable, model/LoRA and GPU runtime.');
            } catch(error) {
                await this.stopProcess();
                this.updateState('offline', controller.signal.aborted ? null : error.message);
                return this.status();
            } finally {
                if(this.startupController === controller) this.startupController = null;
            }
        });
        return this.lifecycle;
    }

    headers() { return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }; }
    url(route) { return `http://127.0.0.1:${this.port}${route}`; }
    abortRequests() { for(const controller of this.requests) controller.abort(); }

    async stopProcess() {
        this.abortRequests();
        const child = this.child;
        this.child = null;
        if(!child?.pid || child.exitCode != null || child.signalCode != null) return;
        await new Promise(resolve => {
            let timer;
            const done = () => { clearTimeout(timer); child.removeListener('exit', done); resolve(); };
            child.once('exit', done);
            timer = setTimeout(() => {
                child.kill('SIGKILL');
                done();
            }, 3000);
            child.kill('SIGTERM');
        });
    }

    stop() {
        ++this.operationId;
        this.startupController?.abort();
        this.abortRequests();
        this.lifecycle = this.lifecycle.catch(() => {}).then(async () => {
            await this.stopProcess();
            this.updateState('offline');
            return this.status();
        });
        return this.lifecycle;
    }

    async promptInfo(messages, chatTemplateKwargs, signal, templateOptions = {}) {
        if(this.state !== 'ready') throw new Error('Local AI is not ready.');
        if(this.requests.size >= 8) throw new Error('Too many local AI requests.');
        const options = normalizeNativeReasoning(validateChatOptions({
            ...templateOptions, messages,
            ...(chatTemplateKwargs === undefined ? {} : { chat_template_kwargs: chatTemplateKwargs })
        }, this.status().context), this.modelInfo);
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        if(signal?.aborted) controller.abort();
        this.requests.add(controller);
        try {
            const post = async (route, body) => {
                const response = await this.dependencies.fetchLocal(this.url(route), {
                    method: 'POST', headers: this.headers(), body: JSON.stringify(body),
                    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)])
                });
                if(!response.ok) {
                    await response.body?.cancel();
                    throw new Error(`Local template token counting is unavailable (HTTP ${response.status}). Use a current compatible llama-server build.`);
                }
                return response.json();
            };
            const template = await post('/apply-template', {
                messages: options.messages, add_generation_prompt: true,
                ...(options.chat_template_kwargs ? { chat_template_kwargs: options.chat_template_kwargs } : {}),
                ...(options.reasoning_effort === undefined ? {} : { reasoning_effort: options.reasoning_effort }),
                ...(options.reasoning_budget_tokens === undefined ? {} : { reasoning_budget_tokens: options.reasoning_budget_tokens })
            });
            if(typeof template.prompt !== 'string') throw new Error('Local template returned no prompt.');
            const tokenized = await post('/tokenize', { content: template.prompt, add_special: false });
            if(!Array.isArray(tokenized.tokens)) throw new Error('Local tokenizer returned no token count.');
            return { phase: 'promptInfo', tokens: tokenized.tokens.length, context: this.status().context };
        } finally {
            signal?.removeEventListener('abort', abort);
            this.requests.delete(controller);
        }
    }

    async generate(options, emit, signal) {
        if(this.state !== 'ready') throw new Error('Local AI is not ready. Start a model in the Calculation Server.');
        if(this.generationController) throw new Error('Local AI is busy. Cancel or wait for the current request.');
        const body = normalizeNativeReasoning(validateChatOptions(options, this.status().context), this.modelInfo);
        const controller = new AbortController();
        this.generationController = controller;
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        if(signal?.aborted) controller.abort();
        this.requests.add(controller);
        let reader;
        try {
            const response = await this.dependencies.fetchLocal(this.url('/v1/chat/completions'), {
                method: 'POST', headers: this.headers(), body: JSON.stringify(body),
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600000)])
            });
            if(!response.ok) {
                await response.body?.cancel();
                throw new Error(`Local model rejected the chat completion (HTTP ${response.status}). Check its chat template, context and memory.`);
            }
            if(!response.body) throw new Error('Local model returned no stream.');
            reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '', text = '', finishReason = null, usage, timings;
            let doneReceived = false;
            const consume = line => {
                if(!line.startsWith('data:')) return;
                const data = line.slice(5).trim();
                if(data === '[DONE]') { doneReceived = true; return; }
                if(!data) return;
                const chunk = JSON.parse(data);
                if(chunk.error) throw new Error('Local model reported a generation error.');
                const choice = chunk.choices?.[0];
                const delta = choice?.delta || {};
                const content = typeof delta.content === 'string' ? delta.content : '';
                text += content;
                if(choice?.finish_reason) finishReason = choice.finish_reason;
                if(chunk.usage) usage = chunk.usage;
                if(chunk.timings) timings = chunk.timings;
                emit({ phase: 'chunk', chunk });
            };
            while(!doneReceived) {
                const { value, done } = await reader.read();
                buffer += decoder.decode(value, { stream: !done });
                if(buffer.length > 1048576) throw new Error('Local model stream frame is too large.');
                let newline;
                while((newline = buffer.indexOf('\n')) !== -1) {
                    consume(buffer.slice(0, newline).replace(/\r$/, ''));
                    buffer = buffer.slice(newline + 1);
                }
                if(done) {
                    if(buffer.trim()) consume(buffer);
                    break;
                }
            }
            if(!doneReceived && !finishReason) throw new Error('Local model stream ended unexpectedly.');
            if(!text.trim()) {
                const error = new Error('The local model returned no visible final answer. Check its runtime/template compatibility or the output token budget.');
                error.code = 'NO_VISIBLE_ANSWER';
                error.finishReason = finishReason;
                error.usage = usage;
                error.timings = timings;
                throw error;
            }
            return { phase: 'complete', text, finishReason,
                ...(usage ? { usage } : {}), ...(timings ? { timings } : {}) };
        } finally {
            await reader?.cancel().catch(() => {});
            signal?.removeEventListener('abort', abort);
            this.requests.delete(controller);
            if(this.generationController === controller) this.generationController = null;
        }
    }
}

export function attachAIClient(ws, host, setup = null) {
    const requests = new Map();
    const currentStatus = () => setup ? setup.fullStatus() : host.status();
    const statusSource = setup || host;
    const send = payload => {
        if(ws.readyState !== 1) return;
        if(ws.bufferedAmount > 2097152) {
            for(const controller of requests.values()) controller.abort();
            ws.close(1013, 'AI client is too slow');
            return;
        }
        ws.send(JSON.stringify({ type: 'ai', ...payload }));
    };
    const onStatus = status => send({ phase: 'status', requestId: null, ...status });
    const close = () => {
        statusSource.removeListener('status', onStatus);
        for(const controller of requests.values()) controller.abort();
        requests.clear();
    };
    statusSource.on('status', onStatus);
    ws.once('close', close);
    ws.once('error', close);
    return async message => {
        if(ws.readyState !== 1) return;
        const requestId = message.requestId;
        if(typeof requestId !== 'string' || !requestId || requestId.length > 128) {
            send({ phase: 'error', requestId: null, error: 'Invalid AI request ID.', message: 'Invalid AI request ID.' });
            return;
        }
        try {
            if(message.action === 'status') return send({ phase: 'status', requestId, ...currentStatus() });
            // The web GUI may only ask for the pinned Pena setup or pause it. Paths stay app-only.
            if(message.action === 'setup' || message.action === 'cancelSetup') {
                if(!setup) throw new Error('This server cannot set up Pena.');
                if(message.action === 'setup') void setup.run();
                else setup.cancel();
                return send({ phase: 'status', requestId, ...currentStatus() });
            }
            if(message.action === 'cancel') {
                requests.get(requestId)?.abort();
                return;
            }
            if(!['generate', 'promptInfo'].includes(message.action)) throw new Error('Unknown AI action.');
            if(requests.has(requestId)) throw new Error('AI request ID is already active.');
            if(requests.size >= 8) throw new Error('Too many local AI requests.');
            const controller = new AbortController();
            requests.set(requestId, controller);
            try {
                const result = message.action === 'promptInfo'
                    ? await host.promptInfo(message.messages ?? message.options?.messages,
                        message.chat_template_kwargs ?? message.options?.chat_template_kwargs, controller.signal,
                        { ...message.options,
                            ...(message.reasoning_effort === undefined ? {} : { reasoning_effort: message.reasoning_effort }),
                            ...(message.reasoning_budget_tokens === undefined ? {} : { reasoning_budget_tokens: message.reasoning_budget_tokens }) })
                    : await host.generate(message.options,
                        chunk => send({ requestId, ...chunk }), controller.signal);
                send({ requestId, ...result });
            } catch(error) {
                if(controller.signal.aborted) send({ phase: 'complete', requestId, text: '', cancelled: true, finishReason: 'cancelled' });
                else throw error;
            } finally {
                requests.delete(requestId);
            }
        } catch(error) {
            send({ phase: 'error', requestId, error: error.message, message: error.message,
                ...(error.code === 'NO_VISIBLE_ANSWER' ? {
                    code: error.code, finishReason: error.finishReason,
                    ...(error.usage ? { usage: error.usage } : {}),
                    ...(error.timings ? { timings: error.timings } : {})
                } : {}) });
        }
    };
}
