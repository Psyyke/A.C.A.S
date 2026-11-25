import assert from 'node:assert/strict';
import test from 'node:test';
import { createGpuReadbackSession } from './gpu-readback.js';

const MAP_READ = 1, COPY_SRC = 4, COPY_DST = 8;
const MAX_BYTES = 1024 * (1858 + 3 + 1) * 4;
const POLICY = '/output/policy', WDL = '/output/wdl', VALUE = '/output/value', MLH = '/output/mlh';

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

class FakeBuffer {
    constructor(size, usage, device) {
        this.size = size;
        this.usage = usage;
        this.device = device;
        this.bytes = new ArrayBuffer(size);
        this.mapState = 'unmapped';
        this.mapCalls = [];
        this.rangeCalls = [];
        this.unmapCalls = 0;
        this.destroyCalls = 0;
    }
    mapAsync(mode, offset, size) {
        this.mapCalls.push({ mode, offset, size });
        assert.equal(this.usage, MAP_READ | COPY_DST);
        assert.equal(mode, 1);
        assert.equal(offset % 8, 0);
        assert.equal(size % 4, 0);
        assert.ok(offset + size <= this.size);
        assert.equal(this.mapState, 'unmapped');
        if(this.device.fail.mapSync) throw this.device.fail.mapSync;
        this.mapState = 'pending';
        this.device.mapStarted.resolve();
        return (async () => {
            if(this.device.mapGate) await this.device.mapGate.promise;
            if(this.device.fail.map) {
                this.mapState = 'unmapped';
                throw this.device.fail.map;
            }
            this.mapState = 'mapped';
        })();
    }
    getMappedRange(offset, size) {
        this.rangeCalls.push({ offset, size });
        if(this.device.fail.range) throw this.device.fail.range;
        assert.equal(this.mapState, 'mapped');
        this.mappedRange = this.bytes.slice(offset, offset + size);
        return this.mappedRange;
    }
    unmap() {
        this.unmapCalls++;
        if(this.device.fail.unmap) throw this.device.fail.unmap;
        if(this.mappedRange) new Uint8Array(this.mappedRange).fill(0);
        this.mappedRange = undefined;
        this.mapState = 'unmapped';
    }
    destroy() {
        this.destroyCalls++;
        this.mapState = 'unmapped';
    }
}

class FakeDevice {
    constructor(fail = {}) {
        this.fail = fail;
        this.loss = deferred();
        this.lost = this.loss.promise;
        this.mapStarted = deferred();
        this.buffers = [];
        this.copies = [];
        this.submissions = [];
        this.scopes = [];
        this.popCalls = 0;
        this.queue = { submit: commands => {
            if(this.fail.submit) throw this.fail.submit;
            this.submissions.push(commands);
            for(const copies of commands) {
                for(const { source, sourceOffset, destination, offset, size } of copies) {
                    assert.equal(source.destroyCalls, 0);
                    assert.equal(destination.destroyCalls, 0);
                    new Uint8Array(destination.bytes, offset, size).set(new Uint8Array(source.bytes, sourceOffset, size));
                }
            }
        } };
    }
    createBuffer({ size, usage }) {
        if(this.fail.allocate) throw this.fail.allocate;
        assert.ok(size > 0 && size <= MAX_BYTES);
        assert.equal(size % 4, 0);
        const buffer = new FakeBuffer(size, usage, this);
        this.buffers.push(buffer);
        return buffer;
    }
    createCommandEncoder() {
        if(this.fail.encoder) throw this.fail.encoder;
        const copies = [];
        return {
            copyBufferToBuffer: (source, sourceOffset, destination, offset, size) => {
                if(this.fail.copy && copies.length === 1) throw this.fail.copy;
                assert.equal(sourceOffset % 4, 0);
                assert.equal(offset % 4, 0);
                assert.equal(size % 4, 0);
                assert.ok(sourceOffset + size <= source.size);
                assert.ok(offset + size <= destination.size);
                assert.equal(source.usage & COPY_SRC, COPY_SRC);
                const copy = { source, sourceOffset, destination, offset, size };
                copies.push(copy);
                this.copies.push(copy);
            },
            finish: () => {
                if(this.fail.finish) throw this.fail.finish;
                return copies;
            }
        };
    }
    pushErrorScope(filter) {
        assert.equal(filter, 'validation');
        this.scopes.push(filter);
    }
    popErrorScope() {
        this.popCalls++;
        assert.equal(this.scopes.pop(), 'validation');
        return this.fail.scope ? Promise.reject(this.fail.scope) : Promise.resolve(this.fail.validation || null);
    }
    lose() {
        this.loss.resolve({ reason: 'unknown', message: 'test device loss' });
    }
}

