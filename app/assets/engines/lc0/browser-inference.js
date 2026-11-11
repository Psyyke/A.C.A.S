import { decodeFloat16, encodeFloat16 } from './float16.js';

export async function createBrowserInference(weights, provider, onError, dataType = 'f32') {
    if(provider !== 'webgpu' && provider !== 'wasm')
        throw new Error('Expected the webgpu or wasm inference provider.');
    if(provider === 'webgpu' && !navigator.gpu)
        throw new Error('WebGPU is not available in this browser.');
    if(!['f32', 'f16', 'f16-mixed'].includes(dataType))
        throw new Error('Expected the f32, f16 or f16-mixed inference data type.');
    if(dataType === 'f16' && provider !== 'webgpu')
        throw new Error('Float16 inference requires the WebGPU provider.');
    let adapter;
    if(dataType === 'f16') {
        adapter = await navigator.gpu.requestAdapter();
        if(!adapter || !adapter.features.has('shader-f16'))
            throw new Error('Float16 inference requires a WebGPU adapter with shader-f16 support.');
    }

    const converter = new Worker(new URL('./converter-worker.js', import.meta.url), { type: 'module' });
    let converted, returnedWeights;
    try {
        converted = await new Promise((resolve, reject) => {
            converter.onerror = event => reject(new Error(event.message || 'Lc0 converter worker failed.'));
            converter.onmessage = ({ data }) => {
                if(data.type === 'error') reject(new Error(data.message));
                if(data.type === 'converted') {
                    if(!(data.output instanceof ArrayBuffer) || !data.output.byteLength
                        || !(data.weights instanceof ArrayBuffer) || !data.weights.byteLength) {
                        reject(new Error('Lc0 converter returned invalid model or weights.'));
                        return;
                    }
                    resolve(data);
                }
            };
            converter.postMessage({ type: 'convert', weights, dataType, returnWeights: true }, [weights]);
        });
    } finally {
        converter.terminate();
    }

    returnedWeights = converted.weights;
    const ort = await import('./dist/ort.webgpu.bundle.min.mjs');
    ort.env.wasm.wasmPaths = new URL('./dist/', import.meta.url).href;
    ort.env.wasm.numThreads = 1;
    if(adapter) ort.env.webgpu.adapter = adapter;
    const session = await ort.InferenceSession.create(new Uint8Array(converted.output), {
        executionProviders: [provider]
    });
    if(session.inputNames.length !== 1 || session.inputNames[0] !== '/input/planes'
        || !session.outputNames.includes('/output/policy'))
        throw new Error('Unexpected converted Lc0 ONNX model interface.');

    return { inference: createInferenceDispatcher(ort, session, onError, dataType === 'f16-mixed' ? 'f32' : dataType),
        weights: returnedWeights };
}

export function createInferenceDispatcher(ort, session, onError, dataType = 'f32') {
    let queue = Promise.resolve();
    let failed = false;
    return (inputPtr, batch, policyPtr, valuePtr, mlhPtr, wdl, mlh, statusPtr, buffer) => {
        inputPtr >>>= 0;
        policyPtr >>>= 0;
        valuePtr >>>= 0;
        mlhPtr >>>= 0;
        statusPtr >>>= 0;
        const status = new Int32Array(buffer, statusPtr, 1);
        const finish = code => {
            Atomics.store(status, 0, code);
            Atomics.notify(status, 0);
        };
        queue = queue.then(async () => {
            if(failed) {
                finish(-1);
                return;
            }
            const input = new Float32Array(buffer, inputPtr, batch * 112 * 64).slice();
            const tensorInput = dataType === 'f16' ? Uint16Array.from(input, encodeFloat16) : input;
            const output = await session.run({
                '/input/planes': new ort.Tensor(dataType === 'f16' ? 'float16' : 'float32', tensorInput, [batch, 112, 8, 8])
            });
            function copy(name, ptr, columns) {
                const size = batch * columns;
                const tensor = output[name];
                if(!tensor || tensor.type !== (dataType === 'f16' ? 'float16' : 'float32') || tensor.data.length !== size
                    || tensor.dims.length !== 2 || tensor.dims[0] !== batch || tensor.dims[1] !== columns)
                    throw new Error(`Invalid Lc0 ONNX output ${name}.`);
                const values = dataType === 'f16' && tensor.data instanceof Uint16Array
                    ? Float32Array.from(tensor.data, decodeFloat16) : tensor.data;
                for(const value of values)
                    if(!Number.isFinite(value)) throw new Error(`Non-finite Lc0 ONNX output ${name}.`);
                new Float32Array(buffer, ptr, size).set(values);
                return values;
            }
            copy('/output/policy', policyPtr, 1858);
            const values = copy(wdl ? '/output/wdl' : '/output/value', valuePtr, wdl ? 3 : 1);
            for(let sample = 0; sample < batch; sample++) {
                if(wdl) {
                    const win = values[sample * 3], draw = values[sample * 3 + 1], loss = values[sample * 3 + 2];
                    if([win, draw, loss].some(value => value < -0.0001 || value > 1.0001)
                        || Math.abs(win + draw + loss - 1) > (dataType === 'f16' ? 0.002 : 0.001))
                        throw new Error(`Invalid Lc0 ONNX WDL probabilities: ${win}, ${draw}, ${loss}.`);
                } else if(values[sample] < -1.0001 || values[sample] > 1.0001) {
                    throw new Error('Invalid Lc0 ONNX value.');
                }
            }
            if(mlh && copy('/output/mlh', mlhPtr, 1).some(value => value < -0.0001))
                throw new Error('Invalid Lc0 ONNX moves-left value.');
            finish(1);
        }).catch(error => {
            failed = true;
            try {
                onError(`Lc0 inference failed: ${error instanceof Error ? error.message : String(error)}`);
            } finally {
                finish(-1);
            }
        });
    };
}
