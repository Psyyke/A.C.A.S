import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox } from 'playwright';
import { Chess } from '../libraries/chessjs/chess.js';
import { candidateConverterSource } from './candidate-converter.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const runtime = resolve(process.env.LC0_TEST_RUNTIME || join(root, 'dist'));
const candidateModel = process.env.LC0_TEST_CANDIDATE_ONNX;
const captureInputs = process.env.LC0_TEST_INPUTS_OUTPUT;
function testNumber(name, fallback, min, max) {
    const raw = process.env[name];
    if(raw === undefined) return fallback;
    const number = Number(raw);
    if(!Number.isSafeInteger(number) || number < min || number > max)
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    return number;
}
const settings = {
    nodes: testNumber('LC0_TEST_NODES', 16, 4, 100000),
    threads: testNumber('LC0_TEST_THREADS', 1, 1, 32),
    batch: testNumber('LC0_TEST_BATCH', 1, 1, 256),
    timeoutMs: testNumber('LC0_TEST_TIMEOUT_MS', 45000, 1000, 3600000),
    provider: process.env.LC0_TEST_PROVIDER || null,
    convertType: process.env.LC0_TEST_CONVERT_TYPE || 'f32',
    inferenceDataType: process.env.LC0_TEST_INFERENCE_TYPE || 'f32',
    exactNodes: process.env.LC0_TEST_EXACT_NODES === '1',
    comparisonPositions: [
        'position startpos',
        'position startpos moves e2e4 e7e5 g1f3 b8c6 f1b5 a7a6'
    ],
    verbose: process.env.LC0_TEST_VERBOSE === '1',
    needConvertedBytes: Boolean(process.env.LC0_TEST_ONNX_OUTPUT || process.env.LC0_TEST_REFERENCE_ONNX
        || process.env.LC0_TEST_PROVIDER === 'webgpu' || (process.env.LC0_TEST_INFERENCE_TYPE || 'f32') !== 'f32')
};
const browserEngine = process.env.LC0_TEST_BROWSER_ENGINE || 'chromium';
if(settings.inferenceDataType !== 'f32' || process.env.LC0_TEST_EXTENDED_POSITIONS === '1') {
    settings.comparisonPositions.push(
        'position startpos moves d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3',
        'position fen 8/8/4k3/3p4/3P4/4K3/8/8 w - - 0 1',
        'position fen r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
        'position startpos moves e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5'
    );
}
if(!['chromium', 'firefox'].includes(browserEngine))
    throw new Error('LC0_TEST_BROWSER_ENGINE must be chromium or firefox');
if(browserEngine !== 'chromium' && process.env.LC0_TEST_UNSAFE_WEBGPU === '1')
    throw new Error('LC0_TEST_UNSAFE_WEBGPU is only available for Chromium');
if(settings.provider !== null && !['webgpu', 'wasm'].includes(settings.provider))
    throw new Error('LC0_TEST_PROVIDER must be webgpu or wasm');
if(!['f32', 'f16', 'f16-mixed'].includes(settings.convertType))
    throw new Error('LC0_TEST_CONVERT_TYPE must be f32, f16 or f16-mixed');
if(!['f32', 'f16', 'f16-mixed'].includes(settings.inferenceDataType)
    || settings.inferenceDataType === 'f16' && settings.provider !== 'webgpu'
    || settings.inferenceDataType === 'f16-mixed' && !settings.provider)
    throw new Error('LC0_TEST_INFERENCE_TYPE requires f32, f16-mixed with an ONNX provider, or f16 with webgpu');
if(settings.provider === 'webgpu' && settings.convertType !== 'f32')
    throw new Error('WebGPU parity comparison requires f32 conversion');
if(candidateModel && (settings.provider !== 'webgpu' || settings.inferenceDataType !== 'f16-mixed'))
    throw new Error('Experimental candidate models require webgpu and f16-mixed test settings for float32 interfaces.');
if(process.env.LC0_TEST_REFERENCE_ONNX && settings.convertType !== 'f32')
    throw new Error('Native ONNX comparison requires f32 conversion');