function gpuTensor(batch, columns, seed = 1) {
    const data = Float32Array.from({ length: batch * columns }, (_, index) => seed + index / 8);
    const buffer = new FakeBuffer(Math.ceil(data.byteLength / 256) * 256, COPY_SRC);
    new Uint8Array(buffer.bytes).fill(0xff);
    new Float32Array(buffer.bytes, 0, data.length).set(data);
    return {
        type: 'float32', location: 'gpu-buffer', dims: [batch, columns], size: data.length,
        gpuBuffer: buffer, expected: data, disposeCalls: 0,
        get data() { throw new Error('GPU data must not be read via tensor.data'); },
        dispose() { this.disposeCalls++; buffer.destroy(); }
    };
}

function outputs(batch = 1, scalar = false, mlh = true) {
    return {
        [POLICY]: gpuTensor(batch, 1858, -20),
        [scalar ? VALUE : WDL]: gpuTensor(batch, scalar ? 1 : 3, 0.25),
        ...(mlh ? { [MLH]: gpuTensor(batch, 1, 30) } : {})
    };
}

function ortSession(run) {
    return {
        inputNames: ['/input/planes'], outputNames: [POLICY, WDL, MLH], runCalls: [], releaseCalls: 0,
        run(feeds) { this.runCalls.push(feeds); return run(feeds); },
        async release() { this.releaseCalls++; }
    };
}

function assertDisposed(result, count = 1) {
    for(const tensor of new Set(Object.values(result))) assert.equal(tensor.disposeCalls, count);
}

for(const scalar of [false, true]) {
    test(`one packed submit/map returns independent float32 policy/${scalar ? 'value' : 'WDL'}/MLH payloads`, async () => {
        const gpu = outputs(1, scalar);
        // Deliberately use non-policy-first enumeration and an odd float count (4-byte, not 8-byte, head offset).
        const ordered = { [MLH]: gpu[MLH], [POLICY]: gpu[POLICY], [scalar ? VALUE : WDL]: gpu[scalar ? VALUE : WDL] };
        const device = new FakeDevice();
        const feeds = { '/input/planes': { location: 'cpu' } };
        const session = ortSession(received => { assert.equal(received, feeds); return ordered; });
        const wrapper = createGpuReadbackSession(session, device);
        assert.equal(wrapper.inputNames, session.inputNames);
        assert.equal(wrapper.outputNames, session.outputNames);
        const result = await wrapper.run(feeds);
        assert.deepEqual(Object.keys(result), Object.keys(ordered));
        let offset = 0;
        for(const [index, [name, tensor]] of Object.entries(ordered).entries()) {
            const cpu = result[name];
            assert.equal(cpu.type, 'float32');
            assert.equal(cpu.location, 'cpu');
            assert.equal(cpu.size, tensor.size);
            assert.deepEqual(cpu.dims, tensor.dims);
            assert.notEqual(cpu.dims, tensor.dims);
            assert.ok(cpu.data instanceof Float32Array);
            assert.deepEqual(cpu.data, tensor.expected);
            assert.equal(cpu.data.buffer.byteLength, tensor.expected.byteLength);
            assert.notEqual(cpu.data.buffer, tensor.gpuBuffer.bytes);
            assert.equal(device.copies[index].sourceOffset, 0);
            assert.equal(device.copies[index].offset, offset);
            assert.equal(device.copies[index].size, tensor.size * 4);
            offset += tensor.size * 4;
        }
        assert.equal(new Set(Object.values(result).map(tensor => tensor.data.buffer)).size, 3);
        assert.equal(device.buffers.length, 1);
        assert.equal(device.buffers[0].size, offset);
        assert.equal(device.buffers[0].unmapCalls, 1);
        assert.deepEqual(device.buffers[0].mapCalls, [{ mode: 1, offset: 0, size: offset }]);
        assert.deepEqual(device.buffers[0].rangeCalls, [{ offset: 0, size: offset }]);
        assert.equal(device.submissions.length, 1);
        assert.equal(device.submissions[0].length, 1);
        assert.equal(device.popCalls, 1);
        assertDisposed(gpu);
        await wrapper.release();
    });
}

