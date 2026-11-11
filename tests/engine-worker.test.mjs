import { test } from 'node:test';
import assert from 'node:assert/strict';
import loadEngineWorker, { getEngineWorkerConfig } from '../app/assets/js/instance/engineWorker.js';

function harness(t, engineName = 'maia2', callbacks = {}) {
    const workers = [], intervals = new Map();
    const originalWorker = globalThis.Worker;
    const originalLocalStorage = globalThis.localStorage;
    const originalDocument = globalThis.document;
    globalThis.document = { baseURI: 'http://localhost/app/' };
    globalThis.localStorage = {
        getItem: () => '123456789',
        setItem: () => {}
    };
    globalThis.Worker = class {
        messages = [];
        terminated = false;
        listeners = [];
        constructor(url, options) { this.url = url; this.options = options; workers.push(this); }
        postMessage(message) { this.messages.push(message); }
        terminate() { this.terminated = true; }
        addEventListener(type, callback) { if(type === 'message') this.listeners.push(callback); }
        emit(data) {
            let stopped = false;
            const event = { data, stopImmediatePropagation() { stopped = true; } };
            for(const callback of this.listeners) {
                callback(event);
                if(stopped) return;
            }
            this.onmessage?.(event);
        }
    };
    t.after(() => {
        if(originalWorker === undefined) delete globalThis.Worker;
        else globalThis.Worker = originalWorker;
        if(originalLocalStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = originalLocalStorage;
        if(originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
    });
    t.mock.method(globalThis, 'setInterval', callback => {
        const id = Symbol();
        intervals.set(id, callback);
        return id;
    });
    t.mock.method(globalThis, 'clearInterval', id => intervals.delete(id));
    const engines = [], messages = [], errors = [], pendingLoads = new Set();
    let current = true;
    const worker = loadEngineWorker(getEngineWorkerConfig(engineName), {
        type: engineName, profileName: 'default', pendingLoads,
        isCurrent: () => current,
        onReady: engine => engines.push(engine),
        onMessage: message => messages.push(message),
        onError: error => errors.push(error),
        ...callbacks
    });
    t.after(() => worker.terminate());
    return { worker, workers, engines, messages, errors, pendingLoads, intervals,
        invalidate: () => { current = false; } };
}

const workers = [
    ['stockfish-19', 'stockfish-19/stockfish-19', false, 'message', null, false],
    ['stockfish-19-lite-single', 'stockfish-19-lite-single/stockfish-19-lite-single', false, 'message', null, false],
    ['stockfish-18-single', 'stockfish-18-single/stockfish-18-single', false, 'message', null, false],
    ['stockfish-18-lite-single', 'stockfish-18-lite-single/stockfish-18-lite-single', false, 'message', null, false],
    ['stockfish-17-single', 'stockfish-17-single/stockfish-17-single', false, 'message', null, false],
    ['stockfish-17-lite-single', 'stockfish-17-lite-single/stockfish-17-lite-single', false, 'message', null, false],
    ['stockfish-11', 'stockfish-11/stockfish-11', false, 'message', null, false],
    ['stockfish-8', 'stockfish-8/stockfish-8', false, 'message', null, false],
    ['stockfish-16-1-wasm', 'lila-stockfish/16-0-worker', true, 'flag', 'uci', true],
    ['fairy-stockfish-nnue-wasm', 'fairy-stockfish-nnue.wasm/stockfishWorker', false, 'flag', 'postMessage', true],
    ['lc0', 'zerofish/zerofishWorker', true, 'flag', 'zero', true],
    ['rodent-v', 'rodent-v/worker', false, 'flag', null, false],
    ['acas-fusion', 'Fusion/fusionWorker', true, 'flag', 'uci', true],
    ['maia3', 'Maia3/acasWorker', true, 'flag', 'uci', false],
    ['maia2', 'Maia2/worker', true, 'flag', 'uci', true],
    ['lozza-5', 'Lozza/lozza-5', false, 'immediate', null, false],
    ['lozza-9', 'Lozza/lozza-9', false, 'immediate', null, false]
];

for(const [name, path, module, readiness, commandMethod, poll] of workers) {
    test(`${name} retains its worker protocol`, t => {
        const h = harness(t, name);
        if(name === 'rodent-v' || name === 'fairy-stockfish-nnue-wasm')
            assert.deepEqual(h.worker.messages.shift(), { type: 'initialize-files', files: {} });
        const identity = name === 'acas-fusion' ? '?identitySeed=123456789' : '';
        assert.equal(h.worker.url, `../app/assets/engines/${path}.js${identity}`);
        assert.deepEqual(h.worker.options, module ? { type: 'module' } : undefined);
        assert.equal(h.intervals.size, poll ? 1 : 0);
        if(poll) {
            [...h.intervals.values()][0]();
            assert.deepEqual(h.worker.messages.pop(), { method: 'acas_check_loaded' });
        }
        assert.equal(h.engines.length, readiness === 'immediate' ? 1 : 0);
        h.worker.emit(readiness === 'flag' ? true : 'uciok');
        assert.equal(h.engines.length, 1);
        assert.equal(h.pendingLoads.size, 0);
        assert.equal(h.intervals.size, 0);
        const engine = h.engines[0];
        assert.equal(engine.type, name);
        assert.equal(engine.profileName, 'default');
        assert.equal(engine.worker, h.worker);
        engine.sendMsg('go depth 12');
        engine.engine('postMessage', ['isready']);
        assert.deepEqual(h.worker.messages, commandMethod ? [
            { method: commandMethod, args: ['go depth 12'] },
            { method: 'postMessage', args: ['isready'] }
        ] : ['go depth 12', 'isready']);
        h.worker.emit('info depth 12 score cp 25 pv e2e4');
        assert.equal(h.messages.at(-1), 'info depth 12 score cp 25 pv e2e4');
        assert.equal(h.engines.length, 1);
    });
}

test('unknown engines still fall back to Maia 3', () => {
    for(const name of ['unknown', 'constructor', 'toString', undefined]) {
        assert.deepEqual(getEngineWorkerConfig(name), getEngineWorkerConfig('maia3'));
    }
});

test('personalized Maia 3 passes only its own model selection and provider to the worker', t => {
    const h = harness(t, 'maia3', { modelId: 'maia3-test&other=value', modelProvider: 'webgpu' });
    assert.equal(h.worker.url, '../app/assets/engines/Maia3/acasWorker.js?modelId=maia3-test%26other%3Dvalue&provider=webgpu');
    assert.equal(h.intervals.size, 0);
    h.worker.emit(true);
    h.worker.emit({ type: 'error', message: 'Personalized model is missing.' });
    h.worker.emit({ type: 'error', message: 'duplicate' });
    assert.equal(h.worker.terminated, true);
    assert.equal(h.errors.length, 1);
    assert.equal(h.errors[0].message, 'Personalized model is missing.');
    assert.deepEqual(h.messages, []);
});

test('duplicate readiness notifications do not register or forward twice', t => {
    const h = harness(t);
    h.worker.emit(true);
    h.worker.emit(true);
    assert.equal(h.engines.length, 1);
    assert.deepEqual(h.messages, []);
});

test('messages before the readiness flag still reach the processor', t => {
    const h = harness(t);
    h.worker.emit('option name Hash type spin default 16 min 1 max 1024');
    assert.equal(h.engines.length, 0);
    assert.equal(h.pendingLoads.size, 1);
    assert.equal(h.messages.length, 1);
});

for(const name of ['maia2', 'maia3', 'stockfish-19']) {
    test(`${name} releases pending loads on error and reports the error once`, t => {
        const h = harness(t, name);
        const error = new Error('Worker failed');
        h.worker.onerror(error);
        h.worker.onerror(error);
        h.worker.emit(true);
        assert.equal(h.pendingLoads.size, 0);
        assert.equal(h.intervals.size, 0);
        assert.equal(h.worker.terminated, true);
        assert.deepEqual(h.errors, [error]);
        assert.equal(h.engines.length, 0);
    });
}

test('a replaced profile is cleaned up at the next readiness poll', t => {
    const h = harness(t);
    h.invalidate();
    [...h.intervals.values()][0]();
    assert.equal(h.worker.terminated, true);
    assert.equal(h.pendingLoads.size, 0);
    assert.equal(h.intervals.size, 0);
    assert.deepEqual(h.worker.messages, []);
    assert.deepEqual(h.errors, []);
});

test('a late callback from a replaced worker cannot register an engine', t => {
    const h = harness(t, 'maia3');
    h.invalidate();
    h.worker.emit(true);
    assert.equal(h.worker.terminated, true);
    assert.equal(h.pendingLoads.size, 0);
    assert.equal(h.engines.length, 0);
});

test('failed asynchronous startup terminates the worker and reports the failure', async t => {
    const error = new Error('Weight loading failed');
    const h = harness(t, 'lc0', { onReady: async () => { throw error; } });
    h.worker.emit(true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.worker.terminated, true);
    assert.equal(h.pendingLoads.size, 0);
    assert.equal(h.intervals.size, 0);
    assert.deepEqual(h.errors, [error]);
});

test('upstream Lc0 initializes weights and translates its UCI protocol', async t => {
    const weights = new Uint8Array([1, 2, 3]).buffer;
    const h = harness(t, 'modern-lc0', { loadWeights: async () => weights });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.worker.url, 'http://localhost/app/assets/engines/lc0/worker.js?workerTree=1');
    assert.deepEqual(h.worker.messages, [{ type: 'initialize', weights }]);
    assert.equal(h.engines.length, 0);
    h.worker.emit({ type: 'ready' });
    assert.equal(h.engines.length, 1);
    h.engines[0].sendMsg('go nodes 10');
    assert.deepEqual(h.worker.messages.at(-1), { type: 'uci', line: 'go nodes 10' });
    h.worker.emit({ type: 'uci', line: 'bestmove e2e4' });
    assert.equal(h.messages.at(-1), 'bestmove e2e4');
    h.worker.emit({ type: 'error', message: 'Network failed' });
    assert.equal(h.worker.terminated, true);
    assert.equal(h.errors[0].message, 'Network failed');
});

test('upstream Lc0 does not initialize after its profile is replaced', async t => {
    let resolveWeights;
    const h = harness(t, 'modern-lc0', {
        loadWeights: () => new Promise(resolve => { resolveWeights = resolve; })
    });

    await new Promise(resolve => setImmediate(resolve));
    h.invalidate();
    resolveWeights(new Uint8Array([1]).buffer);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.worker.terminated, true);
    assert.equal(h.pendingLoads.size, 0);
    assert.deepEqual(h.worker.messages, []);
});

