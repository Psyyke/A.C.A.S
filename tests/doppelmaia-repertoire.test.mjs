import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { positionSignature, signatureKey, repertoireProjection, buildRepertoire, withRepertoire } from '../tools/doppelmaia/repertoire.js';
import { emptyAdapter, adapterForward } from '../tools/doppelmaia/adapter-learning.js';
import { moveCount } from '../tools/doppelmaia/maia3-model.js';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';

test('opening signatures encode every square exactly and mirror the moving side', () => {
    const board = new Chess(), start = signatureKey(positionSignature(board.fen()));
    assert.equal(signatureKey(positionSignature(board.fen().replace(' w ', ' b '))), start);
    board.move('e4');
    assert.notEqual(signatureKey(positionSignature(board.fen())), start);
    const signatures = new Set();
    for(let square = 0; square < 64; square++) for(const color of ['w', 'b']) {
        const probe = new Chess();
        probe.clear();
        probe.put({ type: 'n', color }, String.fromCharCode(97 + square % 8) + (Math.floor(square / 8) + 1));
        const signature = positionSignature(probe.fen());
        assert.ok(signature.every(value => Number.isInteger(value) && value <= 28560));
        signatures.add(signatureKey(signature));
    }
    const projection = repertoireProjection();
    assert.equal(projection.length, 768 * 16);
    assert.equal(projection[(12 * 8) * 16 + 2], 1);
    assert.equal(projection[(12 * 8 + 11) * 16 + 2], 12);
    assert.throws(() => positionSignature('8/8/8/8/8/8/8/7Z w'), /placement/);
    assert.equal(signatures.size, 128);
});

test('real trainer learns and exports personal openings with honest familiar and novel validation', { timeout: 180000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    try {
        const page = await browser.newPage();
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Ready.'), null, { timeout: 30000 });
        const result = await page.evaluate(async provider => {
            const { Chess } = await import('/app/assets/engines/libraries/chessjs/chess.js');
            const makeSample = (board, move, gameId, ply) => ({
                fen: board.fen(), legalMoves: board.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || '')),
                move, gameId, ply
            });
            const board = new Chess();
            const start = makeSample(board, 'h2h4', 'train1', 0);
            board.move('e4'); board.move('e5');
            const novel = makeSample(board, 'b1c3', 'validation2', 2);
            const worker = new Worker('./maia3-trainer-worker.js', { type: 'module' });
            try {
                return await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error('Opening trainer timed out')), 120000);
                    worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
                    worker.onmessage = ({ data }) => {
                        if(data.type === 'error') { clearTimeout(timer); reject(new Error(data.message)); }
                        if(data.type === 'complete') { clearTimeout(timer); resolve({ report: data.report, bytes: data.weights.byteLength }); }
                    };
                    worker.postMessage({ type: 'train', provider, elo: 1500, goal: 'imitate',
                        options: { epochs: 1, learningRate: 0.005, batchSize: 4 },
                        dataset: { train: { samples: [start, { ...start, gameId: 'train2' }] },
                            validation: { samples: [{ ...start, gameId: 'validation1' }, novel] } } });
                });
            } finally { worker.terminate(); }
        }, process.env.PERSONAL_MAIA_PROVIDER || 'wasm');
        assert.equal(result.report.featureSize, 512);
        assert.equal(result.report.repertoire.positions, 1);
        assert.ok(result.report.repertoire.strength > 0);
        assert.equal(result.report.familiarValidation.positions, 1);
        assert.equal(result.report.novelValidation.positions, 1);
        assert.equal(result.report.openingValidation.positions, 2);
        assert.ok(result.report.exportedMetrics.loss < result.report.history[result.report.bestEpoch].heldOutLoss);
        assert.equal(result.report.exportVerified, true);
        assert.ok(result.bytes > 99000000);
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});