const files = new Map([
    ['/worker.js', [join(root, 'worker.js'), 'text/javascript']],
    ['/worker-tree.js', [join(root, 'worker-tree.js'), 'text/javascript']],
    ['/converter-worker.js', [join(root, 'converter-worker.js'), 'text/javascript']],
    ['/browser-inference.js', [join(root, 'browser-inference.js'), 'text/javascript']],
    ['/float16.js', [join(root, 'float16.js'), 'text/javascript']],
    ['/dist/lc0.js', [join(root, 'dist', 'lc0.js'), 'text/javascript']],
    ['/dist/lc0.wasm', [join(root, 'dist', 'lc0.wasm'), 'application/wasm']],
    ...['ort.webgpu.bundle.min.mjs', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm',
        'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']
        .map(name => [`/dist/${name}`, [join(runtime, name), name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript']]),
    ['/weights', [resolve(root, '..', '..', 'lc0-nets', 'maia-1100.pb'), 'application/octet-stream']],
    ['/large-weights', [resolve(root, '..', '..', 'lc0-nets', 'goodgyal-7.pb'), 'application/octet-stream']]
]);
if(candidateModel) {
    files.set('/candidate-onnx', [resolve(candidateModel), 'application/octet-stream']);
    files.set('/original-converter-worker.js', [join(root, 'converter-worker.js'), 'text/javascript']);
}
if(captureInputs)
    files.set('/original-browser-inference.js', [join(root, 'browser-inference.js'), 'text/javascript']);
if(process.env.LC0_TEST_WEIGHTS)
    files.set('/extra-weights', [resolve(process.env.LC0_TEST_WEIGHTS), 'application/octet-stream']);
if(process.env.LC0_TEST_REFERENCE_ONNX)
    files.set('/reference-onnx', [resolve(process.env.LC0_TEST_REFERENCE_ONNX), 'application/octet-stream']);
if(process.env.LC0_TEST_REFERENCE_F16_ONNX) {
    if(settings.inferenceDataType !== 'f16')
        throw new Error('LC0_TEST_REFERENCE_F16_ONNX requires float16 WebGPU inference');
    files.set('/reference-f16-onnx', [resolve(process.env.LC0_TEST_REFERENCE_F16_ONNX), 'application/octet-stream']);
}
files.set('/conversion-weights', process.env.LC0_TEST_CONVERT_WEIGHTS
    ? [resolve(process.env.LC0_TEST_CONVERT_WEIGHTS), 'application/octet-stream']
    : files.get('/weights'));
files.set('/primary-weights', process.env.LC0_TEST_PRIMARY_WEIGHTS
    ? [resolve(process.env.LC0_TEST_PRIMARY_WEIGHTS), 'application/octet-stream']
    : files.get('/weights'));
const candidateWeightHash = candidateModel
    ? createHash('sha256').update(await readFile(files.get('/primary-weights')[0])).digest('hex') : null;
let convertedBytes;
const convertedChunks = [];
const server = createServer(async (req, res) => {
    if(req.url !== '/unisolated' && !req.url.startsWith('/sw/')) {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    }
    if(req.url === '/' || req.url === '/unisolated') {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end('<title>Lc0 smoke test</title>');
        return;
    }
    if(req.url === '/sw/') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
            .end('<script>window.coi = { doReload() {} };</script><script src="coi-serviceworker.js"></script>');
        return;
    }
    if(candidateModel && req.url === '/converter-worker.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(candidateConverterSource(candidateWeightHash));
        return;
    }
    if(captureInputs && req.url === '/browser-inference.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(`
            export { createInferenceDispatcher } from './original-browser-inference.js';
            import { createBrowserInference as create } from './original-browser-inference.js';
            export async function createBrowserInference(...args) {
                const result = await create(...args);
                const dispatch = result.inference;
                result.inference = (...parameters) => {
                    const input = new Float32Array(parameters[8], parameters[0] >>> 0, parameters[1] * 112 * 64);
                    self.postMessage({ type: 'precision-input', batch: parameters[1], values: Array.from(input) });
                    return dispatch(...parameters);
                };
                return result;
            }
        `);
        return;
    }
    if(req.url === '/converted' && req.method === 'GET' && convertedBytes) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(convertedBytes);
        return;
    }
    if(req.url === '/converted' && req.method === 'POST') {
        try {
            const chunks = [];
            for await(const chunk of req) chunks.push(chunk);
            convertedChunks.push(...chunks);
            res.writeHead(204).end();
        } catch(error) {
            console.error(error);
            res.writeHead(500).end('Could not receive converted model');
        }
        return;
    }
    const file = req.url === '/sw/coi-serviceworker.js'
        ? [resolve(root, '..', '..', '..', 'coi-serviceworker.js'), 'text/javascript']
        : files.get(req.url.startsWith('/sw/') ? req.url.slice(3) : req.url);
    if(!file) { res.writeHead(404).end(); return; }
    try {
        const content = await readFile(file[0]);
        res.writeHead(200, { 'Content-Type': file[1] }).end(content);
    } catch(error) {
        console.error(error);
        res.writeHead(500).end('Could not read test asset');
    }
});

async function withPageTimeout(page, promise, timeoutMs, description) {
    let timer;
    let crash;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${description} timed out`)), timeoutMs);
                crash = () => reject(new Error(`${description} failed because the browser page crashed`));
                page.once('crash', crash);
            })
        ]);
    } finally {
        clearTimeout(timer);
        page.off('crash', crash);
    }
}

