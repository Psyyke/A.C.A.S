import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { emptyAdapter, adapterForward, cpuAdapterStep } from '../tools/doppelmaia/adapter-learning.js';
import { halfToFloat, adapterSize, moveCount } from '../tools/doppelmaia/maia3-model.js';
import { fields } from '../tools/doppelmaia/weights.js';
import { openingSamples, shapeSquares, shapeRewards, objectiveTargets } from '../tools/doppelmaia/objectives.js';

test('Maia 3 adapter gradient matches finite differences, preserves a zero adapter, and learns', () => {
    const policy = emptyAdapter();
    const sample = { features: new Float32Array(adapterSize).fill(0.25), legal: [1, 200],
        base: [0.2, -0.5], target: 1, targets: [0, 1] };
    assert.deepEqual(adapterForward(policy, sample).logits, sample.base);
    const index = 2 * moveCount + 200, h = 0.001;
    policy.matrix[index] = h;
    const plus = adapterForward(policy, sample).loss;
    policy.matrix[index] = -h;
    const minus = adapterForward(policy, sample).loss;
    policy.matrix[index] = 0;
    const expected = (plus - minus) / (2 * h);
    const baseline = adapterForward(policy, sample).loss;
    cpuAdapterStep(policy, [sample], 0.01);
    assert.ok(Math.abs(-policy.matrix[index] / 0.01 - expected) < 1e-6);
    assert.ok(adapterForward(policy, sample).loss < baseline);
    assert.equal(policy.bias[0], 0);
    assert.equal(halfToFloat(0x3c00), 1);
    assert.equal(halfToFloat(0xc000), -2);
    assert.equal(halfToFloat(1), 2 ** -24);
    assert.equal(fields(Uint8Array.from([8, 255, 255, 255, 255, 255, 255, 255, 255, 255, 1]))[0].value, -1);
});

