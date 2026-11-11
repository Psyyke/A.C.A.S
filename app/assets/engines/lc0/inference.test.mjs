import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserInference, createInferenceDispatcher } from './browser-inference.js';
import { encodeFloat16 } from './float16.js';

class Tensor {
    constructor(type, data, dims) {
        Object.assign(this, { type, data, dims });
    }
}

function request(dispatch, batch = 1, wdl = true, mlh = true) {
    const inputSize = batch * 112 * 64;
    const policySize = batch * 1858;
    const valueSize = batch * (wdl ? 3 : 1);
    const input = 0;
    const policy = inputSize * 4;
    const value = policy + policySize * 4;
    const movesLeft = value + valueSize * 4;
    const status = movesLeft + batch * 4;
    const buffer = new SharedArrayBuffer(status + 4);
    new Float32Array(buffer, input, inputSize).fill(0.25);
    dispatch(input, batch, policy, value, movesLeft, wdl, mlh, status, buffer);
    return { buffer, policy, value, movesLeft, status, batch };
}

async function waitForStatus(req) {
    const view = new Int32Array(req.buffer, req.status, 1);
    for(let i = 0; i < 100 && Atomics.load(view, 0) === 0; i++)
        await new Promise(resolve => setTimeout(resolve, 5));
    assert.notEqual(Atomics.load(view, 0), 0, 'Inference did not unblock the caller');
    return Atomics.load(view, 0);
}

test('dispatches batches and copies all WDL and moves-left heads', async () => {
    const errors = [];
    const session = {
        async run(feeds) {
            assert.deepEqual(feeds['/input/planes'].dims, [2, 112, 8, 8]);
            assert.equal(feeds['/input/planes'].data[3], 0.25);
            return {
                '/output/policy': new Tensor('float32', new Float32Array(2 * 1858).fill(4), [2, 1858]),
                '/output/wdl': new Tensor('float32', Float32Array.from([0.6, 0.3, 0.1, 0.1, 0.2, 0.7]), [2, 3]),
                '/output/mlh': new Tensor('float32', Float32Array.from([30, 25]), [2, 1])
            };
        }
    };
    const req = request(createInferenceDispatcher({ Tensor }, session, message => errors.push(message)), 2);
    assert.equal(await waitForStatus(req), 1);
    assert.equal(new Float32Array(req.buffer, req.policy, 2 * 1858)[3000], 4);
    assert.ok(Math.abs(new Float32Array(req.buffer, req.value, 6)[0] - 0.6) < 1e-6);
    assert.deepEqual([...new Float32Array(req.buffer, req.movesLeft, 2)], [30, 25]);
    assert.deepEqual(errors, []);
});

test('reports invalid output and fails queued and subsequent requests', async () => {
    const errors = [];
    let runs = 0;
    const session = { async run() { runs++; return { '/output/policy': new Tensor('float32', new Float32Array([NaN]), [1]) }; } };
    const dispatch = createInferenceDispatcher({ Tensor }, session, message => errors.push(message));
    const first = request(dispatch, 1, false, false);
    const second = request(dispatch, 1, false, false);
    assert.equal(await waitForStatus(first), -1);
    assert.equal(await waitForStatus(second), -1);
    const third = request(dispatch, 1, false, false);
    assert.equal(await waitForStatus(third), -1);
    assert.equal(runs, 1);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Invalid Lc0 ONNX output/);
});

test('rejects non-finite output and unblocks the search', async () => {
    const errors = [];
    const session = {
        async run() {
            const policy = new Float32Array(1858);
            policy[100] = Infinity;
            return { '/output/policy': new Tensor('float32', policy, [1, 1858]) };
        }
    };
    const req = request(createInferenceDispatcher({ Tensor }, session, message => errors.push(message)), 1, false, false);
    assert.equal(await waitForStatus(req), -1);
    assert.match(errors[0], /Non-finite Lc0 ONNX output/);
});

test('rejects wrongly shaped output even when its element count matches', async () => {
    const errors = [];
    const session = {
        async run() {
            return { '/output/policy': new Tensor('float32', new Float32Array(2 * 1858), [1858, 2]) };
        }
    };
    const req = request(createInferenceDispatcher({ Tensor }, session, message => errors.push(message)), 2, false, false);
    assert.equal(await waitForStatus(req), -1);
    assert.match(errors[0], /Invalid Lc0 ONNX output \/output\/policy/);
});

test('reports provider failure and releases all waiting searches', async () => {
    const errors = [];
    let runs = 0;
    const session = { async run() { runs++; throw new Error('GPU device lost'); } };
    const dispatch = createInferenceDispatcher({ Tensor }, session, message => errors.push(message));
    const requests = [request(dispatch), request(dispatch), request(dispatch)];
    assert.deepEqual(await Promise.all(requests.map(waitForStatus)), [-1, -1, -1]);
    assert.equal(runs, 1);
    assert.deepEqual(errors, ['Lc0 inference failed: GPU device lost']);
});

