import { moveCount } from './maia3-model.js';

const code = adapterSize => `
struct Settings { size: u32, rate: f32, unused: vec2u }
@group(0) @binding(0) var<storage, read_write> weights: array<f32>;
@group(0) @binding(1) var<storage, read_write> velocity: array<f32>;
@group(0) @binding(2) var<storage, read> features: array<f32>;
@group(0) @binding(3) var<storage, read> base: array<f32>;
@group(0) @binding(4) var<storage, read> targetsData: array<f32>;
@group(0) @binding(5) var<storage, read_write> errors: array<f32>;
@group(0) @binding(6) var<uniform> settings: Settings;
@compute @workgroup_size(64)
fn forward(@builtin(global_invocation_id) id: vec3u) {
    let i = id.x;
    if(i >= settings.size * ${moveCount}u) { return; }
    let row = i / ${moveCount}u; let col = i % ${moveCount}u;
    if(base[i] < -1e20) { errors[i] = -1e30; return; }
    var value = base[i] + weights[${adapterSize * moveCount}u + col];
    for(var k = 0u; k < ${adapterSize}u; k++) {
        value += features[row * ${adapterSize}u + k] * weights[k * ${moveCount}u + col];
    }
    errors[i] = value;
}
var<workgroup> reductions: array<f32, 64>;
@compute @workgroup_size(64)
fn softmax(@builtin(workgroup_id) group: vec3u, @builtin(local_invocation_index) lane: u32) {
    let row = group.x;
    let start = row * ${moveCount}u;
    var maximum = -1e30;
    for(var j = lane; j < ${moveCount}u; j += 64u) { maximum = max(maximum, errors[start + j]); }
    reductions[lane] = maximum;
    workgroupBarrier();
    for(var stride = 32u; stride > 0u; stride /= 2u) {
        if(lane < stride) { reductions[lane] = max(reductions[lane], reductions[lane + stride]); }
        workgroupBarrier();
    }
    maximum = reductions[0];
    workgroupBarrier();
    var total = 0.0;
    for(var j = lane; j < ${moveCount}u; j += 64u) { total += exp(errors[start + j] - maximum); }
    reductions[lane] = total;
    workgroupBarrier();
    for(var stride = 32u; stride > 0u; stride /= 2u) {
        if(lane < stride) { reductions[lane] += reductions[lane + stride]; }
        workgroupBarrier();
    }
    total = reductions[0];
    workgroupBarrier();
    for(var j = lane; j < ${moveCount}u; j += 64u) {
        errors[start + j] = exp(errors[start + j] - maximum) / total - targetsData[start + j];
    }
}
@compute @workgroup_size(64)
fn update(@builtin(global_invocation_id) id: vec3u) {
    let i = id.x;
    if(i >= ${(adapterSize + 1) * moveCount}u) { return; }
    let col = i % ${moveCount}u; let feature = i / ${moveCount}u;
    var gradient = 0.0;
    for(var row = 0u; row < settings.size; row++) {
        var value = 1.0;
        if(feature < ${adapterSize}u) { value = features[row * ${adapterSize}u + feature]; }
        gradient += errors[row * ${moveCount}u + col] * value;
    }
    velocity[i] = 0.9 * velocity[i] + gradient / f32(settings.size) + 0.0001 * weights[i];
    weights[i] -= settings.rate * velocity[i];
}`;

