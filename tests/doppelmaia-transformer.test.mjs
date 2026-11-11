import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { parseGameFiles, buildDataset } from '../tools/doppelmaia/data.js';
import { transformerOrder, trainTransformer } from '../tools/doppelmaia/transformer-training.js';
import { personalityTraits } from '../tools/doppelmaia/personality.js';

const pgn = `[White "MyPlayer"]
[Black "Other"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. Nc3 d6 6. Be3 O-O 7. O-O *

[White "Other"]
[Black "MyPlayer"]
[Result "*"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 Be7 5. Bf4 O-O 6. e3 c5 7. Bd3 *
`;

test('full training has deterministic complete epoch orders and rejects unsupported compute', async () => {
    const first = transformerOrder(97, 1), again = transformerOrder(97, 1);
    assert.deepEqual(first, again);
    assert.notDeepEqual(first, transformerOrder(97, 2));
    assert.deepEqual([...first].sort((a, b) => a - b), Array.from({ length: 97 }, (_, i) => i));
    await assert.rejects(trainTransformer({ provider: 'wasm' }), /requires WebGPU/);
    await assert.rejects(trainTransformer({ provider: 'webgpu', elo: 1500,
        dataset: { train: { samples: [{ gameId: 'same' }] }, validation: { samples: [{ gameId: 'same' }] } } }),
    /separate training and validation games/);
});

test('full training validates budgets, optimizer settings and novel boards before loading its GPU runtime', async () => {
    const dataset = buildDataset(parseGameFiles([{ name: 'games.pgn', text: pgn }]).games, 'myplayer', { maxPositions: 24 });
    const input = { provider: 'webgpu', elo: 1500, dataset };
    for(const options of [{ batchSize: 0 }, { batchSize: 33 }, { learningRate: 0 }, { learningRate: NaN },
        { learningRate: 0.01 }, { weightDecay: -1 }, { clipNorm: 0 }, { seed: -1 }])
        await assert.rejects(trainTransformer({ ...input, options }), /Invalid full Maia 3 training settings/);
    await assert.rejects(trainTransformer({ ...input, dataset: {
        train: { samples: Array(50000).fill(dataset.train.samples[0]) }, validation: dataset.validation
    } }), /50,000 positions/);
    const row = dataset.train.samples[0];
    await assert.rejects(trainTransformer({ ...input, dataset: {
        train: { samples: [row] }, validation: { samples: [{ ...row, gameId: 'separate-game' }] }
    } }), /No new validation boards remain/);
});