test('staging is reused, grows exactly as needed, survives smaller runs, and releases once', async () => {
    const device = new FakeDevice();
    const runs = [outputs(1, true, false), outputs(1, true, false), outputs(2), outputs(1)];
    const session = ortSession(() => runs.shift());
    const wrapper = createGpuReadbackSession(session, device);
    const first = await wrapper.run({});
    const originalPolicy = first[POLICY].data.slice();
    await wrapper.run({});
    assert.equal(device.buffers.length, 1);
    assert.equal(device.buffers[0].mapCalls.length, 2);
    await wrapper.run({});
    assert.equal(device.buffers.length, 2);
    assert.equal(device.buffers[0].destroyCalls, 1);
    assert.equal(device.buffers[1].size, 2 * (1858 + 3 + 1) * 4);
    await wrapper.run({});
    assert.equal(device.buffers.length, 2);
    assert.equal(device.buffers[1].mapCalls.length, 2);
    assert.equal(device.buffers[1].mapCalls[1].size, (1858 + 3 + 1) * 4);
    assert.deepEqual(first[POLICY].data, originalPolicy);
    const release = wrapper.release();
    assert.equal(wrapper.release(), release);
    await release;
    assert.equal(session.releaseCalls, 1);
    assert.deepEqual(device.buffers.map(buffer => buffer.destroyCalls), [1, 1]);
    await assert.rejects(wrapper.run({}), /released/);
});

test('batch 1024 reaches but does not exceed the staging bound', async () => {
    const device = new FakeDevice();
    const gpu = outputs(1024);
    const wrapper = createGpuReadbackSession(ortSession(() => gpu), device);
    const result = await wrapper.run({});
    assert.equal(device.buffers[0].size, MAX_BYTES);
    assert.deepEqual(result[POLICY].data, gpu[POLICY].expected);
    assertDisposed(gpu);
    await wrapper.release();
});

const invalidOutputs = [
    ['float16', gpu => { gpu[POLICY].type = 'float16'; }, /float32 GPU/],
    ['CPU output', gpu => { gpu[POLICY].location = 'cpu'; }, /float32 GPU/],
    ['missing policy', gpu => { delete gpu[POLICY]; }, /policy/],
    ['missing value', gpu => { delete gpu[WDL]; }, /value head/],
    ['both value heads', gpu => { gpu[VALUE] = gpuTensor(1, 1); }, /exactly one/],
    ['unknown output', gpu => { gpu.extra = gpuTensor(1, 1); }, /float32 GPU/],
    ['wrong columns', gpu => { gpu[POLICY].dims[1] = 1859; }, /shape or element count/],
    ['wrong element count', gpu => { gpu[POLICY].size--; }, /shape or element count/],
    ['nonfinite element count', gpu => { gpu[POLICY].size = NaN; }, /shape or element count/],
    ['non-array shape', gpu => { gpu[POLICY].dims = new Uint32Array([1, 1858]); }, /shape or element count/],
    ['wrong rank', gpu => { gpu[POLICY].dims = [1, 1, 1858]; }, /shape or element count/],
    ['mismatched batches', gpu => { gpu[MLH] = gpuTensor(2, 1); }, /shape or element count/],
    ['undersized GPU buffer', gpu => { gpu[POLICY].gpuBuffer.size = 4; }, /source buffer/],
    ['missing COPY_SRC', gpu => { gpu[POLICY].gpuBuffer.usage = COPY_DST; }, /source buffer/],
    ...[NaN, Infinity, -Infinity, 0, -1, 1.5, 1025, Number.MAX_SAFE_INTEGER, '1'].map(batch =>
        [`invalid batch ${batch}`, gpu => { gpu[POLICY].dims[0] = batch; }, /shape or element count/]),
    ...[NaN, Infinity, -1, 0, 3.5, '1858'].map(columns =>
        [`invalid columns ${columns}`, gpu => { gpu[POLICY].dims[1] = columns; }, /shape or element count/])
];
for(const [name, invalidate, pattern] of invalidOutputs) {
    test(`${name} is rejected before allocation and every returned tensor is disposed`, async () => {
        const device = new FakeDevice();
        const gpu = outputs();
        invalidate(gpu);
        const wrapper = createGpuReadbackSession(ortSession(() => gpu), device);
        await assert.rejects(wrapper.run({}), pattern);
        assert.equal(device.buffers.length, 0);
        assert.equal(device.submissions.length, 0);
        assertDisposed(gpu);
        await wrapper.release();
    });
}