export async function createGpuAdapter(policy, maxBatch = 32) {
    const adapterSize = policy.matrix.length / moveCount;
    if(![64, 512].includes(adapterSize)) throw new Error('Unsupported Maia 3 feature size.');
    if(!navigator.gpu) throw new Error('WebGPU training is unavailable. Choose WASM CPU or a WebGPU browser.');
    const adapter = await navigator.gpu.requestAdapter();
    if(!adapter) throw new Error('No WebGPU adapter is available for training.');
    const device = await adapter.requestDevice();
    let lost;
    device.lost.then(info => { lost = info.message || 'WebGPU device was lost.'; });
    const count = (adapterSize + 1) * moveCount;
    const sizes = [count * 4, count * 4, maxBatch * adapterSize * 4,
        maxBatch * moveCount * 4, maxBatch * moveCount * 4, maxBatch * moveCount * 4, 16];
    const buffers = sizes.map((size, i) => device.createBuffer({ size,
        usage: i === 6 ? GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            : GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC }));
    const readback = device.createBuffer({ size: count * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const probabilityReadback = device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const initial = new Float32Array(count);
    initial.set(policy.matrix); initial.set(policy.bias, policy.matrix.length);
    device.queue.writeBuffer(buffers[0], 0, initial);
    const module = device.createShaderModule({ code: code(adapterSize) });
    const diagnostics = await module.getCompilationInfo();
    const errors = diagnostics.messages.filter(message => message.type === 'error');
    if(errors.length) { device.destroy(); throw new Error(errors.map(message => message.message).join('\n')); }
    const layout = device.createBindGroupLayout({ entries: buffers.map((_, binding) => ({
        binding, visibility: GPUShaderStage.COMPUTE,
        buffer: { type: binding === 6 ? 'uniform' : [2, 3, 4].includes(binding) ? 'read-only-storage' : 'storage' }
    })) });
    const pipelines = Object.fromEntries(await Promise.all(['forward', 'softmax', 'update'].map(async entryPoint =>
        [entryPoint, await device.createComputePipelineAsync({
            layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }), compute: { module, entryPoint }
        })])));
    const group = device.createBindGroup({ layout, entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })) });
    return {
        async step(samples, rate) {
            if(lost) throw new Error(lost);
            if(!samples.length || samples.length > maxBatch) throw new Error('Invalid WebGPU training batch.');
            const features = new Float32Array(samples.length * adapterSize);
            const base = new Float32Array(samples.length * moveCount).fill(-1e30);
            const targets = new Float32Array(base.length);
            samples.forEach((sample, row) => {
                features.set(sample.features, row * adapterSize);
                sample.legal.forEach((index, j) => {
                    base[row * moveCount + index] = sample.base[j];
                    targets[row * moveCount + index] = sample.targets[j];
                });
            });
            const settings = new ArrayBuffer(16), view = new DataView(settings);
            view.setUint32(0, samples.length, true); view.setFloat32(4, rate, true);
            [features, base, targets].forEach((value, i) => device.queue.writeBuffer(buffers[i + 2], 0, value));
            device.queue.writeBuffer(buffers[6], 0, settings);
            const commands = device.createCommandEncoder();
            for(const [name, groups] of [['forward', Math.ceil(base.length / 64)], ['softmax', samples.length], ['update', Math.ceil(count / 64)]]) {
                const pass = commands.beginComputePass(); pass.setPipeline(pipelines[name]);
                pass.setBindGroup(0, group); pass.dispatchWorkgroups(groups); pass.end();
            }
            const last = samples[samples.length - 1];
            commands.copyBufferToBuffer(buffers[5], ((samples.length - 1) * moveCount + last.legal[last.target]) * 4,
                probabilityReadback, 0, 4);
            device.queue.submit([commands.finish()]);
            await probabilityReadback.mapAsync(GPUMapMode.READ);
            const probability = new Float32Array(probabilityReadback.getMappedRange())[0] + last.targets[last.target];
            probabilityReadback.unmap();
            if(lost) throw new Error(lost);
            return probability;
        },
        async read() {
            if(lost) throw new Error(lost);
            const commands = device.createCommandEncoder();
            commands.copyBufferToBuffer(buffers[0], 0, readback, 0, count * 4);
            device.queue.submit([commands.finish()]);
            await readback.mapAsync(GPUMapMode.READ);
            const values = new Float32Array(readback.getMappedRange()).slice();
            readback.unmap();
            if(values.some(value => !Number.isFinite(value))) throw new Error('WebGPU training diverged. Lower the learning rate.');
            policy.matrix.set(values.subarray(0, policy.matrix.length));
            policy.bias.set(values.subarray(policy.matrix.length));
        },
        dispose() { buffers.forEach(buffer => buffer.destroy()); readback.destroy(); probabilityReadback.destroy(); device.destroy(); }
    };
}
