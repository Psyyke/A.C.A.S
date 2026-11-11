import { unpackWeights, readPolicy, writePolicy, featureModel } from './weights.js';
import { encodePlanes, sampleIndices } from './encoding.js';
import { forward, trainPolicy, evaluate } from './learning.js';

let running = false, cancelled = false;
const send = data => self.postMessage(data);
const yieldControl = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    if(cancelled) throw new DOMException('Training stopped. No incomplete model was exported.', 'AbortError');
};

async function convert(bytes) {
    const converter = new Worker(new URL('./runtime/converter-worker.js', import.meta.url), { type: 'module' });
    try {
        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Lc0 conversion timed out after two minutes.')), 120000);
            const done = (error, output) => { clearTimeout(timer); error ? reject(error) : resolve(output); };
            converter.onerror = event => done(new Error(event.message || 'Lc0 converter worker failed.'));
            converter.onmessageerror = () => done(new Error('Lc0 converter returned an unreadable message.'));
            converter.onmessage = ({ data }) => {
                if(data.type === 'log') send({ type: 'log', line: data.line });
                if(data.type === 'error') done(new Error(data.message));
                if(data.type === 'converted') {
                    if(!(data.output instanceof ArrayBuffer) || !data.output.byteLength)
                        done(new Error('Lc0 converter returned an empty model.'));
                    else done(null, new Uint8Array(data.output));
                }
            };
            const copy = bytes.slice().buffer;
            converter.postMessage({ type: 'convert', weights: copy, dataType: 'f32' }, [copy]);
        });
    } finally { converter.terminate(); }
}

