import { adapterSize, moveCount } from './maia3-model.js';

export function adapterForward(policy, sample) {
    if(sample.features.length * moveCount !== policy.matrix.length)
        throw new Error('Maia 3 adapter feature dimensions do not match.');
    const logits = sample.legal.map((index, j) => {
        let value = sample.base[j] + policy.bias[index];
        for(let k = 0; k < sample.features.length; k++) value += sample.features[k] * policy.matrix[k * moveCount + index];
        if(!Number.isFinite(value)) throw new Error('Maia 3 adapter diverged. Lower the learning rate.');
        return value;
    });
    const max = Math.max(...logits), exp = logits.map(value => Math.exp(value - max));
    const sum = exp.reduce((a, b) => a + b, 0), probabilities = exp.map(value => value / sum);
    return { logits, probabilities,
        loss: -sample.targets.reduce((value, target, j) => value + target * (logits[j] - max - Math.log(sum)), 0),
        correct: logits.indexOf(max) === sample.target ? 1 : 0,
        probability: probabilities[sample.target] };
}

export function cpuAdapterStep(policy, samples, learningRate) {
    const matrix = new Float32Array(policy.matrix.length), bias = new Float32Array(moveCount);
    for(const sample of samples) {
        const { probabilities } = adapterForward(policy, sample);
        for(let j = 0; j < sample.legal.length; j++) {
            const index = sample.legal[j], error = probabilities[j] - sample.targets[j];
            bias[index] += error;
            for(let k = 0; k < sample.features.length; k++) matrix[k * moveCount + index] += error * sample.features[k];
        }
    }
    for(const key of ['matrix', 'bias']) {
        const gradient = key === 'matrix' ? matrix : bias;
        for(let i = 0; i < gradient.length; i++) {
            policy.velocity[key][i] = 0.9 * policy.velocity[key][i] + gradient[i] / samples.length + 0.0001 * policy[key][i];
            policy[key][i] -= learningRate * policy.velocity[key][i];
        }
    }
}

export function emptyAdapter(featureSize = adapterSize) {
    if(![64, 512].includes(featureSize)) throw new Error('Unsupported Maia 3 feature size.');
    const matrix = new Float32Array(featureSize * moveCount), bias = new Float32Array(moveCount);
    return { matrix, bias, velocity: { matrix: matrix.slice(), bias: bias.slice() } };
}

export async function evaluateAdapter(policy, samples) {
    let loss = 0, correct = 0, goal = 0;
    for(const sample of samples) {
        const result = adapterForward(policy, sample);
        loss += result.loss; correct += result.correct;
        goal += result.probabilities.reduce((sum, p, j) => sum + p * (sample.rewards?.[j] || 0), 0);
    }
    return { loss: loss / samples.length, accuracy: correct / samples.length, goal: goal / samples.length };
}
