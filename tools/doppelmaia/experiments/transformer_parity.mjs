import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve, relative, join, sep } from 'node:path';
import { chromium } from 'playwright';
import { startServer, repoRoot } from '../../../tests/maia-elo/serve.mjs';

const output = resolve(process.argv[2] || 'temp\\doppelmaia-transformer-parity');
const path = relative(repoRoot, output).split(sep).join('/');
if(path.startsWith('..')) throw new Error('Parity output must be under the repository root.');
const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
try {
    const page = await browser.newPage({ acceptDownloads: true });
    const downloads = [];
    let startedDownloads;
    const allDownloadsStarted = new Promise(resolve => { startedDownloads = resolve; });
    page.on('download', download => {
        downloads.push(download.saveAs(join(output, download.suggestedFilename())).then(() => null, error => error));
        if(downloads.length === 4) startedDownloads();
    });
    page.on('console', message => console.log(message.text()));
    page.on('pageerror', error => console.error(error));
    await page.goto(`${url}/tools/doppelmaia/`);
    const result = await page.evaluate(async path => {
        const { tf, Maia3Transformer, TransformerAdamW, initializeTransformerGpu } = await import('./maia3-transformer.js');
        const { preprocessMaia3, mirrorMove, allPossibleMovesMaia3Reversed } = await import('../../app/assets/engines/Maia3/tensor.js');
        const read = async file => {
            const response = await fetch(`/${path}/${file}`);
            if(!response.ok) throw new Error(`Missing reference ${file}, HTTP ${response.status}`);
            return response;
        };
        const reference = await (await read('reference.json')).json();
        const download = (bytes, name) => {
            const anchor = document.createElement('a');
            anchor.href = URL.createObjectURL(new Blob([bytes]));
            anchor.download = name;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(anchor.href), 10000);
        };
        const { device } = await initializeTransformerGpu();
        let lost;
        device.lost.then(info => { lost = info.message || info.reason; });
        const source = new Uint8Array(await (await fetch('../../app/assets/engines/Maia3/model/maia3_simplified.onnx')).arrayBuffer());
        const tokenChannels = reference.tokenChannels || 12, useHistory = tokenChannels === 96;
        const model = new Maia3Transformer(source, { history: useHistory }), optimizer = new TransformerAdamW(model, reference.options);
        const moveIndex = new Map(Object.entries(allPossibleMovesMaia3Reversed).map(([index, move]) => [move, Number(index)]));
        const encoded = reference.samples.map(sample => preprocessMaia3(sample.fen, useHistory ? sample.history : undefined).boardTokens);
        const masks = reference.samples.map(sample => {
            const mask = new Uint8Array(4352), black = sample.fen.split(' ')[1] === 'b';
            for(const move of sample.legalMoves) mask[moveIndex.get(black ? mirrorMove(move) : move)] = 1;
            return mask;
        });
        const batch = indices => ({
            tokens: tf.tensor(Float32Array.from(indices.flatMap(i => [...encoded[i]])), [indices.length, 64, tokenChannels]),
            eloSelf: tf.tensor1d(indices.map(i => reference.eloSelf[i])),
            eloOppo: tf.tensor1d(indices.map(i => reference.eloOppo[i])),
            legal: tf.tensor(Uint8Array.from(indices.flatMap(i => [...masks[i]])), [indices.length, 4352], 'bool'),
            targets: tf.tensor2d(indices.map(i => reference.targets[i]))
        });
        const difference = (actual, expected) => {
            let maximum = 0, squared = 0, dot = 0, aa = 0, bb = 0;
            if(actual.length !== expected.length) throw new Error('Reference dimension mismatch.');
            for(let i = 0; i < actual.length; i++) {
                if(!Number.isFinite(actual[i])) throw new Error('Nonfinite browser output.');
                const delta = actual[i] - expected[i];
                maximum = Math.max(maximum, Math.abs(delta));
                squared += delta * delta;
                dot += actual[i] * expected[i]; aa += actual[i] ** 2; bb += expected[i] ** 2;
            }
            return { maximum, rmse: Math.sqrt(squared / actual.length), cosine: aa && bb ? dot / Math.sqrt(aa * bb) : aa === bb ? 1 : 0 };
        };
        const prediction = async (policy, value, save = false) => {
            const logits = [], values = [];
            for(let start = 0; start < reference.samples.length; start += 16) {
                const inputs = batch(Array.from({ length: Math.min(16, reference.samples.length - start) }, (_, i) => start + i));
                const prediction = model.forward(inputs.tokens, inputs.eloSelf, inputs.eloOppo);
                try {
                    logits.push(...await prediction.logits.data());
                    values.push(...await prediction.value.data());
                } finally { tf.dispose(prediction); tf.dispose(inputs); }
            }
            let divergence = 0, agreement = 0, actualLoss = 0, expectedLoss = 0, probabilityMaximum = 0;
            const softmax = list => {
                const maximum = Math.max(...list), exp = list.map(value => Math.exp(value - maximum));
                const total = exp.reduce((a, b) => a + b, 0);
                return exp.map(value => value / total);
            };
            reference.samples.forEach((sample, row) => {
                const indices = Array.from(masks[row]).flatMap((yes, index) => yes ? [index] : []);
                const actual = softmax(indices.map(index => logits[row * 4352 + index]));
                const expected = softmax(indices.map(index => policy[row][index]));
                const black = sample.fen.split(' ')[1] === 'b';
                const target = indices.indexOf(moveIndex.get(black ? mirrorMove(sample.move) : sample.move));
                actualLoss -= Math.log(Math.max(actual[target], 1e-30));
                expectedLoss -= Math.log(Math.max(expected[target], 1e-30));
                agreement += Number(actual.indexOf(Math.max(...actual)) === expected.indexOf(Math.max(...expected)));
                actual.forEach((p, index) => {
                    divergence += p * Math.log(Math.max(p, 1e-30) / Math.max(expected[index], 1e-30));
                    probabilityMaximum = Math.max(probabilityMaximum, Math.abs(p - expected[index]));
                });
            });
            if(save) {
                download(new Float32Array(logits), 'browser-logits.bin');
                download(new Float32Array(values), 'browser-values.bin');
            }
            return { policy: difference(logits, policy.flat()), value: difference(values, value.flat()),
                meanPolicyKL: divergence / masks.length, moveAgreement: agreement / masks.length,
                actualRecordedCE: actualLoss / masks.length, expectedRecordedCE: expectedLoss / masks.length,
                probabilityMaximum };
        };
        const compareWeights = async (manifest, gradientMap) => {
            const bytes = await (await read(manifest.file)).arrayBuffer();
            const raw = new Float32Array(bytes), result = [];
            for(const item of manifest.tensors) {
                const variable = model.weight(item.name), actual = gradientMap ? gradientMap[variable.name] : variable;
                if(!actual) throw new Error(`Missing gradient for ${item.name}`);
                result.push({ name: item.name, ...difference(await actual.data(), raw.subarray(item.offset, item.offset + item.length)) });
            }
            return result;
        };
        const started = performance.now(), result = { tokenChannels, baseline: await prediction(reference.baseline, reference.baselineValue), steps: [],
            trainableParameters: model.parameterCount, device: { vendor: device.adapterInfo?.vendor, architecture: device.adapterInfo?.architecture } };
        console.log('Initial browser/CUDA parity', JSON.stringify(result.baseline));
        try {
            for(let step = 0; step < reference.steps.length; step++) {
                if(lost) throw new Error(`Training GPU lost. ${lost}`);
                const target = reference.steps[step], inputs = batch(target.indices);
                const gradients = model.gradients(inputs);
                try {
                    if(step === 0) result.gradients = await compareWeights(reference.gradients, gradients.grads);
                    const loss = (await gradients.value.data())[0];
                    const norm = await optimizer.apply(gradients.grads);
                    result.steps.push({ loss, expectedLoss: target.loss, gradientNorm: norm, expectedGradientNorm: target.gradientNorm });
                    if(step === 0) result.firstWeights = await compareWeights(reference.firstWeights);
                } finally { tf.dispose(gradients); tf.dispose(inputs); }
                console.log('Transformer parity step', step + 1, JSON.stringify(result.steps.at(-1)));
            }
            result.final = await prediction(reference.final, reference.finalValue, true);
            result.weights = await compareWeights(reference.weights);
            const inputs = batch(reference.steps[0].indices), finalGradients = model.gradients(inputs);
            try {
                const length = reference.gradients.tensors.reduce((sum, item) => sum + item.length, 0);
                const raw = new Float32Array(length);
                for(const item of reference.gradients.tensors)
                    raw.set(await finalGradients.grads[model.weight(item.name).name].data(), item.offset);
                download(raw, 'browser-final-gradients.bin');
            } finally { tf.dispose(inputs); tf.dispose(finalGradients); }
            download(await model.export(), 'browser.onnx');
            result.seconds = (performance.now() - started) / 1000;
            result.memory = tf.memory();
            return result;
        } finally { optimizer.dispose(); model.dispose(); }
    }, path);
    await allDownloadsStarted;
    for(const error of await Promise.all(downloads)) if(error) throw error;
    await writeFile(join(output, 'browser-parity.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ baseline: result.baseline, final: result.final, seconds: result.seconds,
        gradientMax: Math.max(...result.gradients.map(row => row.maximum)),
        weightMax: Math.max(...result.weights.map(row => row.maximum)) }, null, 2));
    assert.ok(result.baseline.policy.maximum < 0.001, 'Initial browser/CUDA policy divergence');
    assert.ok(result.baseline.value.maximum < 0.0001, 'Initial browser/CUDA value divergence');
    assert.ok(result.gradients.every(row => row.maximum < 0.002), 'Browser/CUDA gradient divergence');
    assert.ok(result.firstWeights.every(row => row.maximum < 0.00007), 'First AdamW update divergence');
    assert.ok(result.final.meanPolicyKL < 0.02, 'Multi step browser/CUDA policy distributions diverged');
    assert.ok(result.final.moveAgreement >= 0.95, 'Multi step browser/CUDA decisions diverged');
    assert.ok(Math.abs(result.final.actualRecordedCE - result.final.expectedRecordedCE) < 0.03, 'Multi step browser/CUDA CE diverged');
} finally {
    await browser.close();
    await new Promise(done => server.close(done));
}
