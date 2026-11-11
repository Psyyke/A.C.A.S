import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import { createHalfPartials } from './half-partials.mjs';
import { decodeFloat16 } from './float16.js';
import { patchPackedAccumulation } from './webgpu-precision-patches.mjs';
import { candidateConverterSource } from './candidate-converter.mjs';

const require = createRequire(import.meta.url);
const { onnx } = require('./node_modules/onnxruntime-web/lib/onnxjs/ort-schema/protobuf/onnx.js');
const packed = await readFile(new URL('./node_modules/onnxruntime-web/lib/wasm/jsep/webgpu/ops/3rd-party/matmul_packed_webgpu.ts',
    import.meta.url), 'utf8');

for(const halfProducts of [false, true]) {
    test(`patches both packed accumulation paths, half products ${halfProducts}`, () => {
        const output = patchPackedAccumulation(packed, halfProducts);
        assert.match(output, /var acc: array<vec4<f32>, rowPerThread>/);
        assert.match(output, /var acc : array<array<f32, colPerThread>, rowPerThread>/);
        assert.match(output, /vec4<\$\{type\}>\(acc\[innerRow\]\)/);
        assert.equal(output.includes('f32(ACached * BCached[innerCol])'), halfProducts);
        assert.equal(output.includes('f32(ACached) * f32(BCached[innerCol])'), !halfProducts);
        assert.throws(() => patchPackedAccumulation(output, halfProducts), /no longer matches/);
    });
}

function model({ weights = [0.1, 0.2, 0.3], group = 1, type = 1, withConv = true, opset = 17 } = {}) {
    const value = (name, dims) => ({ name, type: { tensorType: {
        elemType: type, shape: { dim: dims.map(dimValue => ({ dimValue })) }
    } } });
    const graph = {
        input: [value('input', [1, 3, 1, 1])], output: [value('output', [1, 1, 1, 1])],
        initializer: [
            { name: 'kernel', dims: [1, 3, 1, 1], dataType: 1, rawData: new Uint8Array(Float32Array.from(weights).buffer) },
            { name: 'bias', dims: [1], dataType: 1, rawData: new Uint8Array(Float32Array.of(0.25).buffer) }
        ],
        node: withConv
            ? [{ name: 'conv', opType: 'Conv', input: ['input', 'kernel', 'bias'], output: ['output'],
                attribute: [{ name: 'group', type: 2, i: group }] }]
            : [{ name: 'identity', opType: 'Identity', input: ['input'], output: ['output'] }]
    };
    return onnx.ModelProto.encode(onnx.ModelProto.create({
        irVersion: 8, opsetImport: [{ version: opset }], graph
    })).finish();
}

test('splits convolution inputs and half kernels, adds float32 partials and bias', () => {
    const input = model(), original = input.slice();
    const output = onnx.ModelProto.decode(createHalfPartials(input, 2));
    assert.deepEqual(input, original);
    assert.equal(output.graph.node.filter(node => node.opType === 'Conv').length, 2);
    assert.equal(output.graph.node.filter(node => node.opType === 'Add').length, 2);
    const half = output.graph.initializer.filter(tensor => tensor.dataType === 10);
    assert.deepEqual(half.map(tensor => tensor.dims.map(Number)), [[1, 2, 1, 1], [1, 1, 1, 1]]);
    const values = half.flatMap(tensor => {
        const data = new DataView(tensor.rawData.buffer, tensor.rawData.byteOffset, tensor.rawData.byteLength);
        return Array.from({ length: tensor.rawData.length / 2 }, (_, index) => decodeFloat16(data.getUint16(index * 2, true)));
    });
    values.forEach((value, index) => assert.ok(Math.abs(value - [0.1, 0.2, 0.3][index]) < 0.0002));
    assert.equal(output.graph.initializer.some(tensor => tensor.name === 'kernel'), false);
    assert.deepEqual(output.graph.initializer.find(tensor => tensor.name.endsWith('/bias')).dims.map(Number), [1, 1, 1, 1]);
    assert.equal(output.graph.output[0].name, 'output');
    assert.equal(output.graph.output[0].type.tensorType.elemType, 1);
    assert.throws(() => createHalfPartials(onnx.ModelProto.encode(output).finish()), /already exist/);
});

for(const [name, options, pattern] of [
    ['opsets without explicit Split sizes', { opset: 12 }, /opset 13/],
    ['grouped convolutions', { group: 3 }, /Unsupported convolution/],
    ['non-float32 interfaces', { type: 10 }, /float32 inputs/],
    ['graphs without convolutions', { withConv: false }, /No convolutions/],
    ['non-finite weights', { weights: [NaN, 0.2, 0.3] }, /Non-finite/],
    ['overflowing half weights', { weights: [100000, 0.2, 0.3] }, /overflowing/]
]) {
    test(`rejects ${name} instead of generating an invalid candidate`, () => {
        assert.throws(() => createHalfPartials(model(options)), pattern);
    });
}

test('rejects invalid partial widths', () => {
    for(const width of [0, -1, 1.5, 257, NaN])
        assert.throws(() => createHalfPartials(model(), width), /Partial width/);
});

test('candidate injection is bound to the exact original weights', async () => {
    const weights = new Uint8Array([1, 2, 3]).buffer;
    const hash = createHash('sha256').update(new Uint8Array(weights)).digest('hex');
    const source = candidateConverterSource(hash).replace("import './original-converter-worker.js';", '');
    const forwarded = [], messages = [];
    const self = { onmessage: event => forwarded.push(event.data), postMessage: (data, transfer) => messages.push({ data, transfer }) };
    const output = new Uint8Array([4, 5]).buffer;
    let fetched = 0;
    new Function('self', 'crypto', 'fetch', source)(self, webcrypto, async () => {
        fetched++;
        return { ok: true, arrayBuffer: async () => output };
    });
    await self.onmessage({ data: { weights, dataType: 'f32' } });
    await self.onmessage({ data: { weights: new Uint8Array([8]).buffer, dataType: 'f16-mixed' } });
    assert.equal(forwarded.length, 2);
    assert.equal(fetched, 0);
    await self.onmessage({ data: { weights, dataType: 'f16-mixed', returnWeights: true } });
    assert.equal(fetched, 1);
    assert.equal(messages[0].data.weights, weights);
    assert.equal(messages[0].data.output, output);
    assert.deepEqual(messages[0].transfer, [output, weights]);
});

test('candidate injection reports fetch failures without success messages', async () => {
    const weights = new Uint8Array([1]).buffer;
    const hash = createHash('sha256').update(new Uint8Array(weights)).digest('hex');
    const source = candidateConverterSource(hash).replace("import './original-converter-worker.js';", '');
    const messages = [], self = { onmessage() {}, postMessage: data => messages.push(data) };
    new Function('self', 'crypto', 'fetch', source)(self, webcrypto, async () => ({ ok: false, status: 503 }));
    await self.onmessage({ data: { weights, dataType: 'f16-mixed' } });
    assert.deepEqual(messages, [{ type: 'error', message: 'Candidate model HTTP 503' }]);
    assert.throws(() => candidateConverterSource('invalid'), /SHA-256/);
});