test('copies scalar values when WDL and moves-left heads are absent', async () => {
    const errors = [];
    const session = {
        async run() {
            return {
                '/output/policy': new Tensor('float32', new Float32Array(1858), [1, 1858]),
                '/output/value': new Tensor('float32', Float32Array.of(-0.25), [1, 1])
            };
        }
    };
    const req = request(createInferenceDispatcher({ Tensor }, session, message => errors.push(message)), 1, false, false);
    assert.equal(await waitForStatus(req), 1);
    assert.equal(new Float32Array(req.buffer, req.value, 1)[0], -0.25);
    assert.deepEqual(errors, []);
});

test('converts float16 input and output buffers for batched inference', async () => {
    const errors = [];
    const session = {
        async run(feeds) {
            assert.equal(feeds['/input/planes'].type, 'float16');
            assert.equal(feeds['/input/planes'].data[3], encodeFloat16(0.25));
            return {
                '/output/policy': new Tensor('float16', new Uint16Array(2 * 1858).fill(encodeFloat16(-2)), [2, 1858]),
                '/output/wdl': new Tensor('float16', Uint16Array.from([0.5, 0.25, 0.25, 0.25, 0.25, 0.5], encodeFloat16), [2, 3]),
                '/output/mlh': new Tensor('float16', Uint16Array.from([30, 25], encodeFloat16), [2, 1])
            };
        }
    };
    const req = request(createInferenceDispatcher({ Tensor }, session, message => errors.push(message), 'f16'), 2);
    assert.equal(await waitForStatus(req), 1);
    assert.equal(new Float32Array(req.buffer, req.policy, 2 * 1858)[3000], -2);
    assert.deepEqual([...new Float32Array(req.buffer, req.value, 6)], [0.5, 0.25, 0.25, 0.25, 0.25, 0.5]);
    assert.deepEqual([...new Float32Array(req.buffer, req.movesLeft, 2)], [30, 25]);
    assert.deepEqual(errors, []);
});

test('reads numeric native Float16Array output without treating it as raw bits', { skip: typeof Float16Array === 'undefined' }, async () => {
    const errors = [];
    const session = {
        async run() {
            return {
                '/output/policy': new Tensor('float16', new Float16Array(1858).fill(-2), [1, 1858]),
                '/output/value': new Tensor('float16', Float16Array.from([0.5]), [1, 1])
            };
        }
    };
    const req = request(createInferenceDispatcher({ Tensor }, session, message => errors.push(message), 'f16'), 1, false, false);
    assert.equal(await waitForStatus(req), 1);
    assert.equal(new Float32Array(req.buffer, req.policy, 1858)[0], -2);
    assert.equal(new Float32Array(req.buffer, req.value, 1)[0], 0.5);
    assert.deepEqual(errors, []);
});

test('allows small float16 WDL rounding error but rejects larger errors', async () => {
    for(const [wdl, expected] of [[[0.5, 0.25, 0.2515], 1], [[0.5, 0.25, 0.26], -1]]) {
        const errors = [];
        const session = {
            async run() {
                return {
                    '/output/policy': new Tensor('float16', new Uint16Array(1858), [1, 1858]),
                    '/output/wdl': new Tensor('float16', Uint16Array.from(wdl, encodeFloat16), [1, 3])
                };
            }
        };
        const req = request(createInferenceDispatcher({ Tensor }, session, message => errors.push(message), 'f16'), 1, true, false);
        assert.equal(await waitForStatus(req), expected);
        if(expected === -1) assert.match(errors[0], /WDL probabilities/);
        else assert.deepEqual(errors, []);
    }
});

test('rejects float16 if the GPU adapter lacks shader-f16', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true, value: { gpu: { async requestAdapter() { return { features: new Set() }; } } }
    });
    try {
        await assert.rejects(createBrowserInference(new ArrayBuffer(1), 'webgpu', () => {}, 'f16'), /shader-f16/);
        await assert.rejects(createBrowserInference(new ArrayBuffer(1), 'wasm', () => {}, 'f16'), /requires the WebGPU/);
    } finally {
        if(original) Object.defineProperty(globalThis, 'navigator', original);
        else delete globalThis.navigator;
    }
});

for(const [name, wdl, mlh, value, movesLeft, expected] of [
    ['WDL probabilities', true, false, [0.8, 0.3, 0.2], 0, /WDL probabilities/],
    ['scalar value', false, false, [1.5], 0, /ONNX value/],
    ['moves-left value', false, true, [0.5], -1, /moves-left value/]
]) {
    test(`rejects invalid finite ${name}`, async () => {
        const errors = [];
        const session = {
            async run() {
                return {
                    '/output/policy': new Tensor('float32', new Float32Array(1858), [1, 1858]),
                    [wdl ? '/output/wdl' : '/output/value']: new Tensor('float32', Float32Array.from(value), [1, value.length]),
                    '/output/mlh': new Tensor('float32', Float32Array.of(movesLeft), [1, 1])
                };
            }
        };
        const req = request(createInferenceDispatcher({ Tensor }, session, message => errors.push(message)), 1, wdl, mlh);
        assert.equal(await waitForStatus(req), -1);
        assert.match(errors[0], expected);
    });
}
