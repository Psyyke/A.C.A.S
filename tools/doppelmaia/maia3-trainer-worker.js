import { prepareMaia3, exportMaia3, moveCount } from './maia3-model.js';
import { emptyAdapter, adapterForward, cpuAdapterStep, evaluateAdapter } from './adapter-learning.js';
import { createGpuAdapter } from './adapter-webgpu.js';
import { openingSamples, shapeSquares, shapeRewards, objectiveTargets } from './objectives.js';
import { buildRepertoire, withRepertoire, positionSignature, signatureKey } from './repertoire.js';
import { validatePersonality, personalityFeatures, personalityScores, personalityTargets } from './personality.js';
import { baselineAccuracy, validationPhase } from './files.js';

const send = data => postMessage(data);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const fenOf = sample => sample.fen || sample.history[0];
const root = new URL('../../app/assets/engines/Maia3/', import.meta.url);
let running = false;

async function train(data) {
    if(data.options?.method === 'full') {
        const { trainTransformer } = await import('./transformer-training.js');
        const { weights, report } = await trainTransformer(data, send);
        const buffer = weights.byteOffset === 0 && weights.byteLength === weights.buffer.byteLength
            ? weights.buffer : weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength);
        postMessage({ type: 'complete', weights: buffer, report }, [buffer]);
        return;
    }
    if(data.options?.method && data.options.method !== 'adapter') throw new Error('Unknown Maia 3 training method.');
    const { epochs = 40, learningRate = 0.005, batchSize = 32, patience = 8, baseAnchor = 0, featureSize = 512 } = data.options || {};
    const elo = data.elo, goal = data.goal || 'imitate';
    if(!['wasm', 'webgpu'].includes(data.provider) || !['imitate', 'opening', 'shape', 'personality'].includes(goal)
        || !Number.isInteger(epochs) || epochs < 1 || epochs > 100 || !Number.isFinite(learningRate)
        || learningRate <= 0 || learningRate > 0.1 || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 32
        || !Number.isInteger(patience) || patience < 1 || patience > 100
        || !Number.isInteger(elo) || elo < 600 || elo > 2600
        || !Number.isFinite(baseAnchor) || baseAnchor < 0 || baseAnchor > 1 || (goal !== 'imitate' && baseAnchor !== 0)
        || ![64, 512].includes(featureSize))
        throw new Error('Invalid Maia 3 training settings.');
    const trainSamples = data.dataset?.train?.samples, validationSamples = data.dataset?.validation?.samples;
    if(!trainSamples?.length || !validationSamples?.length || trainSamples.length + validationSamples.length > 10000)
        throw new Error('Prepare 1 to 10,000 positions with both training and validation games.');
    const opening = goal === 'opening' ? openingSamples(data.opening) : [];
    const squares = goal === 'shape' ? shapeSquares(data.squares) : undefined;
    const personality = goal === 'personality' ? validatePersonality(data.personality) : undefined;
    const samples = [...trainSamples, ...validationSamples, ...opening];
    send({ type: 'stage', stage: 'Loading Maia 3 and preparing its frozen neural features...' });
    const { preprocessMaia3, mirrorMove, allPossibleMovesMaia3Reversed } = await import('../../app/assets/engines/Maia3/tensor.js');
    const moveIndex = new Map(Object.entries(allPossibleMovesMaia3Reversed).map(([index, move]) => [move, Number(index)]));
    const response = await fetch(new URL('model/maia3_simplified.onnx', root));
    if(!response.ok) throw new Error(`Could not load Maia 3: HTTP ${response.status}.`);
    const source = await response.arrayBuffer();
    const baseModelSHA256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', source)),
        byte => byte.toString(16).padStart(2, '0')).join('');
    const prepared = prepareMaia3(new Uint8Array(source), featureSize);
    const ort = await import('./runtime/dist/ort.webgpu.bundle.min.mjs');
    ort.env.wasm.wasmPaths = new URL('./runtime/dist/', import.meta.url).href;
    ort.env.wasm.numThreads = 1;
    const sessionOptions = { executionProviders: [data.provider], graphOptimizationLevel: 'all' };
    const feeds = batch => ({
        tokens: new ort.Tensor('float32', Float32Array.from(batch.flatMap(sample => [...preprocessMaia3(fenOf(sample)).boardTokens])), [batch.length, 64, 12]),
        elo_self: new ort.Tensor('float32', new Float32Array(batch.length).fill(elo), [batch.length]),
        elo_oppo: new ort.Tensor('float32', new Float32Array(batch.length).fill(elo), [batch.length])
    });
    const run = async (session, batch) => {
        const inputs = feeds(batch);
        try { return await session.run(inputs); }
        finally { Object.values(inputs).forEach(tensor => tensor.dispose()); }
    };
    const cache = [], started = performance.now();
    let session;
    try {
        session = await ort.InferenceSession.create(prepared, sessionOptions);
        for(let start = 0; start < samples.length; start += 8) {
            const batch = samples.slice(start, start + 8), output = await run(session, batch);
            try {
                for(let row = 0; row < batch.length; row++) {
                    const sample = batch[row], black = fenOf(sample).split(' ')[1] === 'b';
                    const legal = sample.legalMoves.map(move => moveIndex.get(black ? mirrorMove(move) : move));
                    let target = sample.legalMoves.indexOf(sample.move);
                    if(target < 0 || legal.some(index => !Number.isInteger(index) || index < 0 || index >= moveCount))
                        throw new Error('Dataset move is not representable by Maia 3.');
                    const base = legal.map(index => output.acas_base_logits.data[row * moveCount + index]);
                    const features = output.acas_features.data.slice(row * featureSize, (row + 1) * featureSize);
                    if(features.length !== featureSize || [...base, ...features].some(value => !Number.isFinite(value)))
                        throw new Error('Maia 3 returned invalid neural features.');
                    const rewards = squares ? shapeRewards(sample, squares) : undefined;
                    const scores = personality ? personalityScores(personalityFeatures(sample), personality) : undefined;
                    const targets = scores ? personalityTargets(base, scores) : objectiveTargets(base, target, rewards, baseAnchor);
                    if(personality) target = targets.indexOf(Math.max(...targets));
                    cache.push({ features, base, legal, target, rewards, scores,
                        targets, move: personality ? sample.legalMoves[target] : sample.move, fen: fenOf(sample),
                        ply: sample.ply, gameId: sample.gameId });
                }
            } finally { Object.values(output).forEach(tensor => tensor.dispose()); }
            const sample = cache[cache.length - 1];
            send({ type: 'features', processed: cache.length, total: samples.length, move: sample.move, fen: sample.fen });
            await tick();
        }
    } finally { if(session) await session.release(); }
    const featureMilliseconds = performance.now() - started;
    const trainSet = cache.slice(0, trainSamples.length);
    const validation = cache.slice(trainSamples.length, trainSamples.length + validationSamples.length);
    const replay = cache.slice(trainSamples.length + validationSamples.length);
    if(replay.length) {
        const copies = Math.max(1, Math.floor(trainSet.length / (4 * replay.length)));
        for(let i = 0; i < copies; i++) trainSet.push(...replay);
    }
    const policy = emptyAdapter(featureSize), history = [];
    const imitation = samples => samples.map(sample => ({
        ...sample, targets: sample.base.map((_, i) => Number(i === sample.target))
    }));
    const trainImitation = imitation(trainSet), validationImitation = imitation(validation);
    let gpu, bestMatrix = policy.matrix.slice(), bestBias = policy.bias.slice(), bestEpoch = 0, bestScore, stale = 0;
    const measure = async epoch => {
        send({ type: 'evaluation', epoch });
        const training = await evaluateAdapter(policy, baseAnchor ? trainImitation : trainSet);
        const heldOut = await evaluateAdapter(policy, baseAnchor ? validationImitation : validation);
        const openingMetrics = replay.length ? await evaluateAdapter(policy, replay) : null;
        const score = openingMetrics ? 0.75 * heldOut.loss + 0.25 * openingMetrics.loss : heldOut.loss;
        const point = { epoch, trainLoss: training.loss, trainAccuracy: training.accuracy,
            validationLoss: score, validationAccuracy: heldOut.accuracy,
            heldOutLoss: heldOut.loss, shapeScore: heldOut.goal, openingReplayLoss: openingMetrics?.loss,
            personalityScore: personality ? personalityMetrics(policy, validation).learnedScore : undefined };
        history.push(point); send({ type: 'epoch', point }); return score;
    };
    bestScore = await measure(0);
    const updateStarted = performance.now();
    let updates = 0, random = 42, parityError;
    try {
        if(data.provider === 'webgpu') gpu = await createGpuAdapter(policy, batchSize);
        send({ type: 'stage', stage: `Training the Maia 3 residual adapter on ${gpu ? 'WebGPU' : 'CPU'}. The original network stays frozen.` });
        for(let epoch = 1; epoch <= epochs; epoch++) {
            const order = Array.from({ length: trainSet.length }, (_, i) => i);
            for(let i = order.length - 1; i > 0; i--) {
                random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
                const j = random % (i + 1); [order[i], order[j]] = [order[j], order[i]];
            }
            for(let start = 0; start < order.length; start += batchSize) {
                const batch = order.slice(start, start + batchSize).map(index => trainSet[index]);
                let probability;
                if(gpu) {
                    probability = await gpu.step(batch, learningRate);
                    if(updates === 0) {
                        const reference = emptyAdapter(featureSize);
                        cpuAdapterStep(reference, batch, learningRate);
                        await gpu.read();
                        parityError = 0;
                        for(const key of ['matrix', 'bias']) for(let i = 0; i < policy[key].length; i++)
                            parityError = Math.max(parityError, Math.abs(reference[key][i] - policy[key][i]));
                        if(parityError > 0.000002) throw new Error(`WebGPU gradient check failed (${parityError}). No model was exported.`);
                        send({ type: 'log', line: `Real WebGPU SGD update matches CPU reference, maximum weight error ${parityError.toExponential(3)}.` });
                    }
                } else {
                    probability = adapterForward(policy, batch[batch.length - 1]).probability;
                    cpuAdapterStep(policy, batch, learningRate);
                }
                updates++;
                const last = batch[batch.length - 1];
                send({ type: 'batch', epoch, processed: Math.min(start + batchSize, order.length), total: order.length,
                    probability, move: last.move, fen: last.fen });
                await tick();
            }
            if(gpu) await gpu.read();
            const score = await measure(epoch);
            if(score < bestScore - 0.00001) {
                bestScore = score; bestEpoch = epoch; stale = 0;
                bestMatrix = policy.matrix.slice(); bestBias = policy.bias.slice();
            } else if(++stale >= patience) break;
        }
    } finally { if(gpu) gpu.dispose(); }
    const trainingMilliseconds = performance.now() - updateStarted;
    policy.matrix.set(bestMatrix); policy.bias.set(bestBias);
    const repertoire = goal === 'imitate' ? buildRepertoire(trainSet, policy, adapterForward, baseAnchor) : [];
    let repertoireStrength = 0;
    const validationTargets = baseAnchor ? validationImitation : validation;
    const repertoireChecks = [];
    for(const strength of repertoire.length ? [0, 0.5, 1] : [0]) {
        const measured = await evaluateAdapter(policy, withRepertoire(validationTargets, repertoire, strength));
        repertoireChecks.push({ strength, loss: measured.loss, accuracy: measured.accuracy });
        if(goal === 'imitate' && measured.loss < bestScore - 0.00001) {
            bestScore = measured.loss; repertoireStrength = strength;
        }
    }
    const finalCache = withRepertoire(cache, repertoire, repertoireStrength);
    const finalValidation = withRepertoire(validationTargets, repertoire, repertoireStrength);
    if(repertoire.length) send({ type: 'log',
        line: `Learned ${repertoire.length} personal opening positions from training games. Validation chose opening blend ${repertoireStrength}.` });
    send({ type: 'stage', stage: 'Exporting and verifying the complete Maia 3 ONNX network...' });
    const output = exportMaia3(prepared, bestMatrix, bestBias, repertoire, repertoireStrength);
    try {
        session = await ort.InferenceSession.create(output, sessionOptions);
        for(let i = 0; i < Math.min(3, samples.length); i++) {
            const result = await run(session, [samples[i]]);
            try {
                const expected = adapterForward(policy, finalCache[i]).logits, actual = result.logits_move.data;
                const error = Math.max(...finalCache[i].legal.map((index, j) => Math.abs(actual[index] - expected[j])));
                if(error > 0.01) throw new Error(`Exported Maia 3 failed logit verification (${error}).`);
                send({ type: 'log', line: `Exported full ONNX verified, max legal-logit error ${error.toExponential(3)}.` });
            } finally { Object.values(result).forEach(tensor => tensor.dispose()); }
        }
    } finally { if(session) await session.release(); }
    const report = {
        method: `Frozen Maia 3, ${featureSize === 512 ? 'full 512 tanh features' : 'deterministic 512-to-64 tanh feature projection'}, trainable residual move-policy adapter and personal opening repertoire`,
        format: 'maia3-onnx', baseModelSHA256, elo, goal, baseAnchor, featureSize,
        repertoire: { positions: repertoire.length, strength: repertoireStrength, validationChecks: repertoireChecks },
        opening: goal === 'opening' ? data.opening : undefined, squares,
        personality: personality ? { ...personality, id: data.personalityId, ...personalityMetrics(policy, validation) } : undefined,
        history, bestEpoch, improved: bestEpoch > 0 || repertoireStrength > 0, exportVerified: true, updates,
        trainPositions: trainSamples.length, validationPositions: validationSamples.length,
        provider: data.provider, gradientProvider: data.provider, parityError,
        featureMilliseconds, trainingMilliseconds, options: data.options,
        exportedObjectiveLoss: bestScore,
        selectionMetric: replay.length ? '75% held-out game CE + 25% known opening replay CE (replay is not held-out)' : 'Held-out objective cross-entropy',
        baselineAccuracy: baselineAccuracy(validation),
        exportedMetrics: await evaluateAdapter(policy, finalValidation)
    };
    const known = new Set(trainSet.map(sample => signatureKey(positionSignature(sample.fen))));
    for(const [name, subset] of [
        ['familiar', validation.filter(sample => known.has(signatureKey(positionSignature(sample.fen))))],
        ['novel', validation.filter(sample => !known.has(signatureKey(positionSignature(sample.fen))))],
        ['opening', validation.filter(sample => Number.isInteger(sample.ply) && sample.ply < 24)],
        ['middlegame', validation.filter(sample => validationPhase(sample) === 'middlegame')],
        ['endgame', validation.filter(sample => validationPhase(sample) === 'endgame')]
    ]) {
        report[`${name}Validation`] = { positions: subset.length, baselineAccuracy: baselineAccuracy(subset),
            ...(subset.length ? await evaluateAdapter(policy, withRepertoire(subset, repertoire, repertoireStrength)) : {}) };
    }
    const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
    postMessage({ type: 'complete', weights: buffer, report }, [buffer]);
}

self.onmessage = async ({ data }) => {
    if(data?.type !== 'train' || running) return;
    running = true;
    try { await train(data); }
    catch(error) { send({ type: 'error', message: error.message, stack: error.stack }); }
    finally { running = false; }
};

function personalityMetrics(policy, samples) {
    let baselineScore = 0, learnedScore = 0, targetScore = 0, baselineKL = 0, learnedKL = 0;
    for(const sample of samples) {
        const base = personalityTargets(sample.base, sample.base.map(() => 0));
        const learned = adapterForward(policy, sample).probabilities;
        sample.targets.forEach((p, i) => {
            baselineScore += base[i] * sample.scores[i];
            learnedScore += learned[i] * sample.scores[i];
            targetScore += p * sample.scores[i];
            if(p) {
                baselineKL += p * Math.log(p / Math.max(base[i], 1e-30));
                learnedKL += p * Math.log(p / Math.max(learned[i], 1e-30));
            }
        });
    }
    return Object.fromEntries(Object.entries({ baselineScore, learnedScore, targetScore, baselineKL, learnedKL })
        .map(([key, value]) => [key, value / samples.length]));
}