test('upstream Lc0 WebGPU is explicitly selected without CPU fallback', async t => {
    const weights = new Uint8Array([1]).buffer;
    const h = harness(t, 'modern-lc0-webgpu', { loadWeights: async () => weights });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(h.worker.messages, [{ type: 'initialize', weights, provider: 'webgpu' }]);
    h.worker.emit({ type: 'error', message: 'WebGPU unavailable' });
    assert.equal(h.errors[0].message, 'WebGPU unavailable');
    assert.equal(h.worker.terminated, true);
});

test('stopping Lc0 terminates its converter and pthread workers, including during loading', async t => {
    const h = harness(t, 'modern-lc0-webgpu', { loadWeights: async () => new Uint8Array([1]).buffer });
    await new Promise(resolve => setImmediate(resolve));
    const converterChannel = new MessageChannel();
    const threadChannel = new MessageChannel();
    t.after(() => { converterChannel.port1.close(); threadChannel.port1.close(); });
    h.worker.emit({ type: 'lc0-create-worker', url: 'http://localhost/converter-worker.js',
        options: { type: 'module' }, port: converterChannel.port2 });
    const converter = h.workers[1];
    converter.emit({ type: 'lc0-create-worker', url: 'http://localhost/dist/lc0.js',
        options: { type: 'module', name: 'em-pthread' }, port: threadChannel.port2 });
    h.worker.terminate();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(converter.terminated, true);
    assert.equal(h.workers[2].terminated, true);
    assert.equal(h.worker.terminated, true);
    assert.equal(h.pendingLoads.size, 0);
    assert.deepEqual(h.errors, []);
    assert.deepEqual(h.engines, []);
});

test('upstream Lc0 reports weight and UCI errors', async t => {
    const h = harness(t, 'modern-lc0', { loadWeights: async () => { throw new Error('Weights missing'); } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.errors[0].message, 'Weights missing');
    assert.equal(h.worker.terminated, true);
    const second = harness(t, 'modern-lc0', { loadWeights: async () => new Uint8Array([1]).buffer });
    await new Promise(resolve => setImmediate(resolve));
    second.worker.emit({ type: 'ready' });
    second.worker.emit({ type: 'uci', line: 'error network failed' });
    assert.equal(second.errors[0].message, 'error network failed');
});
