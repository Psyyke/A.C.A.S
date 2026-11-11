import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { unpackWeights, readPolicy, writePolicy, featureModel } from '../weights.js';
import { encodePlanes, sampleIndices } from '../encoding.js';
import { forward, trainPolicy } from '../learning.js';

const [command, input, output, extra] = process.argv.slice(2);
const root = resolve(import.meta.dirname, '..', '..', '..');
const saveFloat = (path, values) => writeFile(path, Buffer.from(values.buffer, values.byteOffset, values.byteLength));
const floats = async path => {
    const bytes = await readFile(path);
    return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
async function browserRun(callback, args) {
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    try {
        const page = await browser.newPage();
        await page.goto(process.env.ORIGINAL_APP_URL || 'http://localhost/A.C.A.S/tools/doppelmaia/');
        await page.waitForFunction(() => crossOriginIsolated, null, { timeout: 45000 });
        return await page.evaluate(callback, args);
    } finally { await browser.close(); }
}
const urlFor = path => new URL('../../' + relative(root, resolve(path)).split(sep).join('/'),
    process.env.ORIGINAL_APP_URL || 'http://localhost/A.C.A.S/tools/doppelmaia/').href;

if(command === 'encode') {
    const dataset = JSON.parse(await readFile(input, 'utf8'));
    const samples = ['train', 'validation', 'test'].flatMap(key => dataset.splits[key]);
    await mkdir(output, { recursive: true });
    await saveFloat(resolve(output, 'planes.f32'), Float32Array.from(samples.flatMap(sample =>
        Array.from(encodePlanes(sample.history, sample.repetitions)))));
    await writeFile(resolve(output, 'indices.json'), JSON.stringify(samples.map(sampleIndices)));
} else if(command === 'prepare' || command === 'export') {
    await mkdir(output, { recursive: true });
    let bytes = await unpackWeights(await readFile(input));
    if(command === 'export') {
        const policy = readPolicy(bytes), values = await floats(extra);
        bytes = writePolicy(bytes, values.slice(0, policy.matrix.length), values.slice(policy.matrix.length));
    }
    await writeFile(resolve(output, 'weights.pb'), bytes);
    const policy = readPolicy(bytes);
    await saveFloat(resolve(output, 'matrix.f32'), policy.matrix);
    await saveFloat(resolve(output, 'bias.f32'), policy.bias);
    const encoded = await browserRun(async ({ url }) => {
        const bytes = await (await fetch(url)).arrayBuffer();
        const worker = new Worker(new URL('./runtime/converter-worker.js', location.href), { type: 'module' });
        try {
            const result = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Converter timed out')), 120000);
                worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
                worker.onmessage = ({ data }) => {
                    if(data.type === 'error') { clearTimeout(timer); reject(new Error(data.message)); }
                    if(data.type === 'converted') { clearTimeout(timer); resolve(data.output); }
                };
                worker.postMessage({ type: 'convert', weights: bytes, dataType: 'f32' }, [bytes]);
            });
            let binary = '';
            const view = new Uint8Array(result);
            for(let i = 0; i < view.length; i += 32768) binary += String.fromCharCode(...view.subarray(i, i + 32768));
            return btoa(binary);
        } finally { worker.terminate(); }
    }, { url: urlFor(resolve(output, 'weights.pb')) });
    const onnx = Buffer.from(encoded, 'base64');
    await writeFile(resolve(output, 'model.onnx'), onnx);
    const extracted = featureModel(onnx, policy.features);
    await writeFile(resolve(output, 'features.onnx'), extracted.model);
    await writeFile(resolve(output, 'metadata.json'), JSON.stringify({
        channels: policy.channels, features: policy.features, output: extracted.output,
        mapping: Array.from(extracted.policyMap), converter: 'actual browser upstream Lc0 f32 converter',
        sourceSha256: createHash('sha256').update(await readFile(input)).digest('hex')
    }));
} else if(command === 'reference' || command === 'train-reference') {
    const request = JSON.parse(await readFile(input, 'utf8'));
    const matrix = await floats(request.matrix), bias = await floats(request.bias);
    const data = await floats(request.features);
    const policy = { matrix, bias, channels: request.channels };
    const samples = request.samples.map((sample, i) => ({
        ...sample, features: data.slice(i * request.channels * 64, (i + 1) * request.channels * 64)
    }));
    if(command === 'reference') {
        await writeFile(output, JSON.stringify(samples.map(sample => forward(policy, sample, request.mapping))));
    } else {
        let last;
        const trainCount = request.trainCount || 256, validationEnd = trainCount + (request.validationCount || 64);
        const result = await trainPolicy(policy, samples.slice(0, trainCount), samples.slice(trainCount, validationEnd),
            request.mapping, request.options, event => {
                if(event.type === 'batch') last = Float32Array.from([...policy.matrix, ...policy.bias]);
            });
        await saveFloat(output + '.f32', Float32Array.from([...policy.matrix, ...policy.bias]));
        await saveFloat(output + '.last.f32', last);
        await writeFile(output, JSON.stringify(result));
    }
} else if(command === 'browser-reference') {
    const request = JSON.parse(await readFile(input, 'utf8'));
    const result = await browserRun(async ({ modelUrl, featureUrl, outputName, samples }) => {
        const { encodePlanes } = await import('./encoding.js');
        const ort = await import('./runtime/dist/ort.webgpu.bundle.min.mjs');
        ort.env.wasm.wasmPaths = new URL('./runtime/dist/', location.href).href;
        ort.env.wasm.numThreads = 1;
        const full = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
        const feature = await ort.InferenceSession.create(featureUrl, { executionProviders: ['wasm'] });
        try {
            const result = [];
            for(const sample of samples) {
                const feeds = { '/input/planes': new ort.Tensor('float32',
                    encodePlanes(sample.history, sample.repetitions), [1, 112, 8, 8]) };
                result.push({ features: Array.from((await feature.run(feeds))[outputName].data),
                    logits: Array.from((await full.run(feeds))['/output/policy'].data) });
            }
            return result;
        } finally { await full.release(); await feature.release(); }
    }, { ...request, modelUrl: urlFor(request.model), featureUrl: urlFor(request.featureModel) });
    await writeFile(output, JSON.stringify(result));
} else if(command === 'fixture') {
    const channels = 2, matrix = Float32Array.from({ length: 80 * channels * 9 }, (_, i) => ((i % 19) - 9) * 0.0007);
    const bias = Float32Array.from({ length: 80 }, (_, i) => i * 0.001);
    const samples = Array.from({ length: 6 }, (_, row) => ({
        features: Float32Array.from({ length: channels * 64 }, (_, i) => Math.sin(i * 1.7 + row) * 80),
        legal: [0, 1, 2, 3, 4, 5], target: row % 6
    }));
    const mapping = Array.from({ length: 1858 }, (_, i) => i);
    const initial = { matrix: Array.from(matrix), bias: Array.from(bias) }, snapshots = [];
    const policy = { matrix, bias, channels };
    const options = { epochs: 4, batchSize: 2, learningRate: 0.05, patience: 10 };
    const result = await trainPolicy(policy, samples, samples, mapping, options, event => {
        if(event.type === 'batch') snapshots.push({ matrix: Array.from(matrix), bias: Array.from(bias) });
    });
    await writeFile(output, JSON.stringify({ initial, channels, mapping, options, snapshots, result,
        samples: samples.map(sample => ({ ...sample, features: Array.from(sample.features) })) }));
} else throw new Error('Use encode, prepare, export, reference, browser-reference or fixture.');
