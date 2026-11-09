import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import FusionEngine from '../app/assets/engines/Fusion/fusionEngine.js';
import { defaultOptions } from '../app/assets/engines/Fusion/options.js';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function harness({ blockedBackend = false } = {}) {
    let resolvePolicy, rejectPolicy;
    const policy = new Promise((resolve, reject) => { resolvePolicy = resolve; rejectPolicy = reject; });
    const lines = [], commands = [];
    const engine = Object.assign(Object.create(FusionEngine.prototype), {
        emit: line => lines.push(line),
        onError: error => { throw error; },
        options: defaultOptions(), board: new Chess(), position: 'position startpos',
        positionValid: true, identitySeed: 123, current: null, backendSearch: null,
        backendQueue: Promise.resolve(), newGame: true, stockfishOptions: new Map(), closed: false,
        neural: Promise.resolve({ evaluate: async (fen, own, opponent, isCurrent) => {
            const result = await policy;
            return isCurrent() ? result : null;
        } }),
        stockfish: {
            ready: blockedBackend ? new Promise(() => {}) : Promise.resolve(),
            synchronize: async () => {}, send: command => commands.push(command), dispose() {}
        }
    });
    return { engine, lines, commands, resolvePolicy, rejectPolicy };
}

async function started(h) {
    h.engine.command('go infinite');
    await tick();
    assert.ok(h.engine.backendSearch);
}

test('Fusion max movetime waits for Maia after stopping Stockfish', async () => {
    const h = harness();
    await started(h);
    h.engine.command('acas_stop_waitmaia');
    assert.equal(h.commands.at(-1), 'stop');
    h.engine.receiveStockfish('bestmove e2e4');
    assert.equal(h.lines.some(line => line.startsWith('bestmove ')), false);
    h.resolvePolicy({ policy: { e2e4: 1 } });
    await tick();
    assert.ok(h.lines.includes('bestmove e2e4'));
    assert.equal(h.lines.some(line => line.includes('Fusion: error:')), false);
});

test('a newer position cancels the policy wait and ignores the late result', async () => {
    const h = harness();
    await started(h);
    h.engine.command('acas_stop_waitmaia');
    h.engine.receiveStockfish('bestmove e2e4');
    h.engine.command('position startpos moves e2e4');
    assert.ok(h.lines.includes('bestmove (none)'));
    h.resolvePolicy({ policy: { e2e4: 1 } });
    await tick();
    assert.deepEqual(h.lines.filter(line => line.startsWith('bestmove ')), ['bestmove (none)']);
});

test('a newer position cancels the policy wait before Stockfish has drained', async () => {
    const h = harness();
    await started(h);
    h.engine.command('acas_stop_waitmaia');
    h.engine.command('position startpos moves e2e4');
    h.engine.receiveStockfish('bestmove e2e4');
    assert.ok(h.lines.includes('bestmove (none)'));
    h.resolvePolicy({ policy: { e2e4: 1 } });
    await tick();
    assert.deepEqual(h.lines.filter(line => line.startsWith('bestmove ')), ['bestmove (none)']);
});

test('a stopped search without a live backend waits for policy but never starts Stockfish', async () => {
    const h = harness({ blockedBackend: true });
    h.engine.command('go infinite');
    h.engine.command('acas_stop_waitmaia');
    h.resolvePolicy({ policy: { e2e4: 1 } });
    await tick();
    assert.ok(h.lines.includes('bestmove e2e4'));
    assert.deepEqual(h.commands, []);
});

test('Maia wait timeout and inference failure still report errors without an engine-only move', async () => {
    const timed = harness();
    timed.engine.options['Maia Wait'] = 20;
    await started(timed);
    timed.engine.command('acas_stop_waitmaia');
    timed.engine.receiveStockfish('bestmove e2e4');
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.ok(timed.lines.some(line => line.includes('error: Maia wait limit reached')));
    assert.ok(timed.lines.includes('bestmove (none)'));

    const failed = harness();
    await started(failed);
    failed.engine.command('acas_stop_waitmaia');
    failed.engine.receiveStockfish('bestmove e2e4');
    failed.rejectPolicy(new Error('inference failed'));
    await tick();
    assert.ok(failed.lines.some(line => line.includes('error: inference failed')));
    assert.ok(failed.lines.includes('bestmove (none)'));
});

test('normal UCI stop remains immediate without a policy', async () => {
    const h = harness();
    await started(h);
    h.engine.command('stop');
    h.engine.receiveStockfish('bestmove e2e4');
    assert.ok(h.lines.includes('bestmove (none)'));
    h.resolvePolicy({ policy: { e2e4: 1 } });
    await tick();
    assert.deepEqual(h.lines.filter(line => line.startsWith('bestmove ')), ['bestmove (none)']);
});

test('GUI uses the bounded Fusion wait only for max movetime and cancels it on a new position', () => {
    const source = readFileSync(new URL('../app/assets/js/AcasInstance.js', import.meta.url), 'utf8');
    const start = source.indexOf('    engineStopCalculating(profile, reason) {');
    const end = source.indexOf('\n    async recoverExternalEngineSearch', start);
    const stop = new Function(`return ({${source.slice(start, end)}}).engineStopCalculating;`)();
    const commands = [];
    const calculation = { finished: false, goSent: true };
    const variables = { requestedEngine: 'acas-fusion', pendingCalculations: [calculation] };
    const instance = { pV: { default: variables }, sendMsgToEngine: async message => { commands.push(message); } };
    stop.call(instance, 'default', 'Max movetime!');
    stop.call(instance, 'default', 'Max movetime!');
    stop.call(instance, 'default', 'New board FEN');
    stop.call(instance, 'default', 'New board FEN');
    assert.deepEqual(commands, ['acas_stop_waitmaia', 'stop']);
    assert.equal(calculation.stopReason, 'New board FEN');

    calculation.stopRequested = false;
    variables.useExternalChessEngine = true;
    stop.call(instance, 'default', 'Max movetime!');
    assert.equal(commands.at(-1), 'stop');
    clearTimeout(variables.currentStopTimeout);

    calculation.stopRequested = false;
    variables.useExternalChessEngine = false;
    variables.requestedEngine = 'stockfish-18-lite-single';
    stop.call(instance, 'default', 'Max movetime!');
    assert.equal(commands.at(-1), 'stop');
});
