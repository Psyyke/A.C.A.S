import { test } from 'node:test';
import assert from 'node:assert/strict';
import loadEngineWorker, { getEngineWorkerConfig } from '../app/assets/js/instance/engineWorker.js';

function harness(t, engineName = 'maia2', callbacks = {}) {
    const workers = [], intervals = new Map();
    const originalWorker = globalThis.Worker;
    globalThis.Worker = class {
        messages = [];
        terminated = false;
        constructor(url, options) { this.url = url; this.options = options; workers.push(this); }
        postMessage(message) { this.messages.push(message); }
        terminate() { this.terminated = true; }
        emit(data) { this.onmessage({ data }); }
    };
    t.after(() => {
        if(originalWorker === undefined) delete globalThis.Worker;
        else globalThis.Worker = originalWorker;
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
    return { worker, engines, messages, errors, pendingLoads, intervals,
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
    ['acas-fusion', 'Fusion/fusionWorker', true, 'flag', 'uci', true],
    ['maia3', 'Maia3/acasWorker', true, 'flag', 'uci', false],
    ['maia2', 'Maia2/worker', true, 'flag', 'uci', true],
    ['lozza-5', 'Lozza/lozza-5', false, 'immediate', null, false],
    ['lozza-9', 'Lozza/lozza-9', false, 'immediate', null, false]
];

for(const [name, path, module, readiness, commandMethod, poll] of workers) {
    test(`${name} retains its worker protocol`, t => {
        const h = harness(t, name);
        assert.equal(h.worker.url, `../app/assets/engines/${path}.js`);
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
