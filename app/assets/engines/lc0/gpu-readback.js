const MAP_READ = 0x0001, COPY_SRC = 0x0004, COPY_DST = 0x0008, READ = 0x0001;
const MAX_BATCH = 1024;
const MAX_BYTES = MAX_BATCH * (1858 + 3 + 1) * Float32Array.BYTES_PER_ELEMENT;
const HEAD_COLUMNS = new Map([
    ['/output/policy', 1858], ['/output/wdl', 3], ['/output/value', 1], ['/output/mlh', 1]
]);

function throwFailures(errors) {
    if(errors.length === 1) throw errors[0];
    if(errors.length) throw new AggregateError(errors, 'Lc0 GPU readback and cleanup failed.');
}

/**
 * Experimental, opt-in float32 readback for an ORT session created with
 * preferredOutputLocation: 'gpu-buffer', using that session's WebGPU device.
 * Takes ownership of the session and its returned tensors, never feeds or device.
 * run(feeds) only: fetches/preallocated user outputs are deliberately unsupported.
 * Results are plain dispatcher-compatible {type, dims, size, location, data} objects,
 * not ort.Tensor instances. release() closes immediately, then waits for the active
 * run before destroying staging and releasing ORT; callers must await it.
 */
export function createGpuReadbackSession(session, device) {
    let staging, running = false, idle = Promise.resolve(), releasePromise, deviceLoss;
    device.lost.then(info => {
        deviceLoss = new Error(`Lc0 WebGPU device lost (${info.reason}): ${info.message}`);
    });
    function checkDevice() {
        if(deviceLoss) throw deviceLoss;
    }

    async function readback(feeds) {
        const inputs = new Set(Object.values(feeds));
        const inputBuffers = new Set([...inputs].filter(tensor => tensor.location === 'gpu-buffer')
            .map(tensor => tensor.gpuBuffer));
        const borrowed = tensor => inputs.has(tensor) || (inputBuffers.size && tensor?.location === 'gpu-buffer'
            && inputBuffers.has(tensor.gpuBuffer));
        let outputs, result, scope, mapAttempted = false;
        const errors = [];
        try {
            checkDevice();
            outputs = await session.run(feeds);
            checkDevice();
            if(!outputs || typeof outputs !== 'object' || Array.isArray(outputs))
                throw new Error('Expected named Lc0 GPU outputs.');
            const entries = Object.entries(outputs);
            const names = new Set(entries.map(([name]) => name));
            if(!names.has('/output/policy') || names.has('/output/wdl') === names.has('/output/value'))
                throw new Error('Expected Lc0 policy and exactly one WDL or scalar value head.');
            let bytes = 0, batch;
            const heads = entries.map(([name, tensor]) => {
                const columns = HEAD_COLUMNS.get(name);
                if(!columns || !tensor || tensor.type !== 'float32' || tensor.location !== 'gpu-buffer'
                    || typeof tensor.dispose !== 'function')
                    throw new Error(`Expected float32 GPU Lc0 output ${name}.`);
                const dims = tensor.dims;
                if(!Array.isArray(dims) || dims.length !== 2 || !Number.isSafeInteger(dims[0])
                    || dims[0] < 1 || dims[0] > MAX_BATCH || dims[1] !== columns
                    || tensor.size !== dims[0] * columns || (batch !== undefined && batch !== dims[0]))
                    throw new Error(`Invalid Lc0 GPU output shape or element count: ${name}.`);
                batch = dims[0];
                if(borrowed(tensor)) throw new Error(`Lc0 GPU output aliases a user-owned input: ${name}.`);
                const buffer = tensor.gpuBuffer;
                const size = tensor.size * Float32Array.BYTES_PER_ELEMENT;
                if(!buffer || !Number.isSafeInteger(buffer.size) || buffer.size < size
                    || (buffer.usage & COPY_SRC) !== COPY_SRC)
                    throw new Error(`Invalid Lc0 GPU source buffer: ${name}.`);
                const head = { name, type: tensor.type, dims: dims.slice(), count: tensor.size, buffer, offset: bytes, size };
                bytes += size;
                return head;
            });
            if(bytes > MAX_BYTES) throw new Error('Lc0 GPU readback exceeds the batch-1024 staging limit.');

            device.pushErrorScope('validation');
            try {
                if(staging && staging.size < bytes) {
                    staging.destroy();
                    staging = undefined;
                }
                if(!staging) staging = device.createBuffer({ size: bytes, usage: MAP_READ | COPY_DST });
                const encoder = device.createCommandEncoder();
                // ORT buffers can be larger than their payload. Copy only the validated float32 elements.
                for(const head of heads)
                    encoder.copyBufferToBuffer(head.buffer, 0, staging, head.offset, head.size);
                device.queue.submit([encoder.finish()]);
            } finally {
                scope = device.popErrorScope();
            }
            mapAttempted = true;
            const statuses = await Promise.allSettled([scope, staging.mapAsync(READ, 0, bytes)]);
            scope = undefined;
            if(statuses[0].status === 'rejected') errors.push(statuses[0].reason);
            else if(statuses[0].value) errors.push(statuses[0].value);
            if(statuses[1].status === 'rejected') errors.push(statuses[1].reason);
            checkDevice();
            if(!errors.length) {
                const mapped = staging.getMappedRange(0, bytes);
                result = Object.fromEntries(heads.map(head => [head.name, {
                    type: head.type, dims: head.dims, size: head.count, location: 'cpu',
                    data: new Float32Array(mapped, head.offset, head.count).slice()
                }]));
            }
        } catch(error) {
            // Preserve failures while still attempting every independent resource cleanup below.
            errors.push(error);
        } finally {
            if(scope) {
                try {
                    const error = await scope;
                    if(error) errors.push(error);
                } catch(error) { errors.push(error); }
            }
            if(mapAttempted) {
                try { staging.unmap(); } catch(error) { errors.push(error); }
            }
            for(const tensor of new Set(Object.values(outputs || {}))) {
                try {
                    if(tensor && !borrowed(tensor) && typeof tensor.dispose === 'function') tensor.dispose();
                } catch(error) { errors.push(error); }
            }
            if(deviceLoss && !errors.includes(deviceLoss)) errors.push(deviceLoss);
            if(errors.length && staging) {
                const failedStaging = staging;
                staging = undefined;
                try { failedStaging.destroy(); } catch(error) { errors.push(error); }
            }
        }
        throwFailures(errors);
        return result;
    }

    return {
        inputNames: session.inputNames,
        outputNames: session.outputNames,
        async run(feeds, ...unsupported) {
            if(releasePromise) throw new Error('Lc0 GPU readback session is released.');
            if(running) throw new Error('Concurrent Lc0 GPU readback runs are unsupported.');
            if(unsupported.length) throw new Error('Lc0 GPU readback supports run(feeds) only, without fetches or options.');
            running = true;
            let finish;
            idle = new Promise(resolve => { finish = resolve; });
            try { return await readback(feeds); }
            finally {
                running = false;
                finish();
            }
        },
        release() {
            if(!releasePromise) releasePromise = idle.then(async () => {
                try { staging?.destroy(); }
                finally {
                    staging = undefined;
                    await session.release();
                }
            });
            return releasePromise;
        }
    };
}
