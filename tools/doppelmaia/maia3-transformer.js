// SPDX-License-Identifier: AGPL-3.0-only
// Maia 3 architecture and attribution are documented in experiments/finetune_README.md.
import * as tf from './training-runtime/tfjs-webgpu.js';
import { fields, get } from './weights.js';
import { float32Maia3, historyMaia3 } from './maia3-model.js';

const decoder = new TextDecoder();
const text = value => decoder.decode(value);
let modelNumber = 0;
let trainingDevice, gpuFailure;

export function checkTransformerGpu() {
    if(gpuFailure) throw new Error(`WebGPU training stopped. ${gpuFailure}`);
}

export async function initializeTransformerGpu() {
    if(!globalThis.navigator?.gpu) throw new Error('Full model training needs WebGPU. Use a current browser with GPU acceleration enabled.');
    tf.env().set('WEBGPU_CPU_FORWARD', false);
    // TFJS 4.22 SplitK gives wrong transposed GEMMs for Maia's small GAB batches.
    tf.env().set('WEBGPU_MATMUL_PROGRAM_TYPE', 3);
    if(!await tf.setBackend('webgpu')) throw new Error('Could not initialize the WebGPU training backend.');
    await tf.ready();
    const backend = tf.backend();
    if(!backend.device) throw new Error('The WebGPU training device is not available.');
    if(trainingDevice !== backend.device) {
        trainingDevice = backend.device;
        gpuFailure = undefined;
        trainingDevice.addEventListener('uncapturederror', event => {
            const memoryError = event.error.constructor?.name === 'GPUOutOfMemoryError'
                || /CreateHeap|CheckOutOfMemoryHRESULTImpl|out of memory/i.test(event.error.message);
            if(memoryError) gpuFailure = `GPU out of memory. ${event.error.message}`;
            else gpuFailure ??= event.error.message;
        });
        trainingDevice.lost.then(info => { gpuFailure ??= info.message || info.reason; });
    }
    checkTransformerGpu();
    return { tf, device: backend.device };
}

export class Maia3Transformer {
    constructor(source, { history = false } = {}) {
        if(typeof history !== 'boolean') throw new Error('Invalid Maia 3 history setting.');
        this.tokenChannels = history ? 96 : 12;
        this.bytes = float32Maia3(source);
        if(history) this.bytes = historyMaia3(this.bytes);
        this.nodes = new Map();
        this.weights = new Map();
        const prefix = `maia3_${modelNumber++}_`;
        try {
            for(const item of fields(get(this.bytes, 7))) {
                if(item.id === 1) {
                    const parts = fields(item.value);
                    this.nodes.set(text(get(item.value, 3)), {
                        inputs: parts.filter(part => part.id === 1).map(part => text(part.value)),
                        attributes: new Map(parts.filter(part => part.id === 5).map(part => [text(get(part.value, 1)), part.value]))
                    });
                }
                if(item.id !== 5 || get(item.value, 2) !== 1) continue;
                const name = text(get(item.value, 8));
                if(!name.startsWith('model.') && !name.startsWith('onnx::MatMul')) continue;
                const shape = fields(item.value).filter(part => part.id === 1).map(part => part.value);
                const raw = get(item.value, 9);
                if(!shape.every(Number.isInteger) || !raw || shape.reduce((a, b) => a * b, 1) * 4 !== raw.byteLength)
                    throw new Error(`Unsupported Maia 3 initializer ${name}.`);
                const data = new Float32Array(raw.slice().buffer);
                if(data.some(value => !Number.isFinite(value))) throw new Error(`Nonfinite Maia 3 weights in ${name}.`);
                const trainable = !name.includes('fc_value') && !name.includes('last_ln');
                const variable = tf.tidy(() => tf.variable(tf.tensor(data, shape), trainable, prefix + this.weights.size));
                this.weights.set(name, variable);
            }
            if(this.weights.size !== 160 || !this.nodes.has('/model/transformer/layers.7/linear2/MatMul'))
                throw new Error('Full training expects the bundled eight block Maia 3 architecture.');
            this.trainable = [...this.weights.values()].filter(variable => variable.trainable);
            this.parameterCount = this.trainable.reduce((total, variable) => total + variable.size, 0);
            if(this.parameterCount !== 22409728) throw new Error('Unexpected Maia 3 trainable parameter count.');
        } catch(error) {
            this.dispose();
            throw error;
        }
    }

