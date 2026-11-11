import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { chromium } from 'playwright';
import { startServer, repoRoot } from '../../../tests/maia-elo/serve.mjs';

const [study = 'temp\\doppelmaia-finetune-study'] = process.argv.slice(2);
const references = JSON.parse(await readFile(`${study}\\browser-reference.json`, 'utf8'));
const modelFile = reference => resolve(study, reference.modelPath || `${reference.name}\\${reference.filename || 'maia3-finetuned.onnx'}`);
const modelUrl = reference => {
    const path = relative(repoRoot, modelFile(reference));
    if(path.startsWith('..')) throw new Error('App verification models must be inside the repository.');
    return '/' + path.split(sep).join('/');
};
for(const reference of references) {
    const bytes = await readFile(modelFile(reference));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), reference.sha256);
}
const { server, url } = await startServer({ outFile: 'NUL' });
let browser;
try {
    browser = await chromium.launch({ headless: false, executablePath: process.env.LC0_TEST_BROWSER,
        args: ['--enable-unsafe-webgpu'] });
    const page = await browser.newPage();
    await page.goto(`${url}/tools/doppelmaia/`);
    await page.waitForFunction(() => crossOriginIsolated, null, { timeout: 30000 });
    const results = [];
    for(const reference of references) {
        const result = await page.evaluate(async ({ reference, modelPath }) => {
            const adapter = await navigator.gpu.requestAdapter();
            if(!adapter || adapter.isFallbackAdapter || adapter.info?.isFallbackAdapter)
                throw new Error('A real hardware WebGPU adapter is required');
            const gpu = Object.fromEntries(['vendor', 'architecture', 'device', 'description']
                .map(key => [key, adapter.info?.[key] || '']));
            const { default: Maia } = await import('/app/assets/engines/Maia3/maia.js');
            const { savePersonalModel } = await import('/app/assets/engines/Maia3/personal-models.js');
            const { preprocessMaia3 } = await import('/app/assets/engines/Maia3/tensor.js');
            const response = await fetch(modelPath);
            if(!response.ok) throw new Error(`Export HTTP ${response.status}`);
            const bytes = await response.arrayBuffer();
            const checksum = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
                .map(value => value.toString(16).padStart(2, '0')).join('');
            if(checksum !== reference.sha256) throw new Error('The model bytes changed before app verification.');
            const file = new File([bytes], `${reference.name}-full-transformer.onnx`);
            const modelId = await savePersonalModel(file, 1500);
            const statuses = [];
            const maia = new Maia({ modelId, provider: 'webgpu',
                setStatus: status => statuses.push(status), setProgress: () => {}, setError: () => {} });
            try {
                await Promise.race([maia.initialization,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('App worker initialization timed out')), 120000))]);
                if(!maia.ready) throw new Error('Actual application worker is not ready');
                if(maia.tokenChannels !== (reference.tokenChannels || 12)) throw new Error('The app loaded a different board format.');
                const errors = [];
                for(const output of reference.outputs) {
                    const tokens = Float32Array.from(reference.fens.flatMap((fen, index) =>
                        [...preprocessMaia3(fen, reference.histories?.[index]).boardTokens]));
                    const ratings = new Float32Array(reference.fens.length).fill(output.rating);
                    const actual = await maia.runInference(tokens, ratings, ratings.slice(), reference.fens.length);
                    if(actual.logitsMove.length !== output.policy.length || actual.logitsValue.length !== output.value.length)
                        throw new Error('App worker output shape mismatch');
                    let policyError = 0, valueError = 0;
                    actual.logitsMove.forEach((value, i) => { policyError = Math.max(policyError, Math.abs(value - output.policy[i])); });
                    actual.logitsValue.forEach((value, i) => { valueError = Math.max(valueError, Math.abs(value - output.value[i])); });
                    if(!Number.isFinite(policyError) || !Number.isFinite(valueError)) throw new Error('Nonfinite output');
                    errors.push({ rating: output.rating, policyMaximumAbsoluteError: policyError, valueMaximumAbsoluteError: valueError });
                }
                const evaluated = await maia.evaluateMaia3(reference.fens[0], 1500, 1500, reference.histories?.[0]);
                let heldOut = null;
                if(reference.testCases) {
                    if(!reference.testCases.length) throw new Error('The held out app check has no positions.');
                    let matches = 0, loss = 0, maximumCEDifference = 0;
                    const differences = [];
                    for(let start = 0; start < reference.testCases.length; start += 32) {
                        const rows = reference.testCases.slice(start, start + 32);
                        const inputs = rows.map(row => preprocessMaia3(row.fen, row.history));
                        const tokens = new Float32Array(rows.length * 64 * maia.tokenChannels);
                        inputs.forEach((input, index) => tokens.set(input.boardTokens, index * 64 * maia.tokenChannels));
                        const ratings = new Float32Array(rows.length).fill(reference.testElo);
                        const actual = await maia.runInference(tokens, ratings, ratings.slice(), rows.length);
                        for(let row = 0; row < rows.length; row++) {
                            const legal = inputs[row].legalMoves, offset = row * 4352, expected = rows[row];
                            if(!legal[expected.target] || !legal[expected.prediction])
                                throw new Error('The app and native reference disagree on move legality.');
                            let best = -1, maximum = -Infinity, sum = 0;
                            for(let move = 0; move < legal.length; move++) if(legal[move]) {
                                const value = actual.logitsMove[offset + move];
                                if(!Number.isFinite(value)) throw new Error('Nonfinite held out prediction.');
                                if(value > maximum) { best = move; maximum = value; }
                            }
                            for(let move = 0; move < legal.length; move++) if(legal[move])
                                sum += Math.exp(actual.logitsMove[offset + move] - maximum);
                            const crossEntropy = Math.log(sum) + maximum - actual.logitsMove[offset + expected.target];
                            if(best === expected.target) matches++;
                            if(best !== expected.prediction) differences.push({ sample: expected.sample, target: expected.target,
                                native: expected.prediction, webgpu: best });
                            loss += crossEntropy;
                            maximumCEDifference = Math.max(maximumCEDifference, Math.abs(crossEntropy - expected.loss));
                        }
                    }
                    const positions = reference.testCases.length;
                    heldOut = { positions, matches, moveAgreement: matches / positions,
                        nativeAgreement: reference.expectedTestAgreement, crossEntropy: loss / positions,
                        nativeCE: reference.expectedTestCE, maximumCEDifference,
                        implementationAgreement: 1 - differences.length / positions, differences };
                }
                return { name: reference.name, requestedProvider: 'webgpu', gpu, applicationWorker: true,
                    tokenChannels: maia.tokenChannels, modelSHA256: checksum, modelBytes: file.size, statuses, errors,
                    processedOutputAvailable: !!evaluated.policy, heldOut };
            } finally { maia.dispose(); }
        }, { reference, modelPath: modelUrl(reference) });
        assert.ok(result.processedOutputAvailable);
        assert.ok(result.errors.every(error => error.policyMaximumAbsoluteError < 0.005 && error.valueMaximumAbsoluteError < 0.005),
            `Native CUDA/app WebGPU output mismatch: ${JSON.stringify(result.errors)}`);
        if(result.heldOut) {
            assert.ok(result.heldOut.implementationAgreement >= 0.999, 'App and native top moves differ on over 0.1% of the test set.');
            assert.ok(Math.abs(result.heldOut.crossEntropy - result.heldOut.nativeCE) < 0.0002,
                'App and native mean held out cross entropy differ by over 0.0002.');
        }
        results.push(result);
        console.log(JSON.stringify(result));
    }
    await writeFile(`${study}\\browser-parity.json`, JSON.stringify(results, null, 2));
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
