import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { comparePolicy, summarizePolicies } from './policy-metrics.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const runtime = resolve(process.env.LC0_PRECISION_RUNTIME || join(root, 'dist'));
const inputFile = process.env.LC0_PRECISION_INPUTS;
const corpus = inputFile ? JSON.parse(await readFile(inputFile, 'utf8')) : null;
if(inputFile && (!Array.isArray(corpus) || !corpus.length || corpus.some(sample =>
    !sample || !Number.isSafeInteger(sample.batch) || sample.batch < 1 || sample.batch > 256
    || !Array.isArray(sample.values) || sample.values.length !== sample.batch * 112 * 64
    || sample.values.some(value => typeof value !== 'number' || !Number.isFinite(value)))))
    throw new Error('Precision inputs must list finite { batch, values } tensors shaped [batch,112,8,8].');
const models = JSON.parse(process.env.LC0_PRECISION_MODELS || '[]');
if(!Array.isArray(models) || !models.length || models.some(model =>
    !model || typeof model.name !== 'string' || !model.name || typeof model.path !== 'string' || !model.path
    || !['float32', 'float16'].includes(model.type) || !['wasm', 'webgpu'].includes(model.provider)))
    throw new Error('LC0_PRECISION_MODELS must list { name, path, type: float32|float16, provider: wasm|webgpu } models.');
if(new Set(models.map(model => model.name)).size !== models.length)
    throw new Error('Precision model names must be unique.');
const enforce = process.env.LC0_PRECISION_ENFORCE === '1';
if(enforce && (models.length < 2 || models[0].type !== 'float32' || models[0].provider !== 'wasm'))
    throw new Error('Accuracy enforcement needs a float32 WASM reference and at least one candidate.');
const files = new Map([
    ['/float16.js', join(root, 'float16.js')],
    ...models.map((model, index) => [`/model-${index}`, resolve(model.path)]),
    ...['ort.webgpu.bundle.min.mjs', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm',
        'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'].map(name => [`/dist/${name}`, join(runtime, name)])
]);
const server = createServer(async (req, res) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    if(req.url === '/') { res.end('<title>Lc0 precision comparison</title>'); return; }
    const file = files.get(req.url);
    if(!file) { res.writeHead(404).end(); return; }
    try {
        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm'
            : /\.(js|mjs)$/.test(file) ? 'text/javascript' : 'application/octet-stream');
        res.end(await readFile(file));
    } catch(error) {
        console.error(error);
        res.writeHead(500).end(error.message);
    }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
