import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fields, field, get, join, replace } from '../tools/doppelmaia/weights.js';

const source = await readFile(new URL('../tools/doppelmaia/maia3-transformer.js', import.meta.url), 'utf8');

async function gpu() {
    let report, lost;
    const device = {
        addEventListener(name, callback) { report = callback; },
        lost: new Promise(resolve => { lost = resolve; })
    };
    const context = vm.createContext({
        navigator: { gpu: {} },
        tf: { env: () => ({ set() {} }), setBackend: async () => true,
            ready: async () => {}, backend: () => ({ device }) }
    });
    vm.runInContext(source.slice(source.indexOf('let trainingDevice'), source.indexOf('export class Maia3Transformer'))
        .replaceAll('export ', ''), context);
    await vm.runInContext('initializeTransformerGpu()', context);
    return {
        report(error) { report({ error }); },
        lost,
        check() { vm.runInContext('checkTransformerGpu()', context); }
    };
}

test('GPU allocation failures survive cascading validation errors and device loss', async () => {
    const runtime = await gpu();
    runtime.report(new Error('ID3D12Device::CreateHeap failed'));
    runtime.report(new Error('[Invalid CommandBuffer] is invalid due to a previous error.'));
    runtime.lost({ reason: 'unknown', message: 'Device lost' });
    await Promise.resolve();
    assert.throws(() => runtime.check(), /GPU out of memory.*CreateHeap/);
});

test('typed GPU memory errors take priority even when reported after validation errors', async () => {
    const runtime = await gpu();
    runtime.report(new Error('Invalid buffer'));
    runtime.report({ constructor: { name: 'GPUOutOfMemoryError' }, message: 'Allocation failed' });
    assert.throws(() => runtime.check(), /GPU out of memory.*Allocation failed/);
});

test('non-memory GPU errors retain the first useful cause', async () => {
    const runtime = await gpu();
    runtime.report(new Error('Shader compilation failed'));
    runtime.report(new Error('Invalid command buffer'));
    assert.throws(() => runtime.check(), /Shader compilation failed/);
});

function checkpointModel(weights, tf = {}, checkTransformerGpu = () => {}) {
    const context = vm.createContext({ tf, checkTransformerGpu, Float32Array, Uint8Array, fields, field, get, join, replace,
        text: value => new TextDecoder().decode(value) });
    vm.runInContext(source.slice(source.indexOf('export class Maia3Transformer'),
        source.indexOf('export class TransformerAdamW')).replace('export ', ''), context);
    const model = vm.runInContext('Object.create(Maia3Transformer.prototype)', context);
    model.weights = weights;
    return model;
}

test('checkpoint readbacks are serialized and retain independent CPU copies', async () => {
    let active = 0, peak = 0;
    const arrays = Array.from({ length: 160 }, (_, index) => new Float32Array([index, index + 1]));
    const weights = new Map(arrays.map((values, index) => [String(index), {
        async data() {
            peak = Math.max(peak, ++active);
            await new Promise(resolve => setImmediate(resolve));
            active--;
            return values;
        }
    }]));
    const snapshot = await checkpointModel(weights).snapshot();
    assert.equal(peak, 1);
    assert.equal(snapshot.size, 160);
    for(const [index, values] of arrays.entries()) {
        assert.deepEqual(snapshot.get(String(index)), values);
        assert.notEqual(snapshot.get(String(index)), values);
        values.fill(-1);
        assert.equal(snapshot.get(String(index))[0], index);
    }
});

test('checkpoint readback errors propagate without starting later tensors', async () => {
    let laterRead = false;
    const model = checkpointModel(new Map([
        ['first', { data: async () => { throw new Error('GPU readback failed'); } }],
        ['later', { data: async () => { laterRead = true; return new Float32Array(1); } }]
    ]));
    await assert.rejects(() => model.snapshot(), /GPU readback failed/);
    assert.equal(laterRead, false);
});

test('checkpoint restoration releases each temporary tensor and validates before assigning', () => {
    let live = 0, peak = 0, assignments = 0;
    const tf = {
        tensor(values, shape) {
            peak = Math.max(peak, ++live);
            return { values, shape };
        },
        tidy(callback) {
            try { callback(); } finally { live = 0; }
        }
    };
    const weights = new Map(Array.from({ length: 160 }, (_, index) => [String(index), {
        size: 2, shape: [2],
        assign(tensor) {
            assignments++;
            assert.deepEqual(tensor.shape, [2]);
            assert.equal(tensor.values[0], index);
        }
    }]));
    const snapshot = new Map([...weights.keys()].map(name => [name, new Float32Array([Number(name), 1])]));
    const model = checkpointModel(weights, tf);
    model.restore(snapshot);
    assert.equal(assignments, 160);
    assert.equal(peak, 1);
    assert.equal(live, 0);
    snapshot.set('159', new Float32Array([NaN, 1]));
    assert.throws(() => model.restore(snapshot), /Invalid Maia 3 checkpoint tensor 159/);
    assert.equal(assignments, 160);
});

test('export reuses the selected CPU checkpoint without any GPU readbacks', async () => {
    const model = checkpointModel(new Map([['model.test', { size: 2 }]]));
    const original = new Float32Array([1, 2]);
    const selected = new Float32Array([3, 4]);
    model.bytes = field(7, field(5, join([
        field(8, new TextEncoder().encode('model.test')),
        field(9, new Uint8Array(original.buffer))
    ])));
    model.snapshot = () => { throw new Error('Unexpected GPU readback'); };
    const output = await model.export(new Map([['model.test', selected]]));
    const raw = get(get(get(output, 7), 5), 9);
    assert.deepEqual(new Float32Array(raw.slice().buffer), selected);
    assert.equal(output.length, model.bytes.length);
    assert.deepEqual(new Float32Array(get(get(get(model.bytes, 7), 5), 9).slice().buffer), original);
    await assert.rejects(() => model.export(new Map()), /Incomplete Maia 3 checkpoint/);
    await assert.rejects(() => model.export(new Map([['model.test', new Float32Array(1)]])), /Invalid Maia 3 checkpoint/);
    await assert.rejects(() => model.export(new Map([['model.test', new Float32Array([NaN, 1])]])), /nonfinite/);
});

test('checkpoint export allocates one model copy and preserves unrelated protobuf bytes', async () => {
    const model = checkpointModel(new Map([['model.test', { size: 2 }]]));
    const tensor = field(5, join([field(8, new TextEncoder().encode('model.test')),
        field(9, new Uint8Array(new Float32Array([1, 2]).buffer)), field(10, new Uint8Array([7, 8]))]));
    const serialized = join([field(1, new Uint8Array([11])), field(7, join([field(1, new Uint8Array([12])), tensor])),
        field(12, new Uint8Array([13]))]);
    const backing = new Uint8Array(serialized.length + 16);
    backing.set(serialized, 8);
    model.bytes = backing.subarray(8, 8 + serialized.length);
    const original = model.bytes.slice();
    let copies = 0;
    model.bytes.slice = () => { copies++; return original.slice(); };
    const selected = new Float32Array([3, 4]);
    const output = await model.export(new Map([['model.test', selected]]));
    const expected = original.slice(), raw = get(get(get(original, 7), 5), 9);
    expected.set(new Uint8Array(selected.buffer), raw.byteOffset - original.byteOffset);
    assert.deepEqual(output, expected);
    assert.equal(copies, 1);
    assert.deepEqual(backing.subarray(8, 8 + serialized.length), original);
});