test('full transformer browser UI trains every block and exports an actual app model', {
    timeout: 360000, skip: process.env.DOPPELMAIA_FULL_TEST !== '1'
}, async () => {
    const dataset = buildDataset(parseGameFiles([{ name: 'games.pgn', text: pgn }]).games, 'myplayer', { maxPositions: 24 });
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    try {
        const page = await browser.newPage({ acceptDownloads: true }), errors = [];
        const pageError = error => errors.push(error.message);
        page.on('pageerror', pageError);
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Ready.'));
        await page.locator('#games').setInputFiles({ name: 'games.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(dataset)) });
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.equal(await page.locator('#training-method').inputValue(), 'full');
        assert.equal(await page.locator('#base-anchor').inputValue(), '0.25');
        assert.equal(await page.locator('#epochs').inputValue(), '12');
        assert.equal(await page.locator('#learning-rate').inputValue(), '0.00001');
        assert.equal(await page.locator('#positions').getAttribute('max'), '50000');
        await page.locator('#training-form .maia-advanced summary').click();
        await page.locator('#epochs').fill('2');
        await page.locator('#start').click();
        await page.waitForFunction(() => !document.querySelector('#download-weights').hidden
            || document.querySelector('#status').dataset.error === 'true', null, { timeout: 240000 });
        assert.notEqual(await page.locator('#status').getAttribute('data-error'), 'true', await page.locator('#log').textContent());
        const report = await page.evaluate(async () => (await fetch(document.querySelector('#download-report').href)).json());
        assert.equal(report.trainingMethod, 'full');
        assert.equal(report.trainableParameters, 22409728);
        assert.equal(report.tokenChannels, 96);
        assert.equal(report.historyEncoding, '8:oldest-first:per-frame-turn:earliest-padding');
        assert.equal(report.gradientProvider, 'webgpu');
        assert.ok(report.updates >= 2);
        assert.equal(report.exportVerified, true);
        assert.ok(report.baselineParityError < 0.002);
        assert.ok(report.exportMaximumLogitError < 0.005);
        assert.ok(report.novelValidation.positions > 0);
        assert.ok(report.exportedObjectiveLoss <= report.history[0].validationLoss + 1e-5);
        assert.match(report.selectionMetric, /unseen board/);
        assert.match(report.valueWarning, /value estimates/);
        assert.ok(await page.locator('#loss-chart circle').count() >= 4);
        const modelId = await page.evaluate(async () => {
            const { savePersonalModel } = await import('../../app/assets/engines/Maia3/personal-models.js');
            const weights = await (await fetch(document.querySelector('#download-weights').href)).arrayBuffer();
            return savePersonalModel(new File([weights], 'full-transformer-test.onnx'), 1500);
        });
        for(const width of [320, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
        assert.deepEqual(errors, []);
        page.off('pageerror', pageError);
        await page.goto(`${url}/app/`);
        const lines = await page.evaluate(modelId => new Promise((resolve, reject) => {
            const worker = new Worker(`./assets/engines/Maia3/acasWorker.js?modelId=${modelId}&provider=webgpu`, { type: 'module' });
            const lines = [], timeout = setTimeout(() => { worker.terminate(); reject(new Error('Full model engine timed out')); }, 90000);
            const fail = message => { clearTimeout(timeout); worker.terminate(); reject(new Error(message)); };
            worker.onerror = event => fail(event.message);
            worker.onmessage = ({ data }) => {
                if(data?.type === 'error') fail(data.message);
                if(data === true) worker.postMessage({ method: 'uci', args: ['isready'] });
                if(typeof data !== 'string') return;
                lines.push(data);
                if(data === 'readyok') {
                    worker.postMessage({ method: 'uci', args: ['position startpos'] });
                    worker.postMessage({ method: 'uci', args: ['go nodes 1'] });
                }
                if(data.startsWith('bestmove ')) { clearTimeout(timeout); worker.terminate(); resolve(lines); }
            };
        }), modelId);
        assert.ok(lines.some(line => /^bestmove [a-h][1-8][a-h][1-8]/.test(line)));
        assert.deepEqual(errors, []);
        console.log('Full transformer UI report', JSON.stringify({ updates: report.updates, bestEpoch: report.bestEpoch,
            baselineParityError: report.baselineParityError, exportMaximumLogitError: report.exportMaximumLogitError }));
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('full browser objectives, baseline fallback and unavailable GPU errors remain explicit', {
    timeout: 420000, skip: process.env.DOPPELMAIA_FULL_TEST !== '1'
}, async () => {
    const dataset = buildDataset(parseGameFiles([{ name: 'games.pgn', text: pgn }]).games, 'myplayer', { maxPositions: 24 });
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    try {
        const page = await browser.newPage();
        await page.goto(`${url}/tools/doppelmaia/`);
        const cases = [
            { goal: 'opening', opening: '1. e4 e5 2. Nf3 Nc6' },
            { goal: 'shape', squares: 'd4 e4' },
            { goal: 'personality', personality: { strength: 1,
                weights: Object.fromEntries(personalityTraits.map(({ id }) => [id, id === 'knight' ? 4 : 0])) } },
            { goal: 'imitate', learningRate: 1e-20 }
        ];
        for(const settings of cases) {
            const result = await page.evaluate(({ dataset, settings }) => new Promise((resolve, reject) => {
                const worker = new Worker('./maia3-trainer-worker.js', { type: 'module' });
                const batches = [], timer = setTimeout(() => finish(new Error('Full objective training timed out')), 180000);
                function finish(error, result) {
                    clearTimeout(timer);
                    worker.terminate();
                    if(error) reject(error); else resolve(result);
                }
                worker.onerror = event => finish(new Error(event.message));
                worker.onmessage = ({ data }) => {
                    if(data.type === 'error') finish(new Error(`${data.message}\n${data.stack}`));
                    if(data.type === 'batch') batches.push({ gradientNorm: data.gradientNorm, probability: data.probability });
                    if(data.type === 'complete') finish(null, { report: data.report, batches });
                };
                worker.postMessage({ type: 'train', provider: 'webgpu', elo: 1500, dataset, ...settings,
                    options: { method: 'full', epochs: 1, learningRate: settings.learningRate || 1e-5,
                        batchSize: 4, baseAnchor: 0, patience: 2 } });
            }), { dataset, settings });
            assert.equal(result.report.goal, settings.goal);
            assert.equal(result.report.exportVerified, true);
            assert.ok(result.batches.length > 0);
            assert.ok(result.batches.every(row => Number.isFinite(row.gradientNorm) && row.gradientNorm > 0
                && row.probability >= 0 && row.probability <= 1));
            if(settings.goal === 'opening') {
                assert.equal(result.report.opening, settings.opening);
                assert.ok(Number.isFinite(result.report.history[0].openingReplayLoss));
            }
            if(settings.goal === 'shape') {
                assert.deepEqual(result.report.squares, ['d4', 'e4']);
                assert.ok(result.report.exportedMetrics.goal >= 0 && result.report.exportedMetrics.goal <= 1);
            }
            if(settings.goal === 'personality') assert.ok(Number.isFinite(result.report.personality.learnedKL));
            if(settings.goal === 'imitate') {
                assert.equal(result.report.bestEpoch, 0);
                assert.equal(result.report.improved, false);
            }
        }
        const message = await page.evaluate(async () => {
            const { initializeTransformerGpu } = await import('./maia3-transformer.js');
            Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
            try { await initializeTransformerGpu(); return 'Unexpected success'; }
            catch(error) { return error.message; }
            finally { delete navigator.gpu; }
        });
        assert.match(message, /needs WebGPU/);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
