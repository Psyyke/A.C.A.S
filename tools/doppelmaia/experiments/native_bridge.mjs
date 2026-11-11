import { readFile, writeFile } from 'node:fs/promises';
import { prepareMaia3, exportMaia3, adapterSize, moveCount } from '../maia3-model.js';
import { cpuAdapterStep, emptyAdapter, adapterForward, evaluateAdapter } from '../adapter-learning.js';
import { positionSignature, buildRepertoire } from '../repertoire.js';

const [command, input, output, weights, repertoireFile] = process.argv.slice(2);
if(command === 'prepare') {
    await writeFile(output, prepareMaia3(await readFile(input), weights ? Number(weights) : adapterSize));
} else if(command === 'export') {
    const raw = await readFile(weights), values = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const width = values.length / moveCount - 1;
    if(![64, 512].includes(width)) throw new Error('Invalid native adapter binary.');
    const saved = repertoireFile ? JSON.parse(await readFile(repertoireFile, 'utf8')) : { entries: [], strength: 0 };
    const repertoire = saved.entries.map(entry => ({ signature: positionSignature(entry.key), delta: Float32Array.from(entry.delta) }));
    await writeFile(output, exportMaia3(await readFile(input),
        values.slice(0, width * moveCount), values.slice(width * moveCount), repertoire, saved.strength));
} else if(command === 'step') {
    const { samples, learningRate, steps = 1 } = JSON.parse(await readFile(input, 'utf8'));
    const policy = emptyAdapter(samples[0].features.length);
    for(let i = 0; i < steps; i++) cpuAdapterStep(policy, samples, learningRate);
    await writeFile(output, Buffer.concat([Buffer.from(policy.matrix.buffer), Buffer.from(policy.bias.buffer)]));
} else if(command === 'repertoire') {
    const { samples, anchor = 0 } = JSON.parse(await readFile(input, 'utf8'));
    const policy = emptyAdapter(samples[0].features.length);
    const repertoire = buildRepertoire(samples, policy, adapterForward, anchor);
    await writeFile(output, JSON.stringify(repertoire.map(entry => ({
        signature: Array.from(entry.signature), delta: Array.from(entry.delta), observations: entry.observations
    }))));
} else if(command === 'train') {
    const { samples, validation, epochs = 8, learningRate = 0.005 } = JSON.parse(await readFile(input, 'utf8'));
    const policy = emptyAdapter(samples[0].features.length);
    let best = await evaluateAdapter(policy, validation), random = 42, bestEpoch = 0, stale = 0;
    let matrix = policy.matrix.slice(), bias = policy.bias.slice();
    const history = [{ epoch: 0, validationLoss: best.loss }];
    for(let epoch = 1; epoch <= epochs; epoch++) {
        const order = Array.from({ length: samples.length }, (_, i) => i);
        for(let i = order.length - 1; i > 0; i--) {
            random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
            const j = random % (i + 1);
            [order[i], order[j]] = [order[j], order[i]];
        }
        for(let start = 0; start < order.length; start += 32)
            cpuAdapterStep(policy, order.slice(start, start + 32).map(i => samples[i]), learningRate);
        const measured = await evaluateAdapter(policy, validation);
        history.push({ epoch, validationLoss: measured.loss });
        if(measured.loss < best.loss - 0.00001) {
            best = measured; bestEpoch = epoch; stale = 0;
            matrix = policy.matrix.slice(); bias = policy.bias.slice();
        } else if(++stale >= 8) break;
    }
    await writeFile(output, Buffer.concat([Buffer.from(matrix.buffer), Buffer.from(bias.buffer)]));
    await writeFile(`${output}.json`, JSON.stringify({ bestEpoch, history }));
} else {
    throw new Error('Use prepare, export, step, train or repertoire with input and output paths.');
}
