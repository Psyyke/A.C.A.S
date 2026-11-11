import { openingSamples, shapeSquares, shapeRewards, objectiveTargets } from './objectives.js';
import { validatePersonality, personalityFeatures, personalityScores, personalityTargets } from './personality.js';
import { positionSignature, signatureKey } from './repertoire.js';
import { baselineAccuracy, validationPhase } from './files.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const fenOf = sample => sample.fen || sample.history?.[0];
const sourceUrl = new URL('../../app/assets/engines/Maia3/model/maia3_simplified.onnx', import.meta.url);
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    byte => byte.toString(16).padStart(2, '0')).join('');

export function transformerOrder(length, epoch, seed = 42) {
    let random = (seed + epoch) >>> 0;
    const order = Array.from({ length }, (_, index) => index);
    for(let i = order.length - 1; i > 0; i--) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        const j = random % (i + 1);
        [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
}

function probabilities(logits) {
    const maximum = Math.max(...logits), exp = logits.map(value => Math.exp(value - maximum));
    const total = exp.reduce((sum, value) => sum + value, 0);
    if(!Number.isFinite(total) || total <= 0) throw new Error('Full model returned nonfinite policy logits.');
    return exp.map(value => value / total);
}

export async function trainTransformer(data, send = () => {}) {
    const options = { epochs: 12, learningRate: 0.00001, batchSize: 6, patience: 2, baseAnchor: 0.25,
        weightDecay: 0.01, clipNorm: 1, seed: 42, useHistory: false, ...data.options };
    const { epochs, learningRate, batchSize, patience, baseAnchor, seed, weightDecay, clipNorm, useHistory } = options;
    const tokenChannels = useHistory ? 96 : 12, tokenCount = 64 * tokenChannels;
    const goal = data.goal || 'imitate', elo = data.elo;
    if(data.provider !== 'webgpu') throw new Error('Full transformer training requires WebGPU. Choose Fast adapter for CPU training.');
    if(!['imitate', 'opening', 'shape', 'personality'].includes(goal) || typeof useHistory !== 'boolean'
        || !Number.isInteger(epochs) || epochs < 1 || epochs > 100
        || !Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 0.001
        || !Number.isFinite(weightDecay) || weightDecay < 0 || weightDecay > 1
        || !Number.isFinite(clipNorm) || clipNorm <= 0
        || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 32
        || !Number.isInteger(patience) || patience < 1 || patience > 100
        || !Number.isInteger(elo) || elo < 600 || elo > 2600
        || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff
        || !Number.isFinite(baseAnchor) || baseAnchor < 0 || baseAnchor > 1 || (goal !== 'imitate' && baseAnchor !== 0))
        throw new Error('Invalid full Maia 3 training settings.');
    const trainingSamples = data.dataset?.train?.samples, validationSamples = data.dataset?.validation?.samples;
    if(!trainingSamples?.length || !validationSamples?.length || trainingSamples.length + validationSamples.length > 50000)
        throw new Error('Full training needs 1 to 50,000 positions with both training and validation games.');
    const knownGames = new Set(trainingSamples.map(sample => sample.gameId));
    if(trainingSamples.some(sample => typeof sample.gameId !== 'string' || !sample.gameId)
        || validationSamples.some(sample => typeof sample.gameId !== 'string' || !sample.gameId || knownGames.has(sample.gameId)))
        throw new Error('Full training requires separate training and validation games.');
    const seen = new Set(trainingSamples.map(sample => signatureKey(positionSignature(fenOf(sample)))));
    if(goal === 'imitate' && validationSamples.every(sample => seen.has(signatureKey(positionSignature(fenOf(sample))))))
        throw new Error('No new validation boards remain. Import more different games, or choose Fast adapter for an opening memory check.');
    const opening = goal === 'opening' ? openingSamples(data.opening) : [];
    const squares = goal === 'shape' ? shapeSquares(data.squares) : undefined;
    const personality = goal === 'personality' ? validatePersonality(data.personality) : undefined;
    const samples = [...trainingSamples, ...validationSamples, ...opening];
    send({ type: 'stage', stage: 'Loading the full Maia 3 transformer and WebGPU training kernels...' });
    const { tf, Maia3Transformer, TransformerAdamW, initializeTransformerGpu, checkTransformerGpu } = await import('./maia3-transformer.js');
    const { preprocessMaia3, mirrorMove, allPossibleMovesMaia3Reversed } = await import('../../app/assets/engines/Maia3/tensor.js');
    const moveIndex = new Map(Object.entries(allPossibleMovesMaia3Reversed).map(([index, move]) => [move, Number(index)]));
    await initializeTransformerGpu();
    const response = await fetch(sourceUrl);
    if(!response.ok) throw new Error(`Could not load Maia 3. HTTP ${response.status}.`);
    const source = new Uint8Array(await response.arrayBuffer()), baseModelSHA256 = await digest(source);
    let model, optimizer, session;
    const started = performance.now(), cache = [], history = [];
    let updates = 0, bestEpoch = 0, stale = 0, bestScore, snapshot, baselineParityError = 0;
    const encode = sample => {
        const fen = fenOf(sample);
        if(useHistory && (!Array.isArray(sample.history) || !sample.history.length))
            throw new Error('History-aware training needs the preceding boards from each source game.');
        const { boardTokens, legalMoves } = preprocessMaia3(fen, useHistory ? sample.history : undefined);
        const black = fen.split(' ')[1] === 'b';
        const legal = sample.legalMoves.map(move => moveIndex.get(black ? mirrorMove(move) : move));
        const target = sample.legalMoves.indexOf(sample.move);
        if(target < 0 || new Set(legal).size !== legal.length || legal.some(index => !Number.isInteger(index) || !legalMoves[index])
            || legal.length !== legalMoves.reduce((sum, value) => sum + value, 0))
            throw new Error('Dataset contains an incomplete or illegal Maia 3 move list.');
        return { ...sample, fen, tokens: Uint8Array.from(boardTokens), legal, target, key: signatureKey(positionSignature(fen)) };
    };
    const pack = rows => {
        const tokens = new Float32Array(rows.length * tokenCount), legal = new Uint8Array(rows.length * 4352);
        const targets = new Float32Array(rows.length * 4352);
        rows.forEach((row, i) => {
            tokens.set(row.tokens, i * tokenCount);
            row.legal.forEach((index, j) => {
                legal[i * 4352 + index] = 1;
                targets[i * 4352 + index] = row.targets?.[j] || 0;
            });
        });
        return { tokens: tf.tensor(tokens, [rows.length, 64, tokenChannels]), legal: tf.tensor(legal, [rows.length, 4352], 'bool'),
            targets: tf.tensor(targets, [rows.length, 4352]), eloSelf: tf.fill([rows.length], elo), eloOppo: tf.fill([rows.length], elo),
            displayIndex: rows.at(-1).legal[rows.at(-1).displayTarget ?? rows.at(-1).target] };
    };
    const infer = async rows => {
        const inputs = pack(rows);
        let output;
        try {
            output = model.forward(inputs.tokens, inputs.eloSelf, inputs.eloOppo);
            const logits = await output.logits.data(), value = await output.value.data();
            checkTransformerGpu();
            if(logits.some(value => !Number.isFinite(value)) || value.some(value => !Number.isFinite(value)))
                throw new Error('Full Maia 3 inference returned nonfinite values.');
            return rows.map((row, i) => ({ logits: row.legal.map(index => logits[i * 4352 + index]),
                value: Array.from(value.slice(i * 3, i * 3 + 3)) }));
        } finally { tf.dispose(inputs); if(output) tf.dispose(output); }
    };
    const evaluate = async (rows, recorded = goal === 'imitate') => {
        if(!rows.length) return { positions: 0 };
        let loss = 0, matches = 0, probability = 0, shapeScore = 0, valueDrift = 0, valueMaximumDrift = 0;
        let baselineScore = 0, learnedScore = 0, targetScore = 0, baselineKL = 0, learnedKL = 0;
        for(let start = 0; start < rows.length; start += batchSize) {
            const batch = rows.slice(start, start + batchSize), results = await infer(batch);
            results.forEach((output, i) => {
                const row = batch[i], p = probabilities(output.logits);
                const target = recorded ? row.target : row.displayTarget;
                const distribution = recorded ? p.map((_, j) => Number(j === target)) : row.targets;
                loss -= distribution.reduce((sum, value, j) => sum + value * Math.log(Math.max(p[j], 1e-30)), 0);
                matches += Number(p.indexOf(Math.max(...p)) === target);
                probability += p[target];
                if(row.rewards) shapeScore += p.reduce((sum, value, j) => sum + value * row.rewards[j], 0);
                output.value.forEach((value, j) => {
                    const delta = Math.abs(value - row.value[j]);
                    valueDrift += delta;
                    valueMaximumDrift = Math.max(valueMaximumDrift, delta);
                });
                if(row.scores) {
                    const base = probabilities(row.base);
                    row.targets.forEach((value, j) => {
                        baselineScore += base[j] * row.scores[j];
                        learnedScore += p[j] * row.scores[j];
                        targetScore += value * row.scores[j];
                        if(value) {
                            baselineKL += value * Math.log(value / Math.max(base[j], 1e-30));
                            learnedKL += value * Math.log(value / Math.max(p[j], 1e-30));
                        }
                    });
                }
            });
            await tick();
        }
        return { positions: rows.length, loss: loss / rows.length, accuracy: matches / rows.length,
            probability: probability / rows.length, goal: shapeScore / rows.length,
            valueMeanAbsoluteDrift: valueDrift / (3 * rows.length), valueMaximumAbsoluteDrift: valueMaximumDrift,
            ...(personality ? { personality: Object.fromEntries(Object.entries({ baselineScore, learnedScore, targetScore, baselineKL, learnedKL })
                .map(([key, value]) => [key, value / rows.length])) } : {}) };
    };
    const ort = await import('./runtime/dist/ort.webgpu.bundle.min.mjs');
    ort.env.wasm.wasmPaths = new URL('./runtime/dist/', import.meta.url).href;
    ort.env.wasm.numThreads = 1;
    const ortRun = async row => {
        const inputs = { tokens: new ort.Tensor('float32', Float32Array.from(row.tokens), [1, 64, tokenChannels]),
            elo_self: new ort.Tensor('float32', new Float32Array([elo]), [1]),
            elo_oppo: new ort.Tensor('float32', new Float32Array([elo]), [1]) };
        try { return await session.run(inputs); }
        finally { Object.values(inputs).forEach(tensor => tensor.dispose()); }
    };
    try {
        model = new Maia3Transformer(source, { history: useHistory });
        optimizer = new TransformerAdamW(model, options);
        for(let start = 0; start < samples.length; start += batchSize) {
            const batch = samples.slice(start, start + batchSize).map(encode), predictions = await infer(batch);
            for(let i = 0; i < batch.length; i++) {
                const row = batch[i], { logits: base, value } = predictions[i];
                const rewards = squares ? shapeRewards(row, squares) : undefined;
                const scores = personality ? personalityScores(personalityFeatures(row), personality) : undefined;
                const targets = scores ? personalityTargets(base, scores) : objectiveTargets(base, row.target, rewards, baseAnchor);
                cache.push({ ...row, base, value, targets, rewards, scores,
                    displayTarget: personality ? targets.indexOf(Math.max(...targets)) : row.target });
            }
            const last = cache.at(-1);
            send({ type: 'features', processed: cache.length, total: samples.length, move: last.move, fen: last.fen });
            await tick();
        }
        session = await ort.InferenceSession.create(model.bytes, { executionProviders: ['webgpu'] });
        for(const row of [cache[0], cache[Math.floor(cache.length / 2)], cache.at(-1)]) {
            const output = await ortRun(row);
            try {
                row.legal.forEach((index, j) => { baselineParityError = Math.max(baselineParityError, Math.abs(row.base[j] - output.logits_move.data[index])); });
            } finally { Object.values(output).forEach(tensor => tensor.dispose()); }
        }
        await session.release(); session = undefined;
        if(baselineParityError > 0.002) throw new Error(`Full transformer baseline verification failed (${baselineParityError}). No training was started.`);
        send({ type: 'log', line: `All eight transformer blocks are trainable. ${model.parameterCount.toLocaleString('en-US')} parameters. Baseline ONNX error ${baselineParityError.toExponential(3)}.` });
        const training = cache.slice(0, trainingSamples.length);
        const validation = cache.slice(trainingSamples.length, trainingSamples.length + validationSamples.length);
        const replay = cache.slice(trainingSamples.length + validationSamples.length);
        const novel = validation.filter(row => !seen.has(row.key)), familiar = validation.filter(row => seen.has(row.key));
        const selection = goal === 'imitate' ? novel : validation;
        const trainSet = [...training];
        if(replay.length) {
            const copies = Math.max(1, Math.floor(training.length / (4 * replay.length)));
            for(let i = 0; i < copies; i++) trainSet.push(...replay);
        }
        const measure = async epoch => {
            send({ type: 'evaluation', epoch });
            const train = await evaluate(training), heldOut = await evaluate(selection);
            const replayMetrics = replay.length ? await evaluate(replay, false) : undefined;
            const score = replayMetrics ? 0.75 * heldOut.loss + 0.25 * replayMetrics.loss : heldOut.loss;
            const point = { epoch, trainLoss: train.loss, trainAccuracy: train.accuracy, validationLoss: score,
                validationAccuracy: heldOut.accuracy, heldOutLoss: heldOut.loss, shapeScore: heldOut.goal,
                openingReplayLoss: replayMetrics?.loss, personalityScore: heldOut.personality?.learnedScore };
            history.push(point); send({ type: 'epoch', point }); return score;
        };
        const featureMilliseconds = performance.now() - started;
        bestScore = await measure(0);
        snapshot = await model.snapshot();
        send({ type: 'stage', stage: 'Training all eight Maia 3 transformer blocks on WebGPU...' });
        const trainingStarted = performance.now();
        for(let epoch = 1; epoch <= epochs; epoch++) {
            const order = transformerOrder(trainSet.length, epoch, seed);
            for(let start = 0; start < order.length; start += batchSize) {
                const rows = order.slice(start, start + batchSize).map(index => trainSet[index]), inputs = pack(rows);
                let gradients;
                try {
                    gradients = model.gradients(inputs);
                    const loss = (await gradients.value.data())[0];
                    if(!Number.isFinite(loss)) throw new Error('Nonfinite full model training loss. No model was exported.');
                    const probability = (await gradients.probability.data())[0];
                    const gradientNorm = await optimizer.apply(gradients.grads);
                    updates++;
                    const last = rows.at(-1);
                    send({ type: 'batch', epoch, processed: Math.min(start + batchSize, order.length), total: order.length,
                        loss, gradientNorm, probability, move: last.legalMoves[last.displayTarget], fen: last.fen });
                } finally { tf.dispose(inputs); if(gradients) tf.dispose(gradients); }
                await tick();
            }
            const score = await measure(epoch);
            if(score < bestScore - 0.00001) {
                bestScore = score; bestEpoch = epoch; stale = 0; snapshot = await model.snapshot();
            } else if(++stale >= patience) break;
        }
        const trainingMilliseconds = performance.now() - trainingStarted;
        optimizer.dispose(); optimizer = undefined;
        model.restore(snapshot);
        const exportedMetrics = await evaluate(validation), novelValidation = await evaluate(novel);
        const familiarValidation = await evaluate(familiar);
        const openingValidation = await evaluate(validation.filter(row => Number.isInteger(row.ply) && row.ply < 24));
        for(const [metrics, rows] of [
            [novelValidation, novel], [familiarValidation, familiar],
            [openingValidation, validation.filter(row => Number.isInteger(row.ply) && row.ply < 24)]
        ]) metrics.baselineAccuracy = baselineAccuracy(rows);
        const phaseMetrics = {};
        for(const phase of ['middlegame', 'endgame']) {
            const rows = validation.filter(row => validationPhase(row) === phase);
            phaseMetrics[`${phase}Validation`] = { ...await evaluate(rows), baselineAccuracy: baselineAccuracy(rows) };
        }
        send({ type: 'stage', stage: 'Exporting and checking the trained full transformer in ONNX Runtime...' });
        const probes = [validation[0], validation[Math.floor(validation.length / 2)], validation.at(-1)];
        const expected = await infer(probes);
        let output;
        try { output = await model.export(snapshot); }
        catch(error) { throw new Error(`Full transformer ONNX serialization failed: ${error.message}`, { cause: error }); }
        snapshot.clear(); snapshot = undefined;
        model.dispose(); model = undefined;
        try { session = await ort.InferenceSession.create(output, { executionProviders: ['webgpu'] }); }
        catch(error) { throw new Error(`Full transformer ONNX verification session failed: ${error.message}`, { cause: error }); }
        let exportMaximumLogitError = 0, exportMaximumValueError = 0;
        for(let i = 0; i < probes.length; i++) {
            const result = await ortRun(probes[i]);
            try {
                probes[i].legal.forEach((index, j) => { exportMaximumLogitError = Math.max(exportMaximumLogitError, Math.abs(result.logits_move.data[index] - expected[i].logits[j])); });
                expected[i].value.forEach((value, j) => { exportMaximumValueError = Math.max(exportMaximumValueError, Math.abs(result.logits_value.data[j] - value)); });
            } finally { Object.values(result).forEach(tensor => tensor.dispose()); }
        }
        if(exportMaximumLogitError > 0.005 || exportMaximumValueError > 0.001)
            throw new Error(`Full transformer ONNX verification failed. Policy ${exportMaximumLogitError}, value ${exportMaximumValueError}.`);
        checkTransformerGpu();
        const report = { method: 'Full Maia 3 transformer with AdamW and validation selected checkpoints',
            trainingMethod: 'full', format: 'maia3-onnx', trainableParameters: 22409728, baseModelSHA256, elo, goal, baseAnchor,
            tokenChannels, historyEncoding: useHistory ? '8:oldest-first:per-frame-turn:earliest-padding' : 'repeated-current-board',
            options, history, bestEpoch, improved: bestEpoch > 0, exportVerified: true, updates,
            opening: goal === 'opening' ? data.opening : undefined, squares,
            trainPositions: trainingSamples.length, validationPositions: validationSamples.length,
            provider: 'webgpu', gradientProvider: 'webgpu', featureMilliseconds, trainingMilliseconds,
            baselineParityError, exportMaximumLogitError, exportMaximumValueError, exportedObjectiveLoss: bestScore,
            selectionMetric: goal === 'imitate' ? 'Training unseen board validation cross entropy, including epoch zero'
                : replay.length ? '75% held-out game CE + 25% known opening replay CE' : 'Held-out objective cross entropy',
            baselineAccuracy: baselineAccuracy(validation), exportedMetrics, novelValidation, familiarValidation, openingValidation, ...phaseMetrics,
            valueWarning: 'Shared transformer updates can change value estimates. These models are not strength rated or WDL calibrated.',
            ...(personality ? { personality: { ...personality, id: data.personalityId, ...exportedMetrics.personality } } : {}) };
        return { weights: output, report };
    } finally {
        if(session) await session.release();
        if(optimizer) optimizer.dispose();
        if(model) model.dispose();
    }
}