await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
let browser;
try {
    browser = await (browserEngine === 'firefox' ? firefox : chromium).launch({
        headless: process.env.LC0_TEST_HEADED !== '1',
        executablePath: process.env.LC0_TEST_BROWSER || undefined,
        args: process.env.LC0_TEST_UNSAFE_WEBGPU === '1'
            ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] : []
    });
    let page = await browser.newPage();
    if(settings.verbose) page.on('console', message => console.log('Browser:', message.text()));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const conversion = await withPageTimeout(page, page.evaluate(async settings => {
        const response = await fetch('/conversion-weights');
        if(!response.ok) throw new Error('Weights request failed');
        const weights = await response.arrayBuffer();
        const worker = new Worker('/converter-worker.js', { type: 'module' });
        const logs = [];
        const errors = [];
        let output;
        try {
            output = await new Promise((resolveConversion, rejectConversion) => {
                const timeout = setTimeout(() => rejectConversion(new Error(`Conversion timed out: ${logs.slice(-8).join('\n')}`)), settings.timeoutMs);
                worker.onerror = event => {
                    clearTimeout(timeout);
                    rejectConversion(new Error(event.message || 'Converter worker failed'));
                };
                worker.onmessage = ({ data }) => {
                    if(data.type === 'log') {
                        logs.push(data.line);
                        if(settings.verbose) console.log(data.line);
                    }
                    if(data.type === 'error') {
                        if(/nonempty Lc0 weights file is required|Expected the .* ONNX data type|only be used once/i.test(data.message)) {
                            errors.push(data.message);
                            return;
                        }
                        clearTimeout(timeout);
                        rejectConversion(new Error(`${data.message}\n${logs.slice(-8).join('\n')}`));
                    }
                    if(data.type === 'converted') {
                        if(settings.verbose) console.log(`Converted ${data.output.byteLength} bytes`);
                        clearTimeout(timeout);
                        resolveConversion(data.output);
                    }
                };
                worker.postMessage({ type: 'convert', weights: new ArrayBuffer(0) });
                worker.postMessage({ type: 'convert', weights: new Uint8Array([1]).buffer, dataType: 'invalid' });
                worker.postMessage({ type: 'convert', weights, dataType: settings.convertType }, [weights]);
                worker.postMessage({ type: 'convert', weights: new Uint8Array([1]).buffer });
            });
        } finally {
            worker.terminate();
        }
        if(settings.needConvertedBytes) {
            const chunkSize = 8 * 1024 * 1024;
            for(let start = 0; start < output.byteLength; start += chunkSize) {
                const saved = await fetch('/converted', {
                    method: 'POST',
                    body: output.slice(start, Math.min(start + chunkSize, output.byteLength))
                });
                if(!saved.ok) throw new Error('Could not transfer converted model to the test server');
                if(settings.verbose) console.log(`Transferred ${Math.min(start + chunkSize, output.byteLength)} bytes`);
            }
        }
        return { size: output.byteLength, logs, errors };
    }, settings), settings.timeoutMs + 30000, 'Browser conversion');
    assert.ok(conversion.size > 1000, 'Expected a nonempty ONNX model');
    assert.equal(conversion.errors.length, 3, 'Expected invalid and duplicate requests to be rejected');
    if(settings.needConvertedBytes) {
        convertedBytes = Buffer.concat(convertedChunks);
        convertedChunks.length = 0;
        assert.equal(convertedBytes.length, conversion.size);
    }
    if(process.env.LC0_TEST_ONNX_OUTPUT)
        await writeFile(resolve(process.env.LC0_TEST_ONNX_OUTPUT), convertedBytes);
    if(process.env.LC0_TEST_REFERENCE_ONNX) {
        const comparison = await page.evaluate(async () => {
            const ort = await import('/dist/ort.webgpu.bundle.min.mjs');
            ort.env.wasm.wasmPaths = new URL('/dist/', location.href).href;
            ort.env.wasm.numThreads = 1;
            const responses = await Promise.all(['/converted', '/reference-onnx'].map(url => fetch(url)));
            if(responses.some(response => !response.ok)) throw new Error('Could not read ONNX model for comparison');
            const models = await Promise.all(responses.map(async response => new Uint8Array(await response.arrayBuffer())));
            const converted = await ort.InferenceSession.create(models[0], { executionProviders: ['wasm'] });
            const native = await ort.InferenceSession.create(models[1], { executionProviders: ['wasm'] });
            try {
                if(converted.inputNames.join() !== native.inputNames.join()
                    || converted.outputNames.join() !== native.outputNames.join())
                    throw new Error('Converted and native ONNX interfaces differ');
                const maxScaled = {};
                for(const pattern of ['zero', 'periodic', 'alternating']) {
                    const input = Float32Array.from({ length: 112 * 64 }, (_, i) =>
                        pattern === 'zero' ? 0 : pattern === 'periodic' ? Number(i % 7 === 0) : (i % 2 ? -0.5 : 0.5));
                    const feeds = { '/input/planes': new ort.Tensor('float32', input, [1, 112, 8, 8]) };
                    const expected = await native.run(feeds);
                    const actual = await converted.run(feeds);
                    for(const name of native.outputNames) {
                        const a = actual[name], b = expected[name];
                        if(!a || a.type !== b.type || a.dims.join() !== b.dims.join() || a.data.length !== b.data.length)
                            throw new Error(`Converted and native ONNX output shapes differ for ${name}`);
                        for(let i = 0; i < b.data.length; i++) {
                            if(!Number.isFinite(a.data[i]) || !Number.isFinite(b.data[i]))
                                throw new Error(`Non-finite ${name} output`);
                            const scaled = Math.abs(a.data[i] - b.data[i]) / (0.00001 + Math.abs(b.data[i]) * 0.00001);
                            maxScaled[name] = Math.max(maxScaled[name] || 0, scaled);
                        }
                    }
                }
                return maxScaled;
            } finally {
                await native.release();
                await converted.release();
            }
        });
        for(const [name, difference] of Object.entries(comparison))
            assert.ok(difference <= 1, `${name} differs from native conversion: ${difference}`);
        console.log('Native converter output parity:', JSON.stringify(comparison));
    }
    if(settings.provider === 'webgpu') {
        const parity = await page.evaluate(async () => {
            const ort = await import('/dist/ort.webgpu.bundle.min.mjs');
            ort.env.wasm.wasmPaths = new URL('/dist/', location.href).href;
            ort.env.wasm.numThreads = 1;
            const model = new Uint8Array(await (await fetch('/converted')).arrayBuffer());
            const gpu = await ort.InferenceSession.create(model, { executionProviders: ['webgpu'] });
            const cpu = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
            const input = Float32Array.from({ length: 112 * 64 }, (_, i) => i % 7 === 0 ? 1 : 0);
            const feeds = { '/input/planes': new ort.Tensor('float32', input, [1, 112, 8, 8]) };
            const expected = await cpu.run(feeds);
            const actual = await gpu.run(feeds);
            const differences = {};
            for(const name of cpu.outputNames) {
                if(!actual[name] || expected[name].data.length !== actual[name].data.length)
                    throw new Error(`Missing or mismatched GPU output ${name}`);
                let max = 0;
                let maxScaled = 0;
                for(let i = 0; i < expected[name].data.length; i++) {
                    const reference = expected[name].data[i];
                    const observed = actual[name].data[i];
                    if(!Number.isFinite(reference) || !Number.isFinite(observed))
                        throw new Error(`Non-finite ${name} output`);
                    const delta = Math.abs(reference - observed);
                    max = Math.max(max, delta);
                    maxScaled = Math.max(maxScaled, delta / (0.001 + Math.abs(reference) * 0.0001));
                }
                differences[name] = { max, maxScaled, cpu: Array.from(expected[name].data.slice(0, 4)), gpu: Array.from(actual[name].data.slice(0, 4)) };
            }
            await cpu.release();
            await gpu.release();
            const adapter = await navigator.gpu.requestAdapter();
            return { differences, adapter: adapter ? { vendor: adapter.info.vendor, device: adapter.info.device,
                description: adapter.info.description, isFallbackAdapter: adapter.info.isFallbackAdapter } : null };
        });
        for(const [name, difference] of Object.entries(parity.differences))
            assert.ok(difference.maxScaled <= 1, `${name} WebGPU output differs from WASM: ${JSON.stringify(difference)}`);
        console.log('WebGPU/WASM output parity:', JSON.stringify(parity));
    }
    if(settings.inferenceDataType !== 'f32') {
        const parity = await withPageTimeout(page, page.evaluate(async ({ hasReference, dataType, provider }) => {
            const ort = await import('/dist/ort.webgpu.bundle.min.mjs');
            const { encodeFloat16, decodeFloat16 } = await import('/float16.js');
            ort.env.wasm.wasmPaths = new URL('/dist/', location.href).href;
            ort.env.wasm.numThreads = 1;
            const weights = await (await fetch('/conversion-weights')).arrayBuffer();
            const worker = new Worker('/converter-worker.js', { type: 'module' });
            let model;
            try {
                model = await new Promise((resolveModel, reject) => {
                    worker.onerror = event => reject(new Error(event.message));
                    worker.onmessage = ({ data }) => {
                        if(data.type === 'error') reject(new Error(data.message));
                        if(data.type === 'converted') resolveModel(data.output);
                    };
                    worker.postMessage({ type: 'convert', weights, dataType }, [weights]);
                });
            } finally {
                worker.terminate();
            }
            const referenceModel = new Uint8Array(await (await fetch('/converted')).arrayBuffer());
            const gpu = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: [provider] });
            const cpu = await ort.InferenceSession.create(referenceModel, { executionProviders: ['wasm'] });
            const differences = {};
            let native;
            const nativeDifferences = {};
            try {
                if(hasReference) {
                    const response = await fetch('/reference-f16-onnx');
                    if(!response.ok) throw new Error('Could not read native float16 ONNX model');
                    native = await ort.InferenceSession.create(new Uint8Array(await response.arrayBuffer()),
                        { executionProviders: ['webgpu'] });
                    if(native.inputNames.join() !== gpu.inputNames.join() || native.outputNames.join() !== gpu.outputNames.join())
                        throw new Error('Browser and native float16 ONNX interfaces differ');
                }
                for(const batch of [1, 2, 16]) {
                    for(let pattern = 0; pattern < 3; pattern++) {
                        const input = Float32Array.from({ length: batch * 112 * 64 }, (_, i) =>
                            pattern === 0 ? 0 : pattern === 1 ? (i % 7 === 0 ? 1 : 0) : (i % 11 - 5) / 5);
                        const shape = [batch, 112, 8, 8];
                        const expected = await cpu.run({ '/input/planes': new ort.Tensor('float32', input, shape) });
                        const feeds = { '/input/planes': dataType === 'f16'
                            ? new ort.Tensor('float16', Uint16Array.from(input, encodeFloat16), shape)
                            : new ort.Tensor('float32', input, shape) };
                        const actual = await gpu.run(feeds);
                        const nativeOutput = native ? await native.run(feeds) : null;
                        for(const name of cpu.outputNames) {
                            if(!actual[name] || actual[name].dims.join() !== expected[name].dims.join()
                                || actual[name].data.length !== expected[name].data.length)
                                throw new Error(`Missing or mismatched float16 output ${name}`);
                            const values = actual[name].data;
                            let max = 0;
                            for(let i = 0; i < values.length; i++) {
                                const value = values instanceof Uint16Array ? decodeFloat16(values[i]) : values[i];
                                if(!Number.isFinite(value) || !Number.isFinite(expected[name].data[i]))
                                    throw new Error(`Non-finite output ${name}`);
                                max = Math.max(max, Math.abs(value - expected[name].data[i]));
                            }
                            if(!differences[name]) differences[name] = [];
                            differences[name].push(max);
                            if(nativeOutput) {
                                const tensor = nativeOutput[name];
                                if(!tensor || tensor.type !== actual[name].type || tensor.dims.join() !== actual[name].dims.join()
                                    || tensor.data.length !== values.length)
                                    throw new Error(`Native float16 output shape differs for ${name}`);
                                let nativeMax = nativeDifferences[name] || 0;
                                for(let i = 0; i < values.length; i++) {
                                    const a = values instanceof Uint16Array ? decodeFloat16(values[i]) : values[i];
                                    const b = tensor.data instanceof Uint16Array ? decodeFloat16(tensor.data[i]) : tensor.data[i];
                                    if(!Number.isFinite(b)) throw new Error(`Non-finite native float16 output ${name}`);
                                    nativeMax = Math.max(nativeMax, Math.abs(a - b));
                                }
                                nativeDifferences[name] = nativeMax;
                            }
                        }
                    }
                }
            } finally {
                if(native) await native.release();
                await gpu.release();
                await cpu.release();
            }
            return { differences, nativeDifferences };
        }, { hasReference: Boolean(process.env.LC0_TEST_REFERENCE_F16_ONNX),
            dataType: settings.inferenceDataType, provider: settings.provider }),
        settings.timeoutMs, 'Float16 model comparison');
        if(process.env.LC0_TEST_REFERENCE_F16_ONNX) {
            console.log('Browser versus native float16 model on WebGPU:', JSON.stringify(parity.nativeDifferences));
            for(const [name, difference] of Object.entries(parity.nativeDifferences))
                assert.ok(difference === 0, `${name} differs from native float16 conversion: ${difference}`);
        }
        console.log(`${settings.inferenceDataType} ${settings.provider} versus float32 WASM output differences:`, JSON.stringify(parity.differences));
        for(const [name, differences] of Object.entries(parity.differences))
            assert.ok(Math.max(...differences) <= (name === '/output/policy' ? 0.2 : 0.01),
                `${name} float16 output differs from float32: ${differences}`);
    }
    const invalidConversion = await page.evaluate(async () => {
        const worker = new Worker('/converter-worker.js', { type: 'module' });
        const logs = [];
        try {
            return await new Promise((resolveError, reject) => {
                const timer = setTimeout(() => reject(new Error('Invalid conversion timed out')), 30000);
                worker.onerror = event => {
                    clearTimeout(timer);
                    reject(new Error(event.message || 'Converter worker failed'));
                };
                worker.onmessage = ({ data }) => {
                    if(data.type === 'log') logs.push(data.line);
                    if(data.type === 'converted') {
                        clearTimeout(timer);
                        reject(new Error('Invalid weights unexpectedly converted'));
                    }
                    if(data.type === 'error') {
                        clearTimeout(timer);
                        resolveError({ message: data.message, logs });
                    }
                };
                worker.postMessage({ type: 'convert', weights: new Uint8Array([1, 2, 3, 4]).buffer });
            });
        } finally {
            worker.terminate();
        }
    });
    assert.match(invalidConversion.message, /invalid|weights|truncated|abort/i);
    const result = await page.evaluate(async settings => {
        const weightsResponse = await fetch('/primary-weights');
        if(!weightsResponse.ok) throw new Error('Weights request failed');
        const weights = await weightsResponse.arrayBuffer();
        const worker = new Worker('/worker.js', { type: 'module' });
        const events = [];
        let failure;
        const describeFailure = message => new Error(`${message || 'Lc0 worker failed'}. Recent logs: `
            + JSON.stringify(events.filter(event => event.type === 'log').slice(-8)));
        worker.onerror = event => { if(!failure) failure = describeFailure(event.message); };
        worker.onmessage = event => {
            events.push(event.data);
            if(!failure && event.data.type === 'error') failure = describeFailure(event.data.message);
            if(!failure && event.data.type === 'uci' && event.data.line.startsWith('error '))
                failure = describeFailure(event.data.line);
        };
        const wait = async (predicate, start = 0) => {
            const end = Date.now() + settings.timeoutMs;
            while(Date.now() < end) {
                if(failure) throw failure;
                const found = events.slice(start).find(predicate);
                if(found) return found;
                await new Promise(resolveWait => setTimeout(resolveWait, 10));
            }
            throw new Error(`Timed out: ${JSON.stringify(events.slice(-8))}`);
        };
        const uci = line => worker.postMessage({ type: 'uci', line });
        const lineIs = prefix => event => event.type === 'uci' && event.line.startsWith(prefix);
        try {
            worker.postMessage({ type: 'initialize', weights, provider: settings.provider,
                inferenceDataType: settings.inferenceDataType }, [weights]);
            await wait(event => event.type === 'ready');
            uci('uci');
            await wait(lineIs('uciok'));
            uci('setoption name NNCacheSize value 1000');
            uci(`setoption name Threads value ${settings.threads}`);
            uci(`setoption name MinibatchSize value ${settings.batch}`);
            if(settings.exactNodes) uci('setoption name SmartPruningFactor value 0');
            uci('setoption name MultiPV value 2');
            uci('isready');
            await wait(lineIs('readyok'));
            uci('position startpos moves e2e4');
            const start = events.length;
            const searchStarted = performance.now();
            uci(`go nodes ${settings.nodes}`);
            const best = await wait(lineIs('bestmove '), start);
            const searchWallMs = Math.round(performance.now() - searchStarted);
            const search = events.slice(start).filter(event => event.type === 'uci').map(event => event.line);
            uci('position startpos');
            const stopStart = events.length;
            uci('go infinite');
            await wait(lineIs('info '), stopStart);
            uci('stop');
            const stopped = await wait(lineIs('bestmove '), stopStart);
            uci('ucinewgame');
            uci('setoption name MultiPV value 1');
            uci('setoption name UCI_ShowWDL value true');
            uci('position fen 4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
            const epStart = events.length;
            uci('go nodes 4 searchmoves e5d6');
            const enPassant = await wait(lineIs('bestmove '), epStart);
            const enPassantLines = events.slice(epStart).filter(event => event.type === 'uci').map(event => event.line);
            uci('position fen 4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
            const promotionStart = events.length;
            uci('go nodes 4 searchmoves a7a8q');
            const promotion = await wait(lineIs('bestmove '), promotionStart);
            uci('position fen 7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
            const mateStart = events.length;
            uci('go nodes 2');
            const checkmate = await wait(lineIs('bestmove '), mateStart);
            uci('setoption name UCI_Chess960 value true');
            uci('position fen r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
            const castleStart = events.length;
            uci('go nodes 4 searchmoves e1h1');
            const castle = await wait(lineIs('bestmove '), castleStart);
            uci('position fen 7k/8/8/8/8/8/8/RK1R4 w D - 0 1');
            const randomCastleStart = events.length;
            uci('go nodes 4 searchmoves b1d1');
            const randomCastle = await wait(lineIs('bestmove '), randomCastleStart);
            const comparisons = [];
            if(settings.provider) {
                for(const line of ['setoption name UCI_Chess960 value false', 'setoption name UCI_ShowWDL value false',
                    'setoption name Threads value 1', 'setoption name MinibatchSize value 1',
                    'setoption name MultiPV value 2']) uci(line);
                for(const position of settings.comparisonPositions) {
                    uci('ucinewgame');
                    uci(position);
                    const comparisonStart = events.length;
                    uci('go nodes 2');
                    await wait(lineIs('bestmove '), comparisonStart);
                    comparisons.push(events.slice(comparisonStart).filter(event => event.type === 'uci').map(event => event.line));
                }
            }
            uci('quit');
            return { identity: events.find(lineIs('id name '))?.line, settings, searchWallMs, best: best.line, search, stopped: stopped.line,
                precisionInputs: events.filter(event => event.type === 'precision-input').map(({ batch, values }) => ({ batch, values })),
                enPassant: enPassant.line, enPassantLines, promotion: promotion.line, checkmate: checkmate.line,
                castle: castle.line, randomCastle: randomCastle.line, comparisons };
        } finally {
            worker.terminate();
        }
    }, settings);
    if(captureInputs) {
        assert.ok(result.precisionInputs.length, 'Expected captured upstream Lc0 input tensors');
        await writeFile(captureInputs, JSON.stringify(result.precisionInputs));
        console.log(`Captured ${result.precisionInputs.length} upstream input batches in ${captureInputs}`);
    }
    delete result.precisionInputs;
    assert.match(result.identity, /Lc0 v0\.32\.1/);
    assert.match(result.best, /^bestmove [a-h][1-8][a-h][1-8][qrbn]?/);
    assert.match(result.stopped, /^bestmove [a-h][1-8][a-h][1-8][qrbn]?/);
    assert.ok(result.search.some(line => / nodes \d+/.test(line) && / pv /.test(line)), 'Expected search info and PV');
    assert.ok(result.search.some(line => / multipv 2 /.test(line)), 'Expected second principal variation');
    if(settings.exactNodes) {
        const reportedNodes = result.search.flatMap(line => {
            const match = line.match(/\bnodes (\d+)\b/);
            return match ? [Number(match[1])] : [];
        });
        assert.ok(Math.max(...reportedNodes) >= settings.nodes,
            `Expected at least ${settings.nodes} nodes, got ${Math.max(...reportedNodes)}`);
    }
    if(settings.provider) {
        await page.close();
        page = await browser.newPage();
        if(settings.verbose) page.on('console', message => console.log('Browser:', message.text()));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        const cpuSearches = await page.evaluate(async ({ timeoutMs, comparisonPositions }) => {
            const response = await fetch('/primary-weights');
            if(!response.ok) throw new Error('Weights request failed');
            const weights = await response.arrayBuffer();
            const worker = new Worker('/worker.js', { type: 'module' });
            const searches = [[]];
            const diagnostics = [];
            try {
                return await new Promise((resolveSearch, reject) => {
                    const timer = setTimeout(() => reject(new Error('CPU comparison timed out')), timeoutMs);
                    worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message || 'CPU worker failed')); };
                    worker.onmessage = ({ data }) => {
                        if(data.type === 'log') diagnostics.push(data.line);
                        if(data.type === 'error' || data.type === 'uci' && data.line.startsWith('error ')) {
                            clearTimeout(timer);
                            reject(new Error(`CPU comparison failed: ${data.message || data.line || JSON.stringify(data)}. `
                                + `Recent logs: ${JSON.stringify(diagnostics.slice(-8))}`));
                        } else if(data.type === 'ready') {
                            for(const line of ['setoption name Threads value 1', 'setoption name MinibatchSize value 1',
                                'setoption name MultiPV value 2', 'position startpos moves e2e4', 'go nodes 2'])
                                worker.postMessage({ type: 'uci', line });
                        } else if(data.type === 'uci') {
                            searches[searches.length - 1].push(data.line);
                            if(data.line.startsWith('bestmove ')) {
                                const nextPosition = comparisonPositions[searches.length - 1];
                                if(nextPosition) {
                                    searches.push([]);
                                    for(const line of ['ucinewgame', nextPosition, 'go nodes 2'])
                                        worker.postMessage({ type: 'uci', line });
                                } else {
                                    clearTimeout(timer);
                                    resolveSearch(searches);
                                }
                            }
                        }
                    };
                    worker.postMessage({ type: 'initialize', weights }, [weights]);
                });
            } finally {
                worker.terminate();
            }
        }, settings);
        const firstScores = lines => {
            // Terminal child visits can take a two-node request straight to three.
            const nodes = lines.find(line => / nodes ([2-9]|\d{2,}) /.test(line))?.match(/ nodes (\d+) /)?.[1];
            return lines
                .filter(line => line.includes(` nodes ${nodes} `))
                .map(line => line.match(/score cp (-?\d+).* multipv (\d+) pv (\S+)/))
                .filter(Boolean)
                .map(([, score, multipv, move]) => ({ score: Number(score), multipv, move }));
        };
        const actualSearches = [result.search, ...result.comparisons];
        assert.equal(actualSearches.length, cpuSearches.length);
        for(let position = 0; position < cpuSearches.length; position++) {
            const cpu = firstScores(cpuSearches[position]);
            const actual = firstScores(actualSearches[position]);
            assert.equal(cpu.length, 2, `Expected two CPU baseline evaluations for position ${position}`);
            assert.equal(actual.length, 2, `Expected two ONNX baseline evaluations for position ${position}: ${JSON.stringify(actualSearches[position])}`);
            for(let i = 0; i < cpu.length; i++) {
                assert.equal(actual[i].multipv, cpu[i].multipv);
                assert.equal(actual[i].move, cpu[i].move,
                    `Early search moves differ at position ${position}: ${JSON.stringify({ cpu, actual })}`);
                assert.ok(Math.abs(actual[i].score - cpu[i].score) <= (settings.inferenceDataType !== 'f32' ? 10 : 1),
                    `ONNX search score differs from Eigen at position ${position}: ${JSON.stringify({ cpu, actual })}`);
            }
        }
    }
    const board = new Chess();
    assert.ok(board.move({ from: 'e2', to: 'e4' }));
    const move = result.best.split(' ')[1];
    assert.ok(board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }), 'Expected a legal best move');
    board.reset();
    const stoppedMove = result.stopped.split(' ')[1];
    assert.ok(board.move({ from: stoppedMove.slice(0, 2), to: stoppedMove.slice(2, 4), promotion: stoppedMove[4] }), 'Expected a legal stopped move');
    assert.match(result.enPassant, /^bestmove e5d6(?:\s|$)/);
    assert.match(result.promotion, /^bestmove a7a8q(?:\s|$)/);
    assert.match(result.checkmate, /^bestmove (?:\(none\)|0000)(?:\s|$)/);
    assert.match(result.castle, /^bestmove e1h1(?:\s|$)/);
    assert.match(result.randomCastle, /^bestmove b1d1(?:\s|$)/);
    assert.ok(result.enPassantLines.some(line => /\bwdl \d+ \d+ \d+/.test(line)), 'Expected WDL in search output');
    const parallel = await page.evaluate(async ({ hasExtraWeights, provider, inferenceDataType }) => {
        const urls = ['/weights', '/large-weights', ...(hasExtraWeights ? ['/extra-weights'] : [])];
        const responses = await Promise.all(urls.map(url => fetch(url)));
        if(responses.some(response => !response.ok)) throw new Error('Weights request failed');
        const weights = await Promise.all(responses.map(response => response.arrayBuffer()));
        async function search(buffer, threads) {
            const worker = new Worker('/worker.js', { type: 'module' });
            const events = [];
            try {
                return await new Promise((resolveSearch, reject) => {
                    const timer = setTimeout(() => reject(new Error(`Search timed out: ${JSON.stringify(events.slice(-8))}`)), 60000);
                    worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message || 'Worker failed')); };
                    worker.onmessage = ({ data }) => {
                        events.push(data);
                        if(data.type === 'error' || data.type === 'uci' && data.line.startsWith('error ')) {
                            clearTimeout(timer);
                            reject(new Error(data.message || data.line));
                        } else if(data.type === 'ready') {
                            const options = threads === null ? [] : ['setoption name NNCacheSize value 1000',
                                `setoption name Threads value ${threads}`, 'setoption name MinibatchSize value 1'];
                            for(const line of [...options, 'position startpos', 'go nodes 4']) {
                                worker.postMessage({ type: 'uci', line });
                            }
                        } else if(data.type === 'uci' && data.line.startsWith('bestmove ')) {
                            clearTimeout(timer);
                            resolveSearch(data.line);
                        }
                    };
                    worker.postMessage({ type: 'initialize', weights: buffer, provider, inferenceDataType }, [buffer]);
                });
            } finally {
                worker.terminate();
            }
        }
        return Promise.all(weights.map((buffer, index) => search(buffer, index === 0 ? null : 2)));
    }, { hasExtraWeights: Boolean(process.env.LC0_TEST_WEIGHTS), provider: settings.provider,
        inferenceDataType: settings.inferenceDataType });
    for(const resultLine of parallel) {
        const move = resultLine.split(' ')[1];
        board.reset();
        assert.ok(board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }),
            `Expected a legal move from concurrent search: ${resultLine}`);
    }
    const invalid = await page.evaluate(async () => {
        const worker = new Worker('/worker.js', { type: 'module' });
        try {
            return await new Promise((resolveError, reject) => {
                const timer = setTimeout(() => reject(new Error('Invalid-weights error timed out')), 30000);
                worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message || 'Worker failed')); };
                worker.onmessage = ({ data }) => {
                    if(data.type === 'ready') {
                        worker.postMessage({ type: 'uci', line: 'position startpos' });
                        worker.postMessage({ type: 'uci', line: 'go nodes 1' });
                    } else if(data.type === 'error' || data.type === 'uci' && data.line.startsWith('error ')) {
                        clearTimeout(timer);
                        resolveError(data.message || data.line);
                    }
                };
                worker.postMessage({ type: 'initialize', weights: new Uint8Array([1, 2, 3, 4]).buffer });
            });
        } finally {
            worker.terminate();
        }
    });
    assert.match(invalid, /invalid|weights|truncated|header/i);
    const invalidOnnx = await page.evaluate(async () => {
        const worker = new Worker('/worker.js', { type: 'module' });
        try {
            return await new Promise((resolveError, reject) => {
                const timer = setTimeout(() => reject(new Error('Invalid ONNX weights test timed out')), 30000);
                worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message || 'Worker failed')); };
                worker.onmessage = ({ data }) => {
                    if(data.type === 'ready') {
                        clearTimeout(timer);
                        reject(new Error('Invalid weights unexpectedly initialized ONNX inference'));
                    } else if(data.type === 'error') {
                        clearTimeout(timer);
                        resolveError(data.message);
                    }
                };
                worker.postMessage({ type: 'initialize', weights: new Uint8Array([1, 2, 3, 4]).buffer, provider: 'wasm' });
            });
        } finally {
            worker.terminate();
        }
    });
    assert.match(invalidOnnx, /invalid|weights|truncated|abort/i);
    const protocol = await page.evaluate(async () => {
        const worker = new Worker('/worker.js', { type: 'module' });
        const errors = [];
        try {
            return await new Promise((resolveProtocol, reject) => {
                const timer = setTimeout(() => reject(new Error('Protocol validation timed out')), 30000);
                worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message || 'Worker failed')); };
                worker.onmessage = ({ data }) => {
                    if(data.type === 'error') {
                        errors.push(data.message);
                        if(errors.length === 2) {
                            clearTimeout(timer);
                            resolveProtocol(errors);
                        }
                    }
                };
                worker.postMessage({ type: 'uci', line: 'isready' });
                worker.postMessage({ type: 'initialize', weights: new ArrayBuffer(0) });
            });
        } finally {
            worker.terminate();
        }
    });
    assert.match(protocol[0], /not ready/i);
    assert.match(protocol[1], /weights file is required/i);
    const invalidProvider = await page.evaluate(async () => {
        const worker = new Worker('/worker.js', { type: 'module' });
        try {
            return await new Promise((resolveError, reject) => {
                const timer = setTimeout(() => reject(new Error('Provider validation timed out')), 30000);
                worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message || 'Worker failed')); };
                worker.onmessage = ({ data }) => {
                    if(data.type !== 'error') return;
                    clearTimeout(timer);
                    resolveError(data.message);
                };
                worker.postMessage({ type: 'initialize', weights: new Uint8Array([1]).buffer, provider: '' });
            });
        } finally {
            worker.terminate();
        }
    });
    assert.match(invalidProvider, /webgpu or wasm/i);
    const duplicate = await page.evaluate(async () => {
        const weights = await (await fetch('/weights')).arrayBuffer();
        const worker = new Worker('/worker.js', { type: 'module' });
        const events = [];
        try {
            return await new Promise((resolveDuplicate, reject) => {
                const timer = setTimeout(() => reject(new Error('Duplicate initialization timed out')), 30000);
                worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message || 'Worker failed')); };
                worker.onmessage = ({ data }) => {
                    if(data.type === 'error' || data.type === 'ready') events.push(data);
                    if(data.type === 'ready') worker.postMessage({ type: 'uci', line: 'isready' });
                    if(data.type === 'uci' && data.line === 'readyok') {
                        clearTimeout(timer);
                        resolveDuplicate(events);
                    }
                };
                worker.postMessage({ type: 'initialize', weights }, [weights]);
                worker.postMessage({ type: 'initialize', weights: new Uint8Array([1]).buffer });
            });
        } finally {
            worker.terminate();
        }
    });
    assert.equal(duplicate.filter(event => event.type === 'error').length, 1);
    assert.match(duplicate.find(event => event.type === 'error').message, /more than once/i);
    assert.ok(duplicate.some(event => event.type === 'ready'), 'The original initialization must survive a duplicate request');
    const lockedOptions = await page.evaluate(async () => {
        const weights = await (await fetch('/weights')).arrayBuffer();
        const worker = new Worker('/worker.js', { type: 'module' });
        const errors = [];
        try {
            return await new Promise((resolveOptions, reject) => {
                const timer = setTimeout(() => reject(new Error('Locked options test timed out')), 30000);
                worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message || 'Worker failed')); };
                worker.onmessage = ({ data }) => {
                    if(data.type === 'error') errors.push(data.message);
                    if(data.type === 'ready') {
                        worker.postMessage({ type: 'uci', line: 'setoption name Backend value browser-onnx' });
                        worker.postMessage({ type: 'uci', line: 'setoption name WeightsFile value /other.pb' });
                        worker.postMessage({ type: 'uci', line: 'isready' });
                    }
                    if(data.type === 'uci' && data.line === 'readyok') {
                        clearTimeout(timer);
                        resolveOptions(errors);
                    }
                };
                worker.postMessage({ type: 'initialize', weights }, [weights]);
            });
        } finally {
            worker.terminate();
        }
    });
    assert.equal(lockedOptions.length, 2);
    for(const error of lockedOptions) assert.match(error, /new Lc0 worker/i);
    const unisolatedPage = await browser.newPage();
    await unisolatedPage.goto(`http://127.0.0.1:${server.address().port}/unisolated`);
    const isolationErrors = await unisolatedPage.evaluate(async () => {
        async function test(workerPath, type) {
            const worker = new Worker(workerPath, { type: 'module' });
            try {
                return await new Promise((resolveError, reject) => {
                    const timer = setTimeout(() => reject(new Error('Isolation validation timed out')), 30000);
                    worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message || 'Worker failed')); };
                    worker.onmessage = ({ data }) => {
                        clearTimeout(timer);
                        resolveError(data);
                    };
                    worker.postMessage({ type, weights: new Uint8Array([1]).buffer });
                });
            } finally {
                worker.terminate();
            }
        }
        return Promise.all([test('/worker.js', 'initialize'), test('/converter-worker.js', 'convert')]);
    });
    for(const error of isolationErrors) {
        assert.equal(error.type, 'error');
        assert.match(error.message, /cross-origin isolation/i);
    }
    const serviceWorkerPage = await browser.newPage();
    await serviceWorkerPage.goto(`http://127.0.0.1:${server.address().port}/sw/`);
    await serviceWorkerPage.waitForFunction(() => navigator.serviceWorker.controller || crossOriginIsolated,
        null, { timeout: settings.timeoutMs });
    if(!await serviceWorkerPage.evaluate(() => crossOriginIsolated)) await serviceWorkerPage.reload();
    await serviceWorkerPage.waitForFunction(() => crossOriginIsolated, null, { timeout: settings.timeoutMs });
    const serviceWorkerSearch = await serviceWorkerPage.evaluate(async ({ provider, timeoutMs, inferenceDataType }) => {
        const response = await fetch('/weights');
        if(!response.ok) throw new Error('Weights request failed');
        const weights = await response.arrayBuffer();
        const worker = new Worker('/sw/worker.js', { type: 'module' });
        try {
            return await new Promise((resolveSearch, reject) => {
                const timer = setTimeout(() => reject(new Error('Service worker search timed out')), timeoutMs);
                worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message || 'Worker failed')); };
                worker.onmessage = ({ data }) => {
                    if(data.type === 'error' || data.type === 'uci' && data.line.startsWith('error ')) {
                        clearTimeout(timer);
                        reject(new Error(data.message || data.line));
                    } else if(data.type === 'ready') {
                        for(const line of ['position startpos', 'go nodes 4'])
                            worker.postMessage({ type: 'uci', line });
                    } else if(data.type === 'uci' && data.line.startsWith('bestmove ')) {
                        clearTimeout(timer);
                        resolveSearch(data.line);
                    }
                };
                worker.postMessage({ type: 'initialize', weights, provider, inferenceDataType }, [weights]);
            });
        } finally {
            worker.terminate();
        }
    }, settings);
    const serviceWorkerMove = serviceWorkerSearch.split(' ')[1];
    board.reset();
    assert.ok(board.move({ from: serviceWorkerMove.slice(0, 2), to: serviceWorkerMove.slice(2, 4),
        promotion: serviceWorkerMove[4] }), 'Expected a legal move with service-worker isolation');
    await serviceWorkerPage.close();
    console.log(JSON.stringify({ ...result, conversion: { size: conversion.size, errors: conversion.errors },
        invalidConversion, parallel, invalid, invalidOnnx, protocol, invalidProvider, duplicate, lockedOptions, isolationErrors,
        serviceWorkerSearch }, null, 2));
} finally {
    if(browser) await browser.close();
    await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
}