    weight(name) {
        const weight = this.weights.get(name);
        if(!weight) throw new Error(`Missing Maia 3 initializer ${name}.`);
        return weight;
    }

    linear(x, name) {
        const prefix = '/model/' + name;
        const gemm = this.nodes.get(prefix + '/Gemm');
        const node = gemm || this.nodes.get(prefix + '/MatMul');
        if(!node) throw new Error(`Missing Maia 3 projection ${name}.`);
        const weight = this.weight(node.inputs[1]);
        const width = weight.shape[gemm ? 0 : 1];
        const dimensions = [...x.shape.slice(0, -1), width];
        let output = tf.reshape(tf.matMul(tf.reshape(x, [-1, x.shape.at(-1)]), weight, false, Boolean(gemm)), dimensions);
        if(gemm) output = tf.add(output, this.weight(node.inputs[2]));
        else {
            const add = this.nodes.get(prefix + '/Add');
            if(add) output = tf.add(output, this.weight(add.inputs.find(input => this.weights.has(input))));
        }
        return output;
    }

    layerNorm(x, name) {
        const node = this.nodes.get('/model/' + name + '/LayerNormalization');
        const raw = node?.attributes.get('epsilon');
        if(!raw) throw new Error(`Missing Maia 3 normalization ${name}.`);
        const bytes = get(raw, 2);
        const epsilon = new DataView(bytes.buffer, bytes.byteOffset, 4).getFloat32(0, true);
        const centered = tf.sub(x, tf.mean(x, -1, true));
        const normalized = tf.div(centered, tf.sqrt(tf.add(tf.mean(tf.square(centered), -1, true), epsilon)));
        return tf.add(tf.mul(normalized, this.weight(node.inputs[1])), this.weight(node.inputs[2]));
    }

    gelu(x) {
        return tf.mul(tf.mul(x, 0.5), tf.add(1, tf.erf(tf.div(x, 1.4140625))));
    }

    rmsNorm(x, name) {
        return tf.mul(tf.div(x, tf.sqrt(tf.add(tf.mean(tf.square(x), -1, true), 1.0132789611816406e-6))), this.weight(name));
    }

    embedding(tokens, eloSelf, eloOppo) {
        const batch = tokens.shape[0];
        const elo = value => {
            const ratio = tf.reshape(tf.div(tf.clipByValue(value, 0, 5000), 5000), [-1, 1, 1]);
            return tf.tile(tf.add(tf.mul(ratio, this.weight('model.elo_embedding_low.weight')),
                tf.mul(tf.sub(1, ratio), this.weight('model.elo_embedding_high.weight'))), [1, 64, 1]);
        };
        const clocks = tf.tile(tf.tensor3d([1.7998046875, 0.0200042724609375, 1.7998046875], [1, 1, 3]), [batch, 64, 1]);
        return this.linear(tf.concat([this.tokenChannels === 96 ? tokens : tf.tile(tokens, [1, 1, 8]),
            clocks, elo(eloSelf), elo(eloOppo)], -1), 'token_projection');
    }

    block(x, index) {
        const prefix = `transformer/layers.${index}/`, batch = x.shape[0];
        let y = tf.reshape(this.linear(x, prefix + 'self_attn/sm1'), [batch, -1]);
        y = this.layerNorm(this.gelu(this.linear(y, prefix + 'self_attn/sm2')), prefix + 'self_attn/ln1');
        y = this.layerNorm(this.gelu(this.linear(y, prefix + 'self_attn/sm3')), prefix + 'self_attn/ln2');
        const bias = tf.reshape(tf.matMul(tf.reshape(y, [-1, 128]), this.weight('model.gab_shared_weight'), false, true), [batch, 16, 64, 64]);
        const projection = this.weight(this.nodes.get('/model/' + prefix + 'self_attn/mha/MatMul').inputs[1]);
        const qkv = tf.reshape(tf.matMul(tf.reshape(x, [-1, 512]), projection), [batch, 64, 1536]);
        const [q, k, v] = tf.split(qkv, 3, -1).map(tensor => tf.transpose(tf.reshape(tensor, [batch, 64, 16, 32]), [0, 2, 1, 3]));
        const attention = tf.softmax(tf.add(tf.matMul(tf.mul(q, 0.42041015625), tf.mul(k, 0.42041015625), false, true), bias), -1);
        y = tf.reshape(tf.transpose(tf.matMul(attention, v), [0, 2, 1, 3]), [-1, 512]);
        const outputProjection = this.weight(this.nodes.get('/model/' + prefix + 'self_attn/mha/MatMul_3').inputs[1]);
        x = this.rmsNorm(tf.add(x, tf.reshape(tf.matMul(y, outputProjection), [batch, 64, 512])),
            `model.transformer.layers.${index}.norm1.weight`);
        y = this.linear(this.gelu(this.linear(x, prefix + 'linear1')), prefix + 'linear2');
        return this.rmsNorm(tf.add(x, y), `model.transformer.layers.${index}.norm2.weight`);
    }

