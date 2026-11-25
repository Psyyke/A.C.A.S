import test from 'node:test';
import assert from 'node:assert/strict';
import { Lc0Analysis, canonicalSearch } from '../lc0.js';
import { developmentCases } from './cases.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('live evidence aborts the running search and skips cancelled queued boards', async () => {
    const source = (await readFile(new URL('../app-evidence.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify('https://pena.test/app-evidence.js'));
    const Evidence = vm.runInNewContext(source + '\nLiveCoachingEvidence;', {
        DOMException, engineCoachingEvidence: ({ snapshot }) => snapshot
    });
    const evidence = new Evidence();
    const searches = [];
    const fake = () => ({ closed: false, search(fen, { signal }) {
        searches.push(fen);
        if(fen === 'latest') return Promise.resolve({ fen });
        return new Promise((resolve, reject) => signal.addEventListener('abort', () => {
            this.closed = true;
            reject(signal.reason);
        }, { once: true }));
    } });
    evidence.lc0 = fake();
    evidence.loadLc0 = async () => fake();
    const first = new AbortController(), skipped = new AbortController();
    const running = evidence.collect('old', [], first.signal);
    const rejected = assert.rejects(running, { name: 'AbortError' });
    await new Promise(resolve => setImmediate(resolve));
    const queued = evidence.collect('skipped', [], skipped.signal);
    const skippedRejection = assert.rejects(queued, { name: 'AbortError' });
    first.abort();
    skipped.abort();
    const latest = await evidence.collect('latest', []);
    await Promise.all([rejected, skippedRejection]);
    assert.deepEqual(searches, ['old', 'latest']);
    assert.equal(latest.fen, 'latest');
});

function fakeEngine({ respond = true, timeoutMs = 1000 } = {}) {
    const commands = [];
    const worker = { terminated: false, terminate() { this.terminated = true; }, postMessage(data) {
        commands.push(data.line);
        if(!respond) return;
        const lines = data.line === 'isready' ? ['readyok'] : data.line.startsWith('go ') ? [
            'info depth 1 nodes 4 pv e2e4 e7e5',
            'info string e2e4 ( 322) N: 4 (+ 0) (P: 50.0%) (WL: 0.0) (D: 0.5) (M: 40.0) (Q: 0.0) (U: 0.1) (S: 0.1) (V: -.----)',
            'bestmove e2e4'
        ] : [];
        for(const line of lines) queueMicrotask(() => worker.onmessage({ data: { type: 'uci', line } }));
    } };
    const engine = new Lc0Analysis(worker, { timeoutMs });
    engine.ready = true;
    engine.identity = { networkSha256: 'fixture' };
    return { engine, worker, commands };
}

test('search waits for ready barrier and records exact budget and completed transcript', async () => {
    const { engine, commands } = fakeEngine();
    try {
        const result = await engine.search(developmentCases[0].fen, { nodes: 8, moves: ['e2e4'] });
        assert.equal(result.bestMove, 'e2e4');
        assert.deepEqual(result.budget, { nodes: 8, moves: ['e2e4'] });
        assert.equal(result.candidates[0].neuralValue, null);
        assert.deepEqual(commands.slice(0, 2), ['ucinewgame', 'isready']);
        assert.equal(commands.at(-1), 'go nodes 8 searchmoves e2e4');
    } finally { engine.dispose(); }
});

test('abort terminates the worker and cannot leak a bestmove into another request', async () => {
    const { engine, worker } = fakeEngine({ respond: false });
    const controller = new AbortController();
    const pending = engine.search(developmentCases[0].fen, { signal: controller.signal });
    controller.abort(new DOMException('Board changed', 'AbortError'));
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(worker.terminated, true);
    assert.equal(engine.pending, null);
    await assert.rejects(engine.search(developmentCases[0].fen), /not ready/);
});

test('timeouts fail explicitly and simultaneous requests do not share a transcript', async () => {
    const { engine, worker } = fakeEngine({ respond: false, timeoutMs: 15 });
    const pending = engine.search(developmentCases[0].fen);
    await assert.rejects(engine.search(developmentCases[0].fen), /another search/);
    await assert.rejects(pending, /timed out/);
    assert.equal(worker.terminated, true);
});

test('illegal candidate requests fail before sending commands', async () => {
    const { engine, commands } = fakeEngine();
    await assert.rejects(engine.search(developmentCases[0].fen, { moves: ['e7e5'] }), /Illegal move/);
    assert.deepEqual(commands, []);
    engine.dispose();
});

test('invalid initialization releases the newly created worker', async () => {
    const worker = { terminated: false, terminate() { this.terminated = true; } };
    const engine = new Lc0Analysis(worker);
    await assert.rejects(engine.initialize(new ArrayBuffer(0)), /weights are required/);
    assert.equal(worker.terminated, true);
    assert.equal(engine.closed, true);
});

test('explicit GPU/batching choices reach the current worker and are recorded without changing historical defaults', async () => {
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ lc0Revision: 'test-current-port' }) });
    try {
        for(const options of [{}, { provider: 'webgpu', threads: 2, minibatchSize: 32, maxPrefetch: 16 }]) {
            const sent = [];
            const worker = { terminate() {}, postMessage(data) {
                sent.push(data);
                const replies = data.type === 'initialize' ? [{ type: 'ready' }]
                    : data.line === 'uci' ? ['id name Lc0 v0.32.1', ...['Threads', 'NNCacheSize', 'MinibatchSize', 'MaxPrefetch', 'MultiPV', 'VerboseMoveStats', 'SmartPruningFactor']
                        .map(name => `option name ${name} type spin default 1 min 0 max 256`), 'uciok'].map(line => ({ type: 'uci', line }))
                    : data.line === 'isready' ? [{ type: 'uci', line: 'readyok' }] : [];
                for(const data of replies) queueMicrotask(() => worker.onmessage({ data }));
            } };
            const engine = new Lc0Analysis(worker);
            await engine.initialize(new ArrayBuffer(4), options);
            assert.equal(sent[0].provider, options.provider);
            assert.equal(engine.identity.backend, options.provider || 'eigen');
            assert.equal(engine.identity.settings.MinibatchSize, options.minibatchSize || 1);
            assert.ok(sent.some(message => message.line === `setoption name Threads value ${options.threads || 1}`));
            assert.equal(engine.identity.precision, 'f32');
            assert.equal(engine.identity.worker, 'lc0/worker.js');
            engine.dispose();
        }
    } finally { globalThis.fetch = fetchOriginal; }
});

test('invalid batching is rejected rather than silently clamped or switching backend', async () => {
    const worker = { terminated: false, terminate() { this.terminated = true; }, postMessage() { assert.fail('Invalid settings were dispatched.'); } };
    const engine = new Lc0Analysis(worker);
    await assert.rejects(engine.initialize(new ArrayBuffer(4), { provider: 'webgpu', minibatchSize: 0 }), /minibatchSize/);
    assert.equal(worker.terminated, true);
});

test('Lc0 king-to-rook diagnostics and PV moves normalize on their own board', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const result = canonicalSearch({ bestMove: 'e1h1', candidates: [{ move: 'e1h1', visits: 4 }],
        lines: [{ pv: ['e1h1', 'e8a8'] }] }, fen);
    assert.equal(result.bestMove, 'e1g1');
    assert.equal(result.candidates[0].engineMove, 'e1h1');
    assert.deepEqual(result.lines[0].pv, ['e1g1', 'e8c8']);
});
