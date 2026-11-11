function patch(features, cell, channels) {
    const result = new Float32Array(channels * 9), row = cell >> 3, file = cell % 8;
    for(let channel = 0; channel < channels; channel++)
        for(let y = 0; y < 3; y++) for(let x = 0; x < 3; x++) {
            const r = row + y - 1, f = file + x - 1;
            if(r >= 0 && r < 8 && f >= 0 && f < 8)
                result[channel * 9 + y * 3 + x] = features[channel * 64 + r * 8 + f];
        }
    return result;
}

export function forward(policy, sample, mapping, gradient) {
    const size = policy.channels * 9, patches = new Map(), logits = [];
    for(const index of sample.legal) {
        const mapped = mapping[index], cell = mapped % 64, output = Math.floor(mapped / 64);
        if(!patches.has(cell)) patches.set(cell, patch(sample.features, cell, policy.channels));
        const values = patches.get(cell), offset = output * size;
        let value = policy.bias[output];
        for(let i = 0; i < size; i++) value += policy.matrix[offset + i] * values[i];
        if(!Number.isFinite(value)) throw new Error('Policy inference produced non-finite logits. Lower the learning rate.');
        logits.push(value);
    }
    const max = Math.max(...logits), exp = logits.map(value => Math.exp(value - max));
    const total = exp.reduce((sum, value) => sum + value, 0), probabilities = exp.map(value => value / total);
    if(gradient) {
        for(let j = 0; j < sample.legal.length; j++) {
            const mapped = mapping[sample.legal[j]], cell = mapped % 64, output = Math.floor(mapped / 64);
            const values = patches.get(cell), offset = output * size;
            const error = probabilities[j] - Number(j === sample.target);
            gradient.bias[output] += error;
            for(let i = 0; i < size; i++) gradient.matrix[offset + i] += error * values[i];
        }
    }
    return {
        loss: max + Math.log(total) - logits[sample.target],
        correct: logits.indexOf(max) === sample.target ? 1 : 0,
        probability: probabilities[sample.target],
        predicted: logits.indexOf(max), logits
    };
}

export async function evaluate(policy, samples, mapping, yieldControl = async () => {}) {
    let loss = 0, correct = 0;
    for(let i = 0; i < samples.length; i++) {
        const result = forward(policy, samples[i], mapping);
        loss += result.loss; correct += result.correct;
        if(i % 32 === 0) await yieldControl();
    }
    return { loss: loss / samples.length, accuracy: correct / samples.length };
}

export async function trainPolicy(policy, train, validation, mapping, options, report, yieldControl = async () => {}) {
    const { epochs = 10, learningRate = 0.005, batchSize = 16, patience = 3 } = options;
    if(!train.length || !validation.length || !Number.isInteger(epochs) || epochs < 1 || epochs > 100
        || !Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 0.1
        || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 128)
        throw new Error('Invalid training data or training settings.');
    const base = { matrix: policy.matrix.slice(), bias: policy.bias.slice() };
    const momentum = { matrix: new Float32Array(policy.matrix.length), bias: new Float32Array(policy.bias.length) };
    const history = [];
    const measure = async epoch => {
        await report({ type: 'evaluation', epoch });
        const training = await evaluate(policy, train, mapping, yieldControl);
        const heldOut = await evaluate(policy, validation, mapping, yieldControl);
        const point = { epoch, trainLoss: training.loss, trainAccuracy: training.accuracy,
            validationLoss: heldOut.loss, validationAccuracy: heldOut.accuracy };
        history.push(point);
        await report({ type: 'epoch', point });
        return point;
    };
    let best = await measure(0), bestMatrix = policy.matrix.slice(), bestBias = policy.bias.slice(), stale = 0;
    let random = 42;
    for(let epoch = 1; epoch <= epochs; epoch++) {
        const order = Array.from({ length: train.length }, (_, i) => i);
        for(let i = order.length - 1; i > 0; i--) {
            random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
            const j = random % (i + 1); [order[i], order[j]] = [order[j], order[i]];
        }
        for(let start = 0; start < order.length; start += batchSize) {
            const gradient = { matrix: new Float32Array(policy.matrix.length), bias: new Float32Array(policy.bias.length) };
            const batch = order.slice(start, start + batchSize);
            let last;
            for(const i of batch) last = { sample: train[i], result: forward(policy, train[i], mapping, gradient) };
            let norm = 0;
            for(const key of ['matrix', 'bias']) for(const value of gradient[key]) norm += (value / batch.length) ** 2;
            const scale = Math.min(1, 5 / (Math.sqrt(norm) || 1));
            for(const key of ['matrix', 'bias']) for(let i = 0; i < policy[key].length; i++) {
                const derivative = gradient[key][i] / batch.length * scale + 0.0001 * (policy[key][i] - base[key][i]);
                momentum[key][i] = 0.9 * momentum[key][i] + derivative;
                policy[key][i] -= learningRate * momentum[key][i];
                if(!Number.isFinite(policy[key][i])) throw new Error('Training diverged. Lower the learning rate.');
            }
            await report({ type: 'batch', epoch, processed: Math.min(start + batchSize, train.length),
                total: train.length, loss: last.result.loss, probability: last.result.probability,
                move: last.sample.move, fen: last.sample.fen });
            await yieldControl();
        }
        const point = await measure(epoch);
        if(point.validationLoss < best.validationLoss - 0.00001) {
            best = point; bestMatrix = policy.matrix.slice(); bestBias = policy.bias.slice(); stale = 0;
        } else if(++stale >= patience) break;
    }
    policy.matrix.set(bestMatrix); policy.bias.set(bestBias);
    return { history, bestEpoch: best.epoch, improved: best.epoch > 0, best };
}