    heads(x, withValue) {
        const batch = x.shape[0];
        x = this.layerNorm(x, 'transformer/norm');
        const source = this.linear(x, 'proj_sq_from'), target = this.linear(x, 'proj_sq_to');
        const scores = tf.div(tf.matMul(source, target, false, true), 22.625);
        const promotion = tf.mul(this.linear(tf.slice(target, [0, 56, 0], [-1, 8, -1]), 'promo_bias_proj'), 22.625);
        const promotionScores = tf.add(tf.expandDims(tf.slice(scores, [0, 48, 56], [-1, 8, 8]), -1), tf.expandDims(promotion, 1));
        const logits = tf.concat([tf.reshape(scores, [batch, 4096]), tf.reshape(promotionScores, [batch, 256])], -1);
        if(!withValue) return { logits };
        const pooled = this.layerNorm(tf.mean(x, 1), 'last_ln');
        return { logits, value: this.linear(tf.relu(this.linear(pooled, 'fc_value_hid')), 'fc_value') };
    }

    forward(tokens, eloSelf, eloOppo = eloSelf, withValue = true) {
        checkTransformerGpu();
        if(tokens.shape.length !== 3 || tokens.shape[0] < 1 || tokens.shape[0] > 32
            || tokens.shape[1] !== 64 || tokens.shape[2] !== this.tokenChannels
            || eloSelf.size !== tokens.shape[0] || eloOppo.size !== tokens.shape[0])
            throw new Error('Full model training requires batches of 1 to 32 encoded boards and matching ratings.');
        return tf.tidy(() => {
            let x = this.embedding(tokens, eloSelf, eloOppo);
            for(let index = 0; index < 8; index++) x = this.block(x, index);
            return this.heads(x, withValue);
        });
    }

    gradients(batch) {
        let probability;
        const gradients = tf.variableGrads(() => tf.tidy(() => {
            const { logits } = this.forward(batch.tokens, batch.eloSelf, batch.eloOppo, false);
            const masked = tf.where(batch.legal, logits, tf.fill(logits.shape, -1e9));
            const logp = tf.logSoftmax(masked, -1);
            if(Number.isInteger(batch.displayIndex))
                probability = tf.keep(tf.exp(tf.gather(tf.reshape(logp, [-1]), (batch.tokens.shape[0] - 1) * 4352 + batch.displayIndex)));
            return tf.neg(tf.mean(tf.sum(tf.mul(batch.targets, logp), -1)));
        }), this.trainable);
        return { ...gradients, ...(probability ? { probability } : {}) };
    }

    async snapshot() {
        const snapshot = new Map();
        for(const [name, variable] of this.weights) {
            checkTransformerGpu();
            snapshot.set(name, (await variable.data()).slice());
        }
        checkTransformerGpu();
        return snapshot;
    }

    restore(snapshot) {
        if(snapshot.size !== this.weights.size) throw new Error('Incomplete Maia 3 checkpoint.');
        for(const [name, variable] of this.weights) {
            const values = snapshot.get(name);
            if(!(values instanceof Float32Array) || values.length !== variable.size || values.some(value => !Number.isFinite(value)))
                throw new Error(`Invalid Maia 3 checkpoint tensor ${name}.`);
        }
        for(const [name, variable] of this.weights)
            tf.tidy(() => variable.assign(tf.tensor(snapshot.get(name), variable.shape)));
    }

