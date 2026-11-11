// Each NNUE architecture runs the matching upstream scalar implementation.
let runtime;
let networkSize = 512;
let position = 'position startpos';
let failed = false;
let draining = false;
let sequence = 0;
let runtimeReady = false;
let fileOptions = new Map();
let parsePersonality;
let assets;
const options = new Map();
const queue = [];
const waiters = new Map();
const presets = new Set(['default', 'ampere', 'chaotic', 'hector', 'nimzoid', 'rodent', 'tal_hybrid', 'tal_nnue']);
const defaultNetwork = 'nets/rodent_8kb_512pw_multilayer_v8.bin';

function fail(error) {
    if(failed) return;
    failed = true;
    runtime?.terminate();
    for(const { reject, timer } of waiters.values()) {
        clearTimeout(timer);
        reject(error);
    }
    waiters.clear();
    postMessage({ type: 'error', message: `Rodent V: ${error?.message || error}` });
}

function waitFor(id, timeout = 70000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            waiters.delete(id);
            reject(new Error(`Timed out waiting for Rodent (${id}).`));
        }, timeout);
        waiters.set(id, { resolve, reject, timer });
    });
}

function complete(id) {
    const waiter = waiters.get(id);
    if(!waiter) return;
    clearTimeout(waiter.timer);
    waiters.delete(id);
    waiter.resolve();
}

async function startRuntime(size) {
    const ready = waitFor('ready');
    runtime = new Worker(new URL(`runtime-worker.js?networkSize=${size}`, self.location.href));
    runtime.onmessage = ({ data }) => {
        if(failed) return;
        if(data === true) complete('ready');
        else if(data?.type === 'sync') complete(data.id);
        else if(data?.type === 'error') fail(new Error(data.message));
        else postMessage(data);
    };
    runtime.onerror = error => fail(new Error(error.message || 'Runtime worker failed.'));
    runtime.onmessageerror = () => fail(new Error('Runtime returned an unreadable message.'));
    await ready;
    networkSize = size;
}

async function synchronize(timeout) {
    const id = String(++sequence);
    const done = waitFor(id, timeout);
    runtime.postMessage(`acas_sync ${id}`);
    await done;
}

function desiredNetworkSize() {
    const preset = options.get('personality')?.value || 'default';
    const network = options.get('nnuepath')?.value || fileOptions.get('nnuepath')?.value
        || (preset === 'default' ? defaultNetwork : 'nets/rodent_4kb_768hl_8ob_v2.bin');
    return network.includes('_768') ? 768 : 512;
}

async function restoreRuntime(size) {
    runtime.postMessage('stop');
    await synchronize(5000);
    runtime.terminate();
    postMessage(`info string Rodent loading ${size}-neuron runtime`);
    await startRuntime(size);
    runtime.postMessage('ucinewgame');
    // Load the explicit network first so a preset cannot temporarily decode
    // an incompatible base network before replaying that override.
    const network = options.get('nnuepath') || fileOptions.get('nnuepath');
    if(network) runtime.postMessage(network.line);
    for(const [name, option] of fileOptions) {
        if(name !== 'nnuepath') runtime.postMessage(option.line);
    }
    for(const [name, option] of options) {
        if(name !== 'nnuepath' && name !== 'personality') runtime.postMessage(option.line);
    }
    if(options.has('personality')) runtime.postMessage(options.get('personality').line);
    runtime.postMessage(position);
    await synchronize();
}

async function drain() {
    if(draining || failed) return;
    draining = true;
    try {
        while(queue.length && !failed) {
            const line = queue.shift();
            if(typeof line === 'object' && line.type === 'initialize-files') {
                fileOptions = parsePersonality(line.files?.PersonalityFile ?? '', assets);
                if(fileOptions.size) await restoreRuntime(desiredNetworkSize());
                continue;
            }
            const setting = /^setoption\s+name\s+(.+?)\s+value\s+(.*)$/i.exec(line);
            if(setting) {
                const name = setting[1].toLowerCase(), value = setting[2];
                if(name === 'personality' && !presets.has(value)) throw new Error(`Unknown personality: ${value}`);
                options.set(name, { line, value });
                if(desiredNetworkSize() !== networkSize) {
                    await restoreRuntime(desiredNetworkSize());
                    continue;
                }
            }
            if(/^position /.test(line)) position = line;
            if(line === 'ucinewgame') position = 'position startpos';
            runtime.postMessage(line);
        }
    } finally {
        draining = false;
    }
}

self.onmessage = ({ data }) => {
    if(failed) return;
    if(data?.type === 'initialize-files') {
        queue.push(data);
        if(runtimeReady) drain().catch(fail);
        return;
    }
    if(typeof data !== 'string' || /[\r\n\0]/.test(data)) {
        fail(new Error('Expected one UCI command.'));
        return;
    }
    if(queue.length >= 256) {
        fail(new Error('UCI command queue is full.'));
        return;
    }
    queue.push(data.trim());
    if(runtimeReady) drain().catch(fail);
};

(async () => {
    const response = await fetch(new URL('./dist/build-info.json', self.location.href));
    if(!response.ok) throw new Error(`Could not load build manifest: HTTP ${response.status}`);
    assets = (await response.json()).assets;
    ({ parsePersonality } = await import('./personality.js'));
    await startRuntime(512);
    runtimeReady = true;
    await drain();
    postMessage(true);
})().catch(fail);