test('training opening counts prefer observed moves and never use validation labels', () => {
    const fen = new Chess().fen(), policy = emptyAdapter();
    const sample = { fen, ply: 0, features: new Float32Array(64), legal: [1, 200],
        base: [0, 0], target: 1, targets: [0, 1] };
    const repertoire = buildRepertoire([sample, sample, { ...sample, ply: 28 }], policy, adapterForward);
    assert.equal(repertoire.length, 1);
    assert.equal(repertoire[0].observations, 2);
    const adjusted = withRepertoire([sample], repertoire, 1)[0];
    assert.ok(adapterForward(policy, adjusted).probabilities[1] > 0.6);
    assert.deepEqual(withRepertoire([sample], repertoire, 0)[0].base, sample.base);
    const anchored = buildRepertoire([sample, sample], policy, adapterForward, 1);
    assert.ok(anchored[0].delta.every(value => value === 0));
    assert.equal(buildRepertoire([{ ...sample, ply: 24 }, { ...sample, ply: 24 }], policy, adapterForward).length, 0);
    assert.equal(buildRepertoire([sample], policy, adapterForward).length, 0);
    assert.ok(repertoire[0].delta.every(value => Math.abs(value) <= 4));
});

test('portable full feature ONNX matches exact opening residuals without touching other boards', { timeout: 180000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    try {
        const page = await browser.newPage();
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Ready.'), null, { timeout: 30000 });
        const result = await page.evaluate(async provider => {
            const { prepareMaia3, exportMaia3 } = await import('./maia3-model.js');
            const { positionSignature } = await import('./repertoire.js');
            const { preprocessMaia3 } = await import('/app/assets/engines/Maia3/tensor.js');
            const { Chess } = await import('/app/assets/engines/libraries/chessjs/chess.js');
            const ort = await import('./runtime/dist/ort.webgpu.bundle.min.mjs');
            ort.env.wasm.numThreads = 1;
            ort.env.wasm.wasmPaths = new URL('./runtime/dist/', location.href).href;
            const raw = new Uint8Array(await (await fetch('/app/assets/engines/Maia3/model/maia3_simplified.onnx')).arrayBuffer());
            const prepared = prepareMaia3(raw, 512), board = new Chess();
            const first = board.fen(); board.move('e4');
            const fens = [first, board.fen(), first.replace(' w ', ' b ')];
            const signature = positionSignature(first), delta = new Float32Array(4352);
            delta[120] = 0.7; delta[900] = -0.8;
            const bytes = exportMaia3(prepared, new Float32Array(512 * 4352), new Float32Array(4352),
                [{ signature, delta }], 0.5);
            const options = { executionProviders: [provider] };
            const base = await ort.InferenceSession.create(prepared, options);
            const personal = await ort.InferenceSession.create(bytes, options);
            try {
                const feeds = {
                    tokens: new ort.Tensor('float32', Float32Array.from(fens.flatMap(fen => [...preprocessMaia3(fen).boardTokens])), [3, 64, 12]),
                    elo_self: new ort.Tensor('float32', Float32Array.from([1000, 1500, 2400]), [3]),
                    elo_oppo: new ort.Tensor('float32', Float32Array.from([1000, 1500, 2400]), [3])
                };
                const a = await base.run(feeds), b = await personal.run(feeds);
                let error = 0;
                for(let row = 0; row < 3; row++) for(let i = 0; i < 4352; i++) {
                    const expected = a.acas_base_logits.data[row * 4352 + i] + (row === 1 ? 0 : delta[i] * 0.5);
                    error = Math.max(error, Math.abs(b.logits_move.data[row * 4352 + i] - expected));
                }
                const valueError = Math.max(...a.logits_value.data.map((value, i) => Math.abs(value - b.logits_value.data[i])));
                return { error, valueError, bytes: bytes.byteLength, featureWidth: a.acas_features.dims[1] };
            } finally { await base.release(); await personal.release(); }
        }, process.env.PERSONAL_MAIA_PROVIDER || 'wasm');
        assert.equal(result.featureWidth, 512);
        assert.ok(result.bytes > 99000000);
        assert.ok(result.error < 0.001, JSON.stringify(result));
        assert.ok(result.valueError < 0.00001);
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