async function train(data) {
    if(!['wasm', 'webgpu'].includes(data.provider)) throw new Error('Choose WASM CPU or WebGPU for feature extraction.');
    const requested = [...data.dataset.train.samples, ...data.dataset.validation.samples];
    if(requested.length > 10000) throw new Error('Use at most 10,000 positions per browser training run.');
    const trainSamples = data.dataset.train.samples.filter(sample => sample.history.length === 8);
    const validationSamples = data.dataset.validation.samples.filter(sample => sample.history.length === 8);
    const samples = [...trainSamples, ...validationSamples];
    if(!trainSamples.length || !validationSamples.length)
        throw new Error('Original Maia needs later moves with eight history positions in both game groups. Import longer games or choose Maia 3 for early opening moves.');
    if(samples.length < requested.length) send({ type: 'log',
        line: `Original Maia uses ${samples.length} positions with complete history. Skipped ${requested.length - samples.length} early opening examples. Maia 3 can learn from those too.` });
    send({ type: 'stage', stage: 'Preparing Maia and converting its feature extractor...' });
    const bytes = await unpackWeights(data.weights), policy = readPolicy(bytes);
    if(bytes.length > 64 * 1024 * 1024) throw new Error('Decompressed weights exceed the 64 MB original Maia limit.');
    const featureBytes = samples.length * policy.features * 4;
    if(featureBytes > 256 * 1024 * 1024) throw new Error('Feature cache would exceed 256 MB. Prepare fewer positions.');
    const onnx = await convert(bytes), extracted = featureModel(onnx, policy.features);
    await yieldControl();
    const ort = await import('./runtime/dist/ort.webgpu.bundle.min.mjs');
    ort.env.wasm.wasmPaths = new URL('./runtime/dist/', import.meta.url).href;
    ort.env.wasm.numThreads = 1;
    const options = { executionProviders: [data.provider], graphOptimizationLevel: 'all' };
    let session, original;
    const makeInput = sample => new ort.Tensor('float32', encodePlanes(sample.history, sample.repetitions), [1, 112, 8, 8]);
    const cache = [];
    let lastFeatureReport = 0;
    try {
        session = await ort.InferenceSession.create(extracted.model, options);
        original = await ort.InferenceSession.create(onnx, options);
        for(let i = 0; i < samples.length; i++) {
            await yieldControl();
            const sample = samples[i], input = makeInput(sample);
            const result = await session.run({ '/input/planes': input });
            const features = result[extracted.output];
            if(features?.type !== 'float32' || features.data.length !== policy.features
                || features.data.some(value => !Number.isFinite(value)))
                throw new Error('Feature extractor returned unexpected or non-finite Maia features.');
            const indices = sampleIndices(sample);
            const entry = { ...indices, features: features.data.slice(), move: sample.move, fen: sample.history[0] };
            cache.push(entry);
            if(i < 3) {
                const reference = (await original.run({ '/input/planes': input }))['/output/policy'].data;
                const calculated = forward(policy, entry, extracted.policyMap).logits;
                const error = Math.max(...entry.legal.map((index, j) => Math.abs(reference[index] - calculated[j])));
                if(error > 0.003) throw new Error(`Policy feature check failed (${error.toPrecision(4)} max logit error). No training was performed.`);
                send({ type: 'log', line: `Verified original policy logits, maximum error ${error.toExponential(3)}.` });
            }
            if(samples.length <= 16 || i === samples.length - 1 || performance.now() - lastFeatureReport >= 80) {
                send({ type: 'features', processed: i + 1, total: samples.length, move: sample.move, fen: sample.history[0] });
                lastFeatureReport = performance.now();
            }
        }
    } finally {
        if(session) await session.release();
        if(original) await original.release();
    }
    const train = cache.slice(0, trainSamples.length), validation = cache.slice(trainSamples.length);
    send({ type: 'stage', stage: 'Training the final policy convolution. The neural tower and value head stay fixed.' });
    const result = await trainPolicy(policy, train, validation, extracted.policyMap, data.options, send, yieldControl);
    await yieldControl();
    send({ type: 'stage', stage: 'Quantizing and checking the best held-out checkpoint in upstream Lc0...' });
    const output = writePolicy(bytes, policy.matrix, policy.bias), quantized = readPolicy(output);
    const quantizedMetrics = await evaluate(quantized, validation, extracted.policyMap, yieldControl);
    // Keep the baseline if LINEAR16 export erases the measured validation improvement.
    const retained = result.improved && quantizedMetrics.loss < result.history[0].validationLoss;
    const exported = retained ? output : bytes;
    const finalPolicy = readPolicy(exported);
    const exportedOnnx = await convert(exported);
    let exportedSession;
    try {
        exportedSession = await ort.InferenceSession.create(exportedOnnx, options);
        for(let i = 0; i < Math.min(3, samples.length); i++) {
            const output = await exportedSession.run({ '/input/planes': makeInput(samples[i]) });
            const expected = forward(finalPolicy, cache[i], extracted.policyMap).logits;
            const actual = output['/output/policy'].data;
            const error = Math.max(...cache[i].legal.map((index, j) => Math.abs(actual[index] - expected[j])));
            if(error > 0.003) throw new Error(`Export verification failed (${error.toPrecision(4)} max logit error). No download was generated.`);
        }
    } finally { if(exportedSession) await exportedSession.release(); }
    await yieldControl();
    const gzip = await new Response(new Blob([exported]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    send({ type: 'complete', weights: gzip, report: {
        ...result, improved: retained, bestEpoch: retained ? result.bestEpoch : 0,
        exportedMetrics: retained ? quantizedMetrics : {
            loss: result.history[0].validationLoss, accuracy: result.history[0].validationAccuracy
        },
        method: 'Original Maia final 3x3 policy convolution fine-tuning, frozen neural tower and value head',
        trainPositions: train.length, validationPositions: validation.length,
        skippedEarlyPositions: requested.length - samples.length,
        provider: data.provider, options: data.options, exportVerified: true
    } }, [gzip]);
}

self.onmessage = async ({ data }) => {
    if(data?.type === 'stop') { cancelled = true; return; }
    if(data?.type !== 'train' || running) return;
    running = true; cancelled = false;
    try { await train(data); }
    catch(error) {
        send({ type: error.name === 'AbortError' ? 'stopped' : 'error', message: error.message || String(error) });
    } finally { running = false; }
};
