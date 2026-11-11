import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from '../../../tests/maia-elo/serve.mjs';

const [study = 'temp\\doppelmaia-personality-study'] = process.argv.slice(2);
const protocol = JSON.parse(await readFile(`${study}\\personality-report.json`, 'utf8'));
const reference = protocol.profiles.find(row => row.id === 'knight-fan');
const practice = JSON.parse(await readFile(`${study}\\practice.json`, 'utf8'));
const { server, url } = await startServer({ outFile: 'NUL' });
console.log('Reference server ready', url);
const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
try {
    const page = await browser.newPage();
    page.on('pageerror', error => console.error(error));
    page.on('console', message => { if(message.text().startsWith('Parity ')) console.log(message.text()); });
    await page.goto(`${url}/tools/doppelmaia/`);
    console.log('Tool opened');
    await page.waitForFunction(() => crossOriginIsolated && document.querySelector('#status')?.textContent.startsWith('Ready.'), null, { timeout: 30000 });
    console.log('Browser isolation ready');
    const result = await page.evaluate(async ({ dataset, configuration, test, nativePath }) => {
        const worker = new Worker('./maia3-trainer-worker.js', { type: 'module' });
        let output;
        try {
            output = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Full personality browser training timed out.')), 900000);
                worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
                worker.onmessage = ({ data }) => {
                    if(data.type === 'epoch') console.log('Parity epoch', data.point.epoch, data.point.validationLoss);
                    if(data.type === 'stage') console.log('Parity stage', data.stage);
                    if(data.type === 'error') { clearTimeout(timer); reject(new Error(data.message)); }
                    if(data.type === 'complete') { clearTimeout(timer); resolve(data); }
                };
                worker.postMessage({ type: 'train', provider: 'webgpu', elo: configuration.elo,
                    goal: 'personality', personality: configuration, personalityId: configuration.id, dataset,
                    options: { epochs: 40, learningRate: 0.005, batchSize: 32, patience: 8, featureSize: 512 } });
            });
        } finally { worker.terminate(); }
        const ort = await import('./runtime/dist/ort.webgpu.bundle.min.mjs');
        const { preprocessMaia3 } = await import('/app/assets/engines/Maia3/tensor.js');
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = new URL('./runtime/dist/', location.href).href;
        const response = await fetch(nativePath);
        if(!response.ok) throw new Error(`Native reference model HTTP ${response.status}.`);
        const native = await ort.InferenceSession.create(await response.arrayBuffer(), { executionProviders: ['webgpu'] });
        const trained = await ort.InferenceSession.create(output.weights, { executionProviders: ['webgpu'] });
        let maximumLogitError = 0;
        try {
            for(let start = 0; start < test.length; start += 8) {
                const batch = test.slice(start, start + 8);
                const input = {
                    tokens: new ort.Tensor('float32', Float32Array.from(batch.flatMap(sample => [...preprocessMaia3(sample.fen).boardTokens])), [batch.length, 64, 12]),
                    elo_self: new ort.Tensor('float32', new Float32Array(batch.length).fill(configuration.elo), [batch.length]),
                    elo_oppo: new ort.Tensor('float32', new Float32Array(batch.length).fill(configuration.elo), [batch.length])
                };
                try {
                    const a = await native.run(input), b = await trained.run(input);
                    for(let i = 0; i < a.logits_move.data.length; i++)
                        maximumLogitError = Math.max(maximumLogitError, Math.abs(a.logits_move.data[i] - b.logits_move.data[i]));
                    [...Object.values(a), ...Object.values(b)].forEach(tensor => tensor.dispose());
                } finally { Object.values(input).forEach(tensor => tensor.dispose()); }
            }
        } finally { await native.release(); await trained.release(); }
        return { report: output.report, maximumLogitError };
    }, { dataset: practice.dataset, configuration: reference.configuration,
        test: practice.test.samples.slice(0, 32),
        nativePath: `/${study.replaceAll('\\', '/')}/knight-fan.onnx` });
    const nativeValidation = reference.training.history.find(row => row.epoch === reference.training.bestEpoch).validationLoss;
    result.nativeValidationLoss = nativeValidation;
    result.validationLossError = Math.abs(result.report.exportedMetrics.loss - nativeValidation);
    assert.ok(result.validationLossError < 0.0005, `Full-run CUDA/browser validation loss differs by ${result.validationLossError}`);
    assert.ok(result.maximumLogitError < 0.005, `Full-run CUDA/browser logits differ by ${result.maximumLogitError}`);
    assert.equal(result.report.provider, 'webgpu');
    assert.equal(result.report.goal, 'personality');
    assert.ok(result.report.exportVerified);
    await writeFile(`${study}\\browser-parity.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ maximumLogitError: result.maximumLogitError, validationLossError: result.validationLossError,
        nativeBestEpoch: reference.training.bestEpoch, browserBestEpoch: result.report.bestEpoch,
        browserKL: result.report.personality.learnedKL, baselineKL: result.report.personality.baselineKL }));
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