    async export(snapshot) {
        snapshot ??= await this.snapshot();
        if(snapshot.size !== this.weights.size) throw new Error('Incomplete Maia 3 checkpoint.');
        const patches = [];
        for(const item of fields(get(this.bytes, 7))) {
            if(item.id !== 5) continue;
            const name = text(get(item.value, 8));
            if(!this.weights.has(name)) continue;
            const values = snapshot.get(name);
            const raw = get(item.value, 9);
            if(!(values instanceof Float32Array) || values.length !== this.weights.get(name).size
                || !raw || raw.byteLength !== values.byteLength)
                throw new Error(`Invalid Maia 3 checkpoint tensor ${name}.`);
            if(values.some(value => !Number.isFinite(value))) throw new Error('Training produced nonfinite model weights.');
            patches.push({ offset: raw.byteOffset - this.bytes.byteOffset, values });
        }
        if(patches.length !== this.weights.size) throw new Error('Incomplete Maia 3 export initializers.');
        // FP32 tensor sizes are unchanged, so preserve protobuf framing without rebuilding the graph.
        const output = this.bytes.slice();
        for(const { offset, values } of patches)
            output.set(new Uint8Array(values.buffer, values.byteOffset, values.byteLength), offset);
        return output;
    }

    dispose() {
        for(const variable of this.weights.values()) variable.dispose();
        this.weights.clear();
    }
}

export class TransformerAdamW {
    constructor(model, { learningRate = 0.00001, weightDecay = 0.01, clipNorm = 1 } = {}) {
        if(!Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 0.001
            || !Number.isFinite(weightDecay) || weightDecay < 0 || weightDecay > 1
            || !Number.isFinite(clipNorm) || clipNorm <= 0)
            throw new Error('Invalid full model optimizer settings.');
        this.model = model;
        this.learningRate = learningRate;
        this.weightDecay = weightDecay;
        this.clipNorm = clipNorm;
        this.iteration = 0;
        this.moments = model.trainable.map(variable => tf.tidy(() => ({
            mean: tf.variable(tf.zerosLike(variable), false),
            square: tf.variable(tf.zerosLike(variable), false)
        })));
    }

    async apply(gradients) {
        const ordered = this.model.trainable.map(variable => gradients[variable.name]);
        if(ordered.some(gradient => !gradient)) throw new Error('Full model backward pass omitted a trainable weight.');
        const normTensor = tf.tidy(() => {
            let sums = ordered.map(gradient => tf.sum(tf.square(gradient)));
            // WebGPU limits bindings per shader, so never AddN all 154 gradients.
            while(sums.length > 1)
                sums = Array.from({ length: Math.ceil(sums.length / 2) }, (_, index) =>
                    index * 2 + 1 < sums.length ? tf.add(sums[index * 2], sums[index * 2 + 1]) : sums[index * 2]);
            return tf.sqrt(sums[0]);
        });
        let norm;
        try { norm = (await normTensor.data())[0]; }
        finally { normTensor.dispose(); }
        checkTransformerGpu();
        if(!Number.isFinite(norm)) throw new Error('Nonfinite transformer gradients. No optimizer update was applied.');
        const clip = Math.min(1, this.clipNorm / (norm + 1e-6));
        this.iteration++;
        const correction1 = 1 - 0.9 ** this.iteration, correction2 = Math.sqrt(1 - 0.999 ** this.iteration);
        tf.tidy(() => {
            for(let index = 0; index < ordered.length; index++) {
                const variable = this.model.trainable[index], moments = this.moments[index];
                const gradient = tf.mul(ordered[index], clip);
                moments.mean.assign(tf.add(tf.mul(moments.mean, 0.9), tf.mul(gradient, 0.1)));
                moments.square.assign(tf.add(tf.mul(moments.square, 0.999), tf.mul(tf.square(gradient), 0.001)));
                const denominator = tf.add(tf.div(tf.sqrt(moments.square), correction2), 1e-8);
                variable.assign(tf.sub(tf.mul(variable, 1 - this.learningRate * this.weightDecay),
                    tf.mul(tf.div(moments.mean, denominator), this.learningRate / correction1)));
            }
        });
        return norm;
    }

    dispose() {
        for(const moments of this.moments) { moments.mean.dispose(); moments.square.dispose(); }
    }
}

export { tf };