for(const stage of ['allocate', 'encoder', 'copy', 'finish', 'submit', 'mapSync', 'map', 'range', 'unmap', 'validation', 'scope']) {
    test(`${stage} errors propagate with cleanup; the next run can recover`, async () => {
        const error = new Error(`test ${stage} failure`);
        const device = new FakeDevice({ [stage]: error });
        const failed = outputs();
        const good = outputs(1, true);
        const runs = [failed, good];
        const session = ortSession(() => runs.shift());
        const wrapper = createGpuReadbackSession(session, device);
        await assert.rejects(wrapper.run({}), actual => actual === error);
        assertDisposed(failed);
        assert.deepEqual(device.scopes, []);
        assert.equal(device.popCalls, 1);
        for(const buffer of device.buffers) assert.equal(buffer.destroyCalls, 1);
        device.fail = {};
        const result = await wrapper.run({});
        assert.deepEqual(result[VALUE].data, good[VALUE].expected);
        assertDisposed(good);
        await wrapper.release();
        for(const buffer of device.buffers) assert.equal(buffer.destroyCalls, 1);
    });
}

test('map and validation failures are both preserved', async () => {
    const map = new Error('map failure'), validation = new Error('copy validation failure');
    const device = new FakeDevice({ map, validation });
    const gpu = outputs();
    const wrapper = createGpuReadbackSession(ortSession(() => gpu), device);
    await assert.rejects(wrapper.run({}), error => error instanceof AggregateError
        && error.errors.includes(map) && error.errors.includes(validation));
    assertDisposed(gpu);
    assert.equal(device.buffers[0].unmapCalls, 1);
    await wrapper.release();
});

test('a throwing disposer does not skip other heads or hide the original map error', async () => {
    const map = new Error('map failure'), dispose = new Error('dispose failure');
    const device = new FakeDevice({ map });
    const gpu = outputs();
    gpu[POLICY].dispose = function() { this.disposeCalls++; throw dispose; };
    const wrapper = createGpuReadbackSession(ortSession(() => gpu), device);
    await assert.rejects(wrapper.run({}), error => error instanceof AggregateError
        && error.errors.includes(map) && error.errors.includes(dispose));
    assertDisposed(gpu);
    assert.equal(device.buffers[0].destroyCalls, 1);
    await wrapper.release();
});

test('a source getter error still disposes that tensor and later returned heads', async () => {
    const error = new Error('source getter failed');
    const gpu = outputs();
    Object.defineProperty(gpu[POLICY], 'gpuBuffer', { get() { throw error; } });
    const device = new FakeDevice();
    const wrapper = createGpuReadbackSession(ortSession(() => gpu), device);
    await assert.rejects(wrapper.run({}), actual => actual === error);
    assertDisposed(gpu);
    assert.equal(device.buffers.length, 0);
    await wrapper.release();
});

for(const sameTensor of [true, false]) {
    test(`never disposes ${sameTensor ? 'an input tensor' : 'an output alias of an input GPU buffer'}`, async () => {
        const input = gpuTensor(1, 1858);
        const gpu = outputs();
        gpu[POLICY] = sameTensor ? input : {
            type: input.type, location: input.location, dims: input.dims.slice(), size: input.size,
            gpuBuffer: input.gpuBuffer, disposeCalls: 0,
            dispose() { this.disposeCalls++; this.gpuBuffer.destroy(); }
        };
        const device = new FakeDevice();
        const wrapper = createGpuReadbackSession(ortSession(() => gpu), device);
        await assert.rejects(wrapper.run({ '/input/planes': input }), /user-owned input/);
        assert.equal(input.disposeCalls, 0);
        assert.equal(input.gpuBuffer.destroyCalls, 0);
        assert.equal(gpu[POLICY].disposeCalls, 0);
        assert.equal(gpu[WDL].disposeCalls, 1);
        assert.equal(gpu[MLH].disposeCalls, 1);
        assert.equal(device.buffers.length, 0);
        await wrapper.release();
        assert.equal(input.gpuBuffer.destroyCalls, 0);
    });
}

test('duplicate returned tensor references are disposed once, not once per name', async () => {
    const gpu = outputs();
    gpu.alias = gpu[POLICY];
    const wrapper = createGpuReadbackSession(ortSession(() => gpu), new FakeDevice());
    await assert.rejects(wrapper.run({}), /float32 GPU/);
    assertDisposed(gpu);
    await wrapper.release();
});

test('preallocated fetches and other run overloads are rejected without touching user buffers', async () => {
    const input = gpuTensor(1, 1858);
    const session = ortSession(() => { throw new Error('must not run'); });
    const wrapper = createGpuReadbackSession(session, new FakeDevice());
    await assert.rejects(wrapper.run({}, { [POLICY]: input }), /run\(feeds\) only/);
    await assert.rejects(wrapper.run({}, [POLICY]), /run\(feeds\) only/);
    assert.equal(session.runCalls.length, 0);
    assert.equal(input.disposeCalls, 0);
    await wrapper.release();
});