test('opening and pawn-shape objectives are legal and color-relative', () => {
    const line = openingSamples('1. e4 e5 2. Nf3 Nc6');
    assert.deepEqual(line.map(sample => sample.move), ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    assert.throws(() => openingSamples('1. e4 e9'), /Invalid opening/);
    assert.throws(() => shapeSquares('e4 e4'), /distinct/);
    const white = shapeRewards(line[0], ['e4']), black = shapeRewards(line[1], ['e4']);
    assert.equal(white[line[0].legalMoves.indexOf('e2e4')], 1);
    assert.equal(black[line[1].legalMoves.indexOf('e7e5')], 1);
    const targets = objectiveTargets([0, 0], 0, [0, 1]);
    assert.ok(targets[1] > 0.74);
    assert.ok(Math.abs(targets.reduce((a, b) => a + b) - 1) < 1e-12);
});

test('base anchoring mixes legal teacher preferences without changing ordinary imitation', () => {
    const base = [2, -1, 0.5], target = 1;
    assert.deepEqual(objectiveTargets(base, target), [0, 1, 0]);
    const teacher = objectiveTargets(base, target, undefined, 1);
    const mixed = objectiveTargets(base, target, undefined, 0.5);
    assert.ok(Math.abs(mixed.reduce((a, b) => a + b) - 1) < 1e-12);
    for(let i = 0; i < base.length; i++) assert.ok(Math.abs(mixed[i] - (teacher[i] + Number(i === target)) / 2) < 1e-12);
    for(const invalid of [-1, 1.01, NaN, Infinity, '0.5']) assert.throws(() => objectiveTargets(base, target, undefined, invalid), /balance/);
    const sample = { features: new Float32Array(adapterSize).fill(0.25), base, legal: [1, 2, 3], target, targets: mixed };
    const policy = emptyAdapter(), h = 0.001, index = 2 * moveCount + 2;
    policy.matrix[index] = h;
    const plus = adapterForward(policy, sample).loss;
    policy.matrix[index] = -h;
    const minus = adapterForward(policy, sample).loss;
    policy.matrix[index] = 0;
    cpuAdapterStep(policy, [sample], 0.01);
    assert.ok(Math.abs(-policy.matrix[index] / 0.01 - (plus - minus) / (2 * h)) < 1e-6);
});

test('real Maia 3 browser training exports a complete app-loadable ONNX network', { timeout: 300000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const provider = process.env.PERSONAL_MAIA_PROVIDER || 'wasm';
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    try {
        const page = await browser.newPage();
        page.on('console', message => { if(message.type() === 'error' || message.text().startsWith('Maia3 test:')) console.log(message.text()); });
        page.on('pageerror', error => console.error(error));
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => crossOriginIsolated && document.querySelector('#status')?.textContent.startsWith('Ready.'), null, { timeout: 20000 });
        const result = await page.evaluate(async provider => {
            const { openingSamples } = await import('./objectives.js');
            const line = openingSamples('1. e4 e5 2. Nf3 Nc6');
            const samples = line.map(sample => ({ ...sample, move: sample.legalMoves[0] }));
            const worker = new Worker('./maia3-trainer-worker.js', { type: 'module' });
            let trained;
            try {
                trained = await new Promise((resolve, reject) => {
                    const events = [];
                    const timer = setTimeout(() => reject(new Error(`Training timed out: ${JSON.stringify(events)}`)), 120000);
                    worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
                    worker.onmessage = ({ data }) => {
                        events.push({ ...data, weights: undefined });
                        if(['stage', 'features', 'epoch'].includes(data.type)) console.log('Maia3 test:', JSON.stringify(data));
                        if(data.type === 'error') { clearTimeout(timer); reject(new Error(`${data.message}\n${data.stack}\n${JSON.stringify(events)}`)); }
                        if(data.type === 'complete') { clearTimeout(timer); resolve({ output: data.weights, report: data.report, events }); }
                    };
                    worker.postMessage({ type: 'train', provider, elo: 2000, goal: 'imitate',
                        dataset: { train: { samples }, validation: { samples } },
                        options: { epochs: 3, learningRate: 0.02, batchSize: 4, baseAnchor: 0.5 } });
                });
            } finally { worker.terminate(); }
            const { savePersonalModel } = await import('/app/assets/engines/Maia3/personal-models.js');
            const id = await savePersonalModel(new File([trained.output], 'test-maia3.onnx'), 1500);
            const engine = new Worker(`/app/assets/engines/Maia3/acasWorker.js?modelId=${id}&provider=${provider}`, { type: 'module' });
            try {
                const lines = await new Promise((resolve, reject) => {
                    const lines = [];
                    const timeout = setTimeout(() => reject(new Error(`Personal Maia 3 engine timed out: ${lines.join('\n')}`)), 90000);
                    engine.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
                    engine.onmessage = ({ data }) => {
                        if(data?.type === 'error') { clearTimeout(timeout); reject(new Error(data.message)); }
                        if(data === true) engine.postMessage({ method: 'uci', args: ['isready'] });
                        if(typeof data === 'string') {
                            lines.push(data);
                            if(data === 'readyok') {
                                engine.postMessage({ method: 'uci', args: ['position startpos'] });
                                engine.postMessage({ method: 'uci', args: ['go nodes 1'] });
                            }
                            if(data.startsWith('bestmove ')) { clearTimeout(timeout); resolve(lines); }
                        }
                    };
                });
                return { bytes: trained.output.byteLength, report: trained.report,
                    events: trained.events.map(event => event.type), lines };
            } finally { engine.terminate(); }
        }, provider);
        assert.ok(result.bytes > 90000000);
        assert.equal(result.report.format, 'maia3-onnx');
        assert.equal(result.report.elo, 2000);
        assert.equal(result.report.baseAnchor, 0.5);
        assert.equal(result.report.exportVerified, true);
        assert.equal(result.report.improved, true);
        assert.ok(result.report.exportedMetrics.loss < result.report.history[0].validationLoss);
        assert.ok(Math.abs(result.report.exportedMetrics.loss - result.report.history[result.report.bestEpoch].heldOutLoss) < 1e-9);
        assert.ok(result.lines.some(line => /^bestmove [a-h][1-8][a-h][1-8]/.test(line)));
        assert.ok(result.events.includes('batch'));
        if(provider === 'webgpu') assert.ok(result.report.parityError < 0.000002);
        console.log(JSON.stringify({ provider, bytes: result.bytes, bestEpoch: result.report.bestEpoch,
            baseline: result.report.history[0], exported: result.report.exportedMetrics,
            featureMs: result.report.featureMilliseconds, trainingMs: result.report.trainingMilliseconds,
            parity: result.report.parityError, bestmove: result.lines.at(-1) }));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