let browser;
const report = [];
const violations = [];
const policySummaries = [];
try {
    browser = await chromium.launch({ headless: process.env.LC0_TEST_HEADED !== '1',
        executablePath: process.env.LC0_TEST_BROWSER,
        args: process.env.LC0_TEST_UNSAFE_WEBGPU === '1' ? ['--enable-unsafe-webgpu'] : [] });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    const results = [];
    for(let index = 0; index < models.length; index++) {
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        const evaluate = page.evaluate(async ({ model, index, corpus }) => {
            const ort = await import('/dist/ort.webgpu.bundle.min.mjs');
            const { encodeFloat16, decodeFloat16 } = await import('/float16.js');
            ort.env.wasm.wasmPaths = new URL('/dist/', location.href).href;
            ort.env.wasm.numThreads = 1;
            const response = await fetch(`/model-${index}`);
            if(!response.ok) throw new Error(`Model HTTP ${response.status}`);
            const session = await ort.InferenceSession.create(new Uint8Array(await response.arrayBuffer()),
                { executionProviders: [model.provider] });
            try {
                const patterns = [];
                const samples = corpus || [1, 2, 16].flatMap(batch =>
                    [0, 1, 2].map(pattern => ({ batch, pattern })));
                for(const [sampleIndex, sample] of samples.entries()) {
                    const { batch } = sample;
                    const pattern = corpus ? sampleIndex : sample.pattern;
                    const input = corpus ? Float32Array.from(sample.values)
                        : Float32Array.from({ length: batch * 112 * 64 }, (_, i) =>
                            pattern === 0 ? 0 : pattern === 1 ? Number(i % 7 === 0) : (i % 11 - 5) / 5);
                    const data = model.type === 'float16' ? Uint16Array.from(input, encodeFloat16) : input;
                    const feeds = { '/input/planes': new ort.Tensor(model.type, data, [batch, 112, 8, 8]) };
                    await session.run(feeds);
                    const began = performance.now();
                    const output = await session.run(feeds);
                    const elapsedMs = performance.now() - began;
                    patterns.push({ batch, pattern, elapsedMs, outputs: Object.fromEntries(
                        Object.entries(output).map(([name, tensor]) => [name, {
                            dims: tensor.dims, values: Array.from(tensor.data, value =>
                                tensor.data instanceof Uint16Array ? decodeFloat16(value) : value)
                        }])) });
                }
                return { name: model.name, patterns };
            } finally { await session.release(); }
        }, { model: models[index], index, corpus });
        let timer;
        const result = await Promise.race([evaluate, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Precision comparison timed out: ${models[index].name}`)), 180000);
        })]).finally(() => clearTimeout(timer));
        results.push(result);
        const policies = [];
        for(const [sample, pattern] of result.patterns.entries()) {
            const differences = {};
            assert.deepEqual(Object.keys(pattern.outputs).sort(),
                Object.keys(results[0].patterns[sample].outputs).sort());
            for(const [name, output] of Object.entries(pattern.outputs)) {
                const reference = results[0].patterns[sample].outputs[name];
                assert.deepEqual(output.dims, reference.dims);
                assert.equal(output.values.length, reference.values.length);
                let max = 0, sum = 0;
                for(let i = 0; i < output.values.length; i++) {
                    assert.ok(Number.isFinite(output.values[i]), `${result.name}: non-finite ${name}`);
                    const delta = Math.abs(output.values[i] - reference.values[i]);
                    max = Math.max(max, delta);
                    sum += delta;
                }
                differences[name] = { max, mean: sum / output.values.length };
                if(max > (name === '/output/policy' ? 0.2 : 0.01))
                    violations.push(`${result.name}: batch ${pattern.batch}, pattern ${pattern.pattern}, ${name} error ${max} exceeds bounds`);
            }
            const policy = pattern.outputs['/output/policy'];
            const referencePolicy = results[0].patterns[sample].outputs['/output/policy'];
            assert.deepEqual(policy.dims, [pattern.batch, 1858]);
            const masks = corpus?.[sample].legalIndices;
            if(masks !== undefined && (!Array.isArray(masks) || masks.length !== pattern.batch
                || masks.some(mask => !Array.isArray(mask))))
                throw new Error('legalIndices must contain one legal policy-index array per batch element.');
            const policyMetrics = Array.from({ length: pattern.batch }, (_, index) =>
                comparePolicy(referencePolicy.values.slice(index * 1858, (index + 1) * 1858),
                    policy.values.slice(index * 1858, (index + 1) * 1858), masks?.[index]));
            policies.push(...policyMetrics);
            const entry = { model: result.name, batch: pattern.batch, pattern: pattern.pattern,
                elapsedMs: pattern.elapsedMs, differences, policyMetrics };
            report.push(entry);
            console.log(JSON.stringify(entry));
        }
        policySummaries.push({ model: result.name, ...summarizePolicies(policies) });
    }
    if(process.env.LC0_PRECISION_REPORT)
        await writeFile(process.env.LC0_PRECISION_REPORT, JSON.stringify({
            browser: browser.version(), runtime, models, enforce, inputFile: inputFile || null,
            samples: report, violations, policySummaries
        }, null, 2));
    console.log(JSON.stringify({ policySummaries }));
    if(enforce) assert.equal(violations.length, 0, violations.join('\n'));
} finally {
    if(browser) await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