test('underlying run errors propagate without disposing inputs or allocating staging', async () => {
    const error = new Error('ORT run failure');
    const input = gpuTensor(1, 1858);
    const device = new FakeDevice();
    const session = ortSession(() => { throw error; });
    const wrapper = createGpuReadbackSession(session, device);
    await assert.rejects(wrapper.run({ '/input/planes': input }), actual => actual === error);
    assert.equal(input.disposeCalls, 0);
    assert.equal(input.gpuBuffer.destroyCalls, 0);
    assert.equal(device.buffers.length, 0);
    await wrapper.release();
});

test('concurrent runs are rejected; release waits through ORT, mapping, and tensor cleanup', async () => {
    const gate = deferred();
    const device = new FakeDevice();
    device.mapGate = deferred();
    const gpu = outputs();
    const session = ortSession(() => gate.promise);
    const wrapper = createGpuReadbackSession(session, device);
    const pending = wrapper.run({});
    await assert.rejects(wrapper.run({}), /Concurrent/);
    assert.equal(session.runCalls.length, 1);
    const release = wrapper.release();
    assert.equal(wrapper.release(), release);
    await assert.rejects(wrapper.run({}), /released/);
    assert.equal(session.releaseCalls, 0);
    gate.resolve(gpu);
    await device.mapStarted.promise;
    assert.equal(session.releaseCalls, 0);
    assert.equal(device.buffers[0].destroyCalls, 0);
    assertDisposed(gpu, 0);
    device.mapGate.resolve();
    const result = await pending;
    assert.deepEqual(result[WDL].data, gpu[WDL].expected);
    await release;
    assertDisposed(gpu);
    assert.equal(session.releaseCalls, 1);
    assert.equal(device.buffers[0].destroyCalls, 1);
});

test('release also waits for a failing run and remains idempotent', async () => {
    const gate = deferred();
    const error = new Error('ORT failure');
    const session = ortSession(() => gate.promise);
    const device = new FakeDevice();
    const wrapper = createGpuReadbackSession(session, device);
    const pending = wrapper.run({});
    const rejected = assert.rejects(pending, actual => actual === error);
    const release = wrapper.release();
    assert.equal(session.releaseCalls, 0);
    gate.reject(error);
    await rejected;
    await release;
    assert.equal(wrapper.release(), release);
    assert.equal(session.releaseCalls, 1);
    assert.equal(device.buffers.length, 0);
});

test('release without a run releases only ORT, including release errors', async () => {
    const error = new Error('ORT release failure');
    const session = ortSession(() => outputs());
    session.release = async function() { this.releaseCalls++; throw error; };
    const wrapper = createGpuReadbackSession(session, new FakeDevice());
    const release = wrapper.release();
    await assert.rejects(release, actual => actual === error);
    assert.equal(wrapper.release(), release);
    assert.equal(session.releaseCalls, 1);
    await assert.rejects(wrapper.run({}), /released/);
});

for(const phase of ['before run', 'during ORT', 'during map']) {
    test(`device loss ${phase} propagates without returning CPU results`, async () => {
        const device = new FakeDevice();
        const gpu = outputs();
        const gate = deferred();
        const session = ortSession(() => phase === 'during ORT' ? gate.promise : gpu);
        const wrapper = createGpuReadbackSession(session, device);
        if(phase === 'before run') {
            device.lose();
            await Promise.resolve();
        }
        if(phase === 'during map') device.mapGate = gate;
        const pending = wrapper.run({});
        const rejected = assert.rejects(pending, /WebGPU device lost.*test device loss/);
        if(phase === 'during ORT') {
            device.lose();
            gate.resolve(gpu);
        } else if(phase === 'during map') {
            await device.mapStarted.promise;
            device.lose();
            gate.resolve();
        }
        await rejected;
        assert.equal(session.runCalls.length, phase === 'before run' ? 0 : 1);
        assertDisposed(gpu, phase === 'before run' ? 0 : 1);
        if(phase !== 'during map') assert.equal(device.buffers.length, 0);
        else {
            assert.equal(device.buffers[0].unmapCalls, 1);
            assert.equal(device.buffers[0].destroyCalls, 1);
        }
        await wrapper.release();
        assert.equal(session.releaseCalls, 1);
    });
}
